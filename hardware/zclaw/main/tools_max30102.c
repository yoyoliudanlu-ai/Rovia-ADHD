#include "tools_max30102.h"
#include "cJSON.h"
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "max30102";

// ── 硬件常量 ───────────────────────────────────────────────
#define MAX30102_ADDR       0x57
#define MAX30102_PORT       I2C_NUM_0
#define MAX30102_FREQ_HZ    400000

// 寄存器地址
#define REG_INT_STATUS1     0x00
#define REG_FIFO_WR_PTR     0x04
#define REG_OVF_COUNTER     0x05
#define REG_FIFO_RD_PTR     0x06
#define REG_FIFO_DATA       0x07
#define REG_FIFO_CONFIG     0x08
#define REG_MODE_CONFIG     0x09
#define REG_SPO2_CONFIG     0x0A
#define REG_LED1_PA         0x0C
#define REG_PART_ID         0xFF

// ── 采样参数 ───────────────────────────────────────────────
#define SAMPLE_RATE_HZ      100     // 100Hz
#define DURATION_S          8       // 采 8 秒
#define NUM_SAMPLES         (SAMPLE_RATE_HZ * DURATION_S)
#define WARMUP_SAMPLES      50
#define MA_LEN              5       // 移动平均窗口

// ── I2C 底层 ───────────────────────────────────────────────
static esp_err_t i2c_init(int sda, int scl)
{
    i2c_driver_delete(MAX30102_PORT);
    i2c_config_t cfg = {
        .mode             = I2C_MODE_MASTER,
        .sda_io_num       = sda,
        .scl_io_num       = scl,
        .sda_pullup_en    = GPIO_PULLUP_ENABLE,
        .scl_pullup_en    = GPIO_PULLUP_ENABLE,
        .master.clk_speed = MAX30102_FREQ_HZ,
    };
    esp_err_t err = i2c_param_config(MAX30102_PORT, &cfg);
    if (err != ESP_OK) return err;
    return i2c_driver_install(MAX30102_PORT, cfg.mode, 0, 0, 0);
}

static esp_err_t write_reg(uint8_t reg, uint8_t val)
{
    uint8_t buf[2] = {reg, val};
    return i2c_master_write_to_device(MAX30102_PORT, MAX30102_ADDR,
                                      buf, 2, pdMS_TO_TICKS(100));
}

static esp_err_t read_reg(uint8_t reg, uint8_t *out, size_t len)
{
    return i2c_master_write_read_device(MAX30102_PORT, MAX30102_ADDR,
                                        &reg, 1, out, len, pdMS_TO_TICKS(100));
}

// ── 传感器初始化 ───────────────────────────────────────────
static bool init_sensor(void)
{
    // 验证芯片 ID
    uint8_t id = 0;
    if (read_reg(REG_PART_ID, &id, 1) != ESP_OK || id != 0x15) {
        ESP_LOGE(TAG, "Part ID mismatch: 0x%02X (expect 0x15)", id);
        return false;
    }
    // 软复位，等待完成
    write_reg(REG_MODE_CONFIG, 0x40);
    vTaskDelay(pdMS_TO_TICKS(10));

    // 心率模式（仅红光）
    write_reg(REG_MODE_CONFIG, 0x02);
    // 100Hz，411μs 脉宽，4096 ADC 量程
    write_reg(REG_SPO2_CONFIG, 0x27);
    // 红光 LED 电流 ~7mA
    write_reg(REG_LED1_PA, 0x24);
    // FIFO：4 样本平均，允许 rollover，几乎满时中断
    write_reg(REG_FIFO_CONFIG, 0x4F);
    // 清空 FIFO 指针
    write_reg(REG_FIFO_WR_PTR, 0x00);
    write_reg(REG_OVF_COUNTER, 0x00);
    write_reg(REG_FIFO_RD_PTR, 0x00);

    return true;
}

// ── 读一个 FIFO 样本（3 字节 → 18 位 ADC 值）───────────────
static uint32_t read_sample(void)
{
    uint8_t buf[3];
    uint8_t reg = REG_FIFO_DATA;
    if (i2c_master_write_read_device(MAX30102_PORT, MAX30102_ADDR,
                                     &reg, 1, buf, 3, pdMS_TO_TICKS(100)) != ESP_OK) {
        return 0;
    }
    return ((uint32_t)(buf[0] & 0x03) << 16) |
           ((uint32_t)buf[1] << 8) |
            (uint32_t)buf[2];
}

// ── 移动平均滤波（原地修改）────────────────────────────────
static void moving_avg(uint32_t *data, int len)
{
    for (int i = MA_LEN; i < len; i++) {
        uint32_t s = 0;
        for (int j = 0; j < MA_LEN; j++) s += data[i - j];
        data[i] = s / MA_LEN;
    }
}

// ── 峰值检测，返回峰值索引数量 ─────────────────────────────
// 算法：寻找局部极大值，超过均值的 125%，且两峰间距 ≥ 200ms
static int find_peaks(const uint32_t *data, int len,
                      int *peaks, int max_peaks)
{
    // 计算均值
    uint64_t sum = 0;
    for (int i = 0; i < len; i++) sum += data[i];
    uint32_t threshold = (uint32_t)(sum / len * 5 / 4); // 125% 均值

    int min_dist = SAMPLE_RATE_HZ / 5; // 200ms = 最高 300bpm
    int last = -min_dist;
    int count = 0;

    for (int i = 2; i < len - 2 && count < max_peaks; i++) {
        if (data[i] > threshold &&
            data[i] > data[i-1] && data[i] > data[i-2] &&
            data[i] > data[i+1] && data[i] > data[i+2] &&
            (i - last) >= min_dist) {
            peaks[count++] = i;
            last = i;
        }
    }
    return count;
}

// ── 工具入口 ───────────────────────────────────────────────
bool tools_max30102_read_handler(const cJSON *input, char *result, size_t result_len)
{
    cJSON *sda_j = cJSON_GetObjectItem(input, "sda_pin");
    cJSON *scl_j = cJSON_GetObjectItem(input, "scl_pin");
    if (!sda_j || !scl_j) {
        snprintf(result, result_len, "Error: sda_pin and scl_pin required");
        return false;
    }
    int sda = sda_j->valueint;
    int scl = scl_j->valueint;

    // I2C 初始化
    if (i2c_init(sda, scl) != ESP_OK) {
        snprintf(result, result_len,
                 "Error: I2C init failed (SDA=%d SCL=%d)", sda, scl);
        return false;
    }

    // 传感器初始化
    if (!init_sensor()) {
        i2c_driver_delete(MAX30102_PORT);
        snprintf(result, result_len,
                 "Error: MAX30102 not found at 0x57. Check wiring.");
        return false;
    }

    // 分配样本缓冲区
    uint32_t *buf = malloc(NUM_SAMPLES * sizeof(uint32_t));
    if (!buf) {
        i2c_driver_delete(MAX30102_PORT);
        snprintf(result, result_len, "Error: out of memory");
        return false;
    }

    // 预热：丢弃前 50 个样本
    vTaskDelay(pdMS_TO_TICKS(500));
    for (int i = 0; i < WARMUP_SAMPLES; i++) {
        read_sample();
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    // 采样主循环
    int n = 0;
    TickType_t deadline = xTaskGetTickCount() +
                          pdMS_TO_TICKS((DURATION_S + 3) * 1000);

    while (n < NUM_SAMPLES && xTaskGetTickCount() < deadline) {
        uint8_t wr, rd;
        read_reg(REG_FIFO_WR_PTR, &wr, 1);
        read_reg(REG_FIFO_RD_PTR, &rd, 1);
        int avail = (int)(wr - rd) & 0x1F;
        for (int i = 0; i < avail && n < NUM_SAMPLES; i++) {
            buf[n++] = read_sample();
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    i2c_driver_delete(MAX30102_PORT);

    // 样本不足（手指未放好）
    if (n < SAMPLE_RATE_HZ * 4) {
        free(buf);
        snprintf(result, result_len,
                 "Error: only %d samples (need %d). Place finger firmly.",
                 n, SAMPLE_RATE_HZ * 4);
        return false;
    }

    // 滤波
    moving_avg(buf, n);

    // 峰值检测
    int peaks[128];
    int np = find_peaks(buf, n, peaks, 128);
    free(buf);

    if (np < 3) {
        snprintf(result, result_len,
                 "Error: only %d peaks detected. Check finger placement.", np);
        return false;
    }

    // ── HRV 指标计算 ──────────────────────────────────────
    int ibi_n = np - 1;
    float ibis[127];
    for (int i = 0; i < ibi_n; i++) {
        ibis[i] = (float)(peaks[i+1] - peaks[i]) * 1000.0f / SAMPLE_RATE_HZ;
    }

    // 平均 IBI → BPM
    float ibi_sum = 0;
    for (int i = 0; i < ibi_n; i++) ibi_sum += ibis[i];
    float mean_ibi = ibi_sum / ibi_n;
    float bpm = 60000.0f / mean_ibi;

    // SDNN（NN 间期标准差）
    float sq = 0;
    for (int i = 0; i < ibi_n; i++) {
        float d = ibis[i] - mean_ibi;
        sq += d * d;
    }
    float sdnn = sqrtf(sq / ibi_n);

    // RMSSD（相邻 NN 差值的均方根，最重要的 HRV 指标）
    float rmssd_sq = 0;
    for (int i = 0; i < ibi_n - 1; i++) {
        float d = ibis[i+1] - ibis[i];
        rmssd_sq += d * d;
    }
    float rmssd = sqrtf(rmssd_sq / (ibi_n - 1));

    // pNN50（相邻差 >50ms 的占比）
    int nn50 = 0;
    for (int i = 0; i < ibi_n - 1; i++) {
        if (fabsf(ibis[i+1] - ibis[i]) > 50.0f) nn50++;
    }
    float pnn50 = (float)nn50 / (ibi_n - 1) * 100.0f;

    // ── Baevsky 压力指数（SI）────────────────────────────────
    // SI = AMo / (2 * Mo * MxDMn)
    // Mo   = IBI 直方图众数（最频繁的 IBI 区间中点，单位 ms）
    // AMo  = 众数区间占比（%）
    // MxDMn = 最大 IBI - 最小 IBI（变异范围）
    float ibi_min = ibis[0], ibi_max = ibis[0];
    for (int i = 1; i < ibi_n; i++) {
        if (ibis[i] < ibi_min) ibi_min = ibis[i];
        if (ibis[i] > ibi_max) ibi_max = ibis[i];
    }
    float mxdmn = ibi_max - ibi_min;

    // 以 50ms 为区间宽度建直方图
    #define HIST_BINS 20
    #define BIN_WIDTH 50.0f
    int hist[HIST_BINS] = {0};
    float hist_base = ibi_min;
    for (int i = 0; i < ibi_n; i++) {
        int bin = (int)((ibis[i] - hist_base) / BIN_WIDTH);
        if (bin < 0) bin = 0;
        if (bin >= HIST_BINS) bin = HIST_BINS - 1;
        hist[bin]++;
    }
    int mode_bin = 0;
    for (int i = 1; i < HIST_BINS; i++) {
        if (hist[i] > hist[mode_bin]) mode_bin = i;
    }
    float mo   = hist_base + (mode_bin + 0.5f) * BIN_WIDTH;  // 众数中点
    float amo  = (float)hist[mode_bin] / ibi_n * 100.0f;     // 众数占比%
    float si   = (mxdmn > 0.1f) ? (amo / (2.0f * mo * mxdmn / 1000.0f)) : 999.0f;

    // ── 专注度评分（0–100）──────────────────────────────────
    // 模型：专注态 = 交感激活 + 非焦虑
    //   HR 贡献：65–85 BPM 为最佳专注区间，峰值在 75
    //   RMSSD 贡献：20–50ms 为专注区间，<20 焦虑，>80 放松
    //   SI 贡献：100–300 为专注区间，<50 过于放松，>500 焦虑
    //
    // 每项 0–1 得分后加权平均 → 乘以 100

    // HR 分（梯形：65 爬升，70 满分，85 满分，95 归零）
    float hr_score;
    if      (bpm < 60)  hr_score = 0.0f;
    else if (bpm < 68)  hr_score = (bpm - 60) / 8.0f;
    else if (bpm <= 85) hr_score = 1.0f;
    else if (bpm <= 95) hr_score = (95 - bpm) / 10.0f;
    else                hr_score = 0.0f;

    // RMSSD 分（专注区间 15–45ms，倒 U，超出两侧线性衰减）
    float rmssd_score;
    if      (rmssd < 10)  rmssd_score = 0.0f;
    else if (rmssd < 20)  rmssd_score = (rmssd - 10) / 10.0f;
    else if (rmssd <= 45) rmssd_score = 1.0f;
    else if (rmssd <= 80) rmssd_score = (80 - rmssd) / 35.0f;
    else                  rmssd_score = 0.0f;

    // SI 分（100–400 为专注，两侧衰减）
    float si_score;
    if      (si < 50)   si_score = 0.0f;
    else if (si < 100)  si_score = (si - 50) / 50.0f;
    else if (si <= 400) si_score = 1.0f;
    else if (si <= 600) si_score = (600 - si) / 200.0f;
    else                si_score = 0.0f;

    // 加权：RMSSD 权重最高（0.5），HR 次之（0.3），SI 辅助（0.2）
    float focus = (hr_score * 0.3f + rmssd_score * 0.5f + si_score * 0.2f) * 100.0f;

    // 状态标签
    const char *state;
    if      (focus >= 75) state = "专注";
    else if (focus >= 50) state = "一般";
    else if (rmssd > 70)  state = "放松/困倦";
    else                  state = "紧张/焦虑";

    snprintf(result, result_len,
             "MAX30102  SDA=%d SCL=%d  %ds  %d beats\n"
             "专注度: %.0f/100  [%s]\n"
             "---\n"
             "HR:    %.1f BPM\n"
             "RMSSD: %.1f ms  (低=交感激活)\n"
             "SDNN:  %.1f ms\n"
             "pNN50: %.1f%%\n"
             "SI:    %.0f  (压力指数)",
             sda, scl, n / SAMPLE_RATE_HZ, np,
             focus, state,
             bpm, rmssd, sdnn, pnn50, si);

    return true;
}

// ── JSON 输出版本（供 HRV HTTP 服务器调用）────────────────────
bool tools_max30102_read_json(int sda, int scl, char *out, size_t out_len)
{
    cJSON *input = cJSON_CreateObject();
    if (!input) {
        snprintf(out, out_len, "{\"status\":\"error\",\"message\":\"oom\"}");
        return false;
    }
    cJSON_AddNumberToObject(input, "sda_pin", sda);
    cJSON_AddNumberToObject(input, "scl_pin", scl);

    char text[512];
    bool ok = tools_max30102_read_handler(input, text, sizeof(text));
    cJSON_Delete(input);

    if (!ok) {
        snprintf(out, out_len, "{\"status\":\"error\",\"message\":\"%s\"}", text);
        return false;
    }

    // 从文本结果提取数值
    float bpm = 0, rmssd = 0, sdnn = 0, focus = 0;
    const char *p;
    if ((p = strstr(text, "HR:")) != NULL)     sscanf(p, "HR:    %f BPM", &bpm);
    if ((p = strstr(text, "RMSSD:")) != NULL)  sscanf(p, "RMSSD: %f ms", &rmssd);
    if ((p = strstr(text, "SDNN:")) != NULL)   sscanf(p, "SDNN:  %f ms", &sdnn);
    if ((p = strstr(text, "\xe4\xb8\x93\xe6\xb3\xa8\xe5\xba\xa6:")) != NULL)
        sscanf(p + 9, " %f/100", &focus);   // "专注度:" is 9 UTF-8 bytes

    int stress = 100 - (int)focus;
    if (stress < 0) stress = 0;
    if (stress > 100) stress = 100;

    snprintf(out, out_len,
             "{\"status\":\"ready\","
             "\"bpm\":%.1f,"
             "\"rmssd\":%.1f,"
             "\"sdnn\":%.1f,"
             "\"focus\":%d,"
             "\"stress\":%d}",
             bpm, rmssd, sdnn, (int)focus, stress);
    return true;
}
