/**
 * HRV HTTP 服务器
 * - 后台任务每 60s 读一次 MAX30102，缓存 JSON 结果
 * - GET /ping  → {"status":"ok"}
 * - GET /hrv   → 最新 HRV 测量值（JSON）
 */
#include "hrv_server.h"
#include "tools_max30102.h"

#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include <string.h>
#include <stdio.h>

static const char *TAG = "hrv_server";

// ── I2C 引脚（根据实际接线修改）──────────────────────────────
#ifndef HRV_SDA_PIN
#define HRV_SDA_PIN 2
#endif
#ifndef HRV_SCL_PIN
#define HRV_SCL_PIN 3
#endif

// ── 轮询间隔 ─────────────────────────────────────────────────
#define HRV_POLL_INTERVAL_MS  (60 * 1000)

// ── 缓存 ─────────────────────────────────────────────────────
#define CACHE_BUF_SIZE 256
static char              s_cache[CACHE_BUF_SIZE];
static int64_t           s_cache_ts_us = 0;      // esp_timer_get_time()
static SemaphoreHandle_t s_mutex       = NULL;

static httpd_handle_t    s_server      = NULL;

// ── 刷新缓存（后台任务调用）──────────────────────────────────
static void refresh_cache(void)
{
    char buf[CACHE_BUF_SIZE];
    bool ok = tools_max30102_read_json(HRV_SDA_PIN, HRV_SCL_PIN, buf, sizeof(buf));

    xSemaphoreTake(s_mutex, portMAX_DELAY);
    if (ok) {
        // 注入时间戳
        int64_t ts_s = esp_timer_get_time() / 1000000LL;
        int len = (int)strlen(buf);
        if (len > 1 && buf[len - 1] == '}') {
            snprintf(s_cache, sizeof(s_cache),
                     "%.*s,\"ts\":%lld}",
                     len - 1, buf,
                     (long long)ts_s);
        } else {
            strncpy(s_cache, buf, sizeof(s_cache) - 1);
            s_cache[sizeof(s_cache) - 1] = '\0';
        }
    } else {
        // 截断 buf 以防止 format-truncation 警告（错误描述最多 180 字节）
        char msg[180];
        strncpy(msg, buf, sizeof(msg) - 1);
        msg[sizeof(msg) - 1] = '\0';
        snprintf(s_cache, sizeof(s_cache),
                 "{\"status\":\"error\",\"message\":\"%s\"}", msg);
    }
    s_cache_ts_us = esp_timer_get_time();
    xSemaphoreGive(s_mutex);

    ESP_LOGI(TAG, "HRV refreshed: %s", s_cache);
}

// ── 后台轮询任务 ──────────────────────────────────────────────
static void hrv_poll_task(void *arg)
{
    // 第一次立即测量
    refresh_cache();

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(HRV_POLL_INTERVAL_MS));
        refresh_cache();
    }
}

// ── HTTP 处理器 ───────────────────────────────────────────────
static esp_err_t ping_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_sendstr(req, "{\"status\":\"ok\"}");
    return ESP_OK;
}

static esp_err_t hrv_handler(httpd_req_t *req)
{
    char response[CACHE_BUF_SIZE];
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    strncpy(response, s_cache, sizeof(response) - 1);
    response[sizeof(response) - 1] = '\0';
    xSemaphoreGive(s_mutex);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_sendstr(req, response);
    return ESP_OK;
}

// ── 公开接口 ─────────────────────────────────────────────────
esp_err_t hrv_server_start(void)
{
    if (s_server) {
        ESP_LOGW(TAG, "already started");
        return ESP_OK;
    }

    // 初始缓存
    s_mutex = xSemaphoreCreateMutex();
    if (!s_mutex) return ESP_ERR_NO_MEM;
    strncpy(s_cache, "{\"status\":\"warming_up\"}", sizeof(s_cache) - 1);

    // 启动后台轮询任务
    if (xTaskCreate(hrv_poll_task, "hrv_poll", 8192, NULL, 3, NULL) != pdPASS) {
        vSemaphoreDelete(s_mutex);
        return ESP_ERR_NO_MEM;
    }

    // 启动 HTTP 服务器（端口 8080）
    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.server_port    = 8080;
    cfg.uri_match_fn   = httpd_uri_match_wildcard;

    esp_err_t err = httpd_start(&s_server, &cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed: %s", esp_err_to_name(err));
        return err;
    }

    httpd_uri_t ping_uri = {
        .uri     = "/ping",
        .method  = HTTP_GET,
        .handler = ping_handler,
    };
    httpd_uri_t hrv_uri = {
        .uri     = "/hrv",
        .method  = HTTP_GET,
        .handler = hrv_handler,
    };
    httpd_register_uri_handler(s_server, &ping_uri);
    httpd_register_uri_handler(s_server, &hrv_uri);

    ESP_LOGI(TAG, "HRV HTTP server started on port 8080");
    return ESP_OK;
}

void hrv_server_stop(void)
{
    if (s_server) {
        httpd_stop(s_server);
        s_server = NULL;
    }
}
