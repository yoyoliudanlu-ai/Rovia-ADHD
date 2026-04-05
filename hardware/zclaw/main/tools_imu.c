#include "tools_imu.h"
#include "cJSON.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static const char *TAG = "imu_icm45686";

// ── 硬件常量 ─────────────────────────────────────────────────
#define ICM45686_SPI_HOST       SPI2_HOST
#define ICM45686_SPI_FREQ_HZ    8000000   // 8 MHz，ICM-45686 最高 24 MHz

// 默认引脚（用户接法：SCLK=1, MOSI=2, MISO/SAO=3, CS=4）
#define ICM45686_DEFAULT_SCLK   1
#define ICM45686_DEFAULT_MOSI   2
#define ICM45686_DEFAULT_MISO   3
#define ICM45686_DEFAULT_CS     4

// SPI 协议：读操作 bit7 置 1
#define SPI_READ_BIT            0x80

// 寄存器地址
#define REG_ACCEL_DATA_X1       0x00   // 连续 12 字节：ACCEL XYZ + GYRO XYZ
#define REG_PWR_MGMT0           0x10
#define REG_ACCEL_CONFIG0       0x1B
#define REG_GYRO_CONFIG0        0x1C
#define REG_MISC2               0x7F   // bit1 = SOFT_RST
#define REG_WHO_AM_I            0x72

#define WHO_AM_I_ICM45686       0xE9

// PWR_MGMT0: accel + gyro 低噪声模式
#define PWR_MGMT0_LN            0x0F   // bits[1:0]=0x3 accel LN, bits[3:2]=0x3 gyro LN

// ACCEL_CONFIG0: ±16G | 100 Hz
#define ACCEL_CFG               ((0x01 << 4) | 0x09)
// GYRO_CONFIG0: ±2000 dps | 100 Hz
#define GYRO_CFG                ((0x01 << 4) | 0x09)

// 灵敏度（16 位输出）
#define ACCEL_SENS_16G          2048.0f   // LSB/g
#define GYRO_SENS_2000DPS       16.384f   // LSB/dps

// SPI 缓冲区：最多 1 字节命令 + 12 字节数据
#define SPI_BUF_LEN             13

// ── SPI 底层 ─────────────────────────────────────────────────

static esp_err_t spi_reg_write(spi_device_handle_t spi, uint8_t reg, uint8_t val)
{
    uint8_t tx[2] = {reg & 0x7F, val};   // bit7=0 → 写
    spi_transaction_t t = {
        .length    = 16,
        .tx_buffer = tx,
    };
    return spi_device_transmit(spi, &t);
}

static esp_err_t spi_reg_read(spi_device_handle_t spi, uint8_t reg,
                               uint8_t *data, size_t len)
{
    uint8_t tx[SPI_BUF_LEN] = {0};
    uint8_t rx[SPI_BUF_LEN] = {0};
    tx[0] = reg | SPI_READ_BIT;          // bit7=1 → 读

    spi_transaction_t t = {
        .length    = (len + 1) * 8,
        .tx_buffer = tx,
        .rx_buffer = rx,
    };
    esp_err_t err = spi_device_transmit(spi, &t);
    if (err == ESP_OK) {
        memcpy(data, rx + 1, len);       // rx[0] 是命令阶段的虚字节
    }
    return err;
}

// ── Tool handler ─────────────────────────────────────────────

bool tools_imu_read_handler(const cJSON *input, char *result, size_t result_len)
{
    int sclk = ICM45686_DEFAULT_SCLK;
    int mosi = ICM45686_DEFAULT_MOSI;
    int miso = ICM45686_DEFAULT_MISO;
    int cs   = ICM45686_DEFAULT_CS;

    cJSON *j;
    if ((j = cJSON_GetObjectItem(input, "sclk_pin")) && cJSON_IsNumber(j)) sclk = j->valueint;
    if ((j = cJSON_GetObjectItem(input, "mosi_pin")) && cJSON_IsNumber(j)) mosi = j->valueint;
    if ((j = cJSON_GetObjectItem(input, "miso_pin")) && cJSON_IsNumber(j)) miso = j->valueint;
    if ((j = cJSON_GetObjectItem(input, "cs_pin"))   && cJSON_IsNumber(j)) cs   = j->valueint;

    // 初始化 SPI 总线
    spi_bus_config_t buscfg = {
        .mosi_io_num     = mosi,
        .miso_io_num     = miso,
        .sclk_io_num     = sclk,
        .quadwp_io_num   = -1,
        .quadhd_io_num   = -1,
        .max_transfer_sz = SPI_BUF_LEN,
    };
    esp_err_t err = spi_bus_initialize(ICM45686_SPI_HOST, &buscfg, SPI_DMA_CH_AUTO);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        // ESP_ERR_INVALID_STATE 表示总线已初始化，可继续复用
        snprintf(result, result_len, "Error: SPI bus init failed (%s)", esp_err_to_name(err));
        return false;
    }

    // 添加设备（SPI Mode 0，CS 低电平有效）
    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = ICM45686_SPI_FREQ_HZ,
        .mode           = 0,             // CPOL=0, CPHA=0
        .spics_io_num   = cs,
        .queue_size     = 1,
    };
    spi_device_handle_t spi;
    err = spi_bus_add_device(ICM45686_SPI_HOST, &devcfg, &spi);
    if (err != ESP_OK) {
        snprintf(result, result_len, "Error: SPI add device failed (%s)", esp_err_to_name(err));
        spi_bus_free(ICM45686_SPI_HOST);
        return false;
    }

    // 软复位，等待 25ms
    spi_reg_write(spi, REG_MISC2, 0x02);
    vTaskDelay(pdMS_TO_TICKS(25));

    // 验证 WHO_AM_I
    uint8_t who = 0;
    err = spi_reg_read(spi, REG_WHO_AM_I, &who, 1);
    if (err != ESP_OK) {
        snprintf(result, result_len,
                 "Error: SPI read failed (%s). Check wiring: SCLK=%d MOSI=%d MISO=%d CS=%d",
                 esp_err_to_name(err), sclk, mosi, miso, cs);
        spi_bus_remove_device(spi);
        spi_bus_free(ICM45686_SPI_HOST);
        return false;
    }
    if (who != WHO_AM_I_ICM45686) {
        snprintf(result, result_len,
                 "Error: unexpected WHO_AM_I=0x%02X (expected 0x%02X for ICM-45686)",
                 who, WHO_AM_I_ICM45686);
        spi_bus_remove_device(spi);
        spi_bus_free(ICM45686_SPI_HOST);
        return false;
    }

    ESP_LOGI(TAG, "ICM-45686 detected");

    // 配置传感器
    spi_reg_write(spi, REG_ACCEL_CONFIG0, ACCEL_CFG);
    spi_reg_write(spi, REG_GYRO_CONFIG0,  GYRO_CFG);
    spi_reg_write(spi, REG_PWR_MGMT0,     PWR_MGMT0_LN);

    // 等待陀螺仪启动（min 35ms）
    vTaskDelay(pdMS_TO_TICKS(50));

    // 连续读 12 字节：ACCEL XYZ（0x00-0x05）+ GYRO XYZ（0x06-0x0B）
    uint8_t raw[12];
    err = spi_reg_read(spi, REG_ACCEL_DATA_X1, raw, sizeof(raw));

    spi_bus_remove_device(spi);
    spi_bus_free(ICM45686_SPI_HOST);

    if (err != ESP_OK) {
        snprintf(result, result_len, "Error: data read failed (%s)", esp_err_to_name(err));
        return false;
    }

    // 大端 → 有符号 16 位
    int16_t ax_raw = (int16_t)((raw[0]  << 8) | raw[1]);
    int16_t ay_raw = (int16_t)((raw[2]  << 8) | raw[3]);
    int16_t az_raw = (int16_t)((raw[4]  << 8) | raw[5]);
    int16_t gx_raw = (int16_t)((raw[6]  << 8) | raw[7]);
    int16_t gy_raw = (int16_t)((raw[8]  << 8) | raw[9]);
    int16_t gz_raw = (int16_t)((raw[10] << 8) | raw[11]);

    // 转换为物理量
    float ax = (float)ax_raw / ACCEL_SENS_16G;
    float ay = (float)ay_raw / ACCEL_SENS_16G;
    float az = (float)az_raw / ACCEL_SENS_16G;
    float gx = (float)gx_raw / GYRO_SENS_2000DPS;
    float gy = (float)gy_raw / GYRO_SENS_2000DPS;
    float gz = (float)gz_raw / GYRO_SENS_2000DPS;

    snprintf(result, result_len,
             "{\"accel_g\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f},"
             "\"gyro_dps\":{\"x\":%.2f,\"y\":%.2f,\"z\":%.2f},"
             "\"config\":{\"accel_range\":\"\\u00b116G\",\"gyro_range\":\"\\u00b12000dps\",\"odr_hz\":100}}",
             ax, ay, az, gx, gy, gz);

    return true;
}
