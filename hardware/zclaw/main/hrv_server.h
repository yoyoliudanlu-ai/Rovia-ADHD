#pragma once
#include "esp_err.h"

/**
 * 启动 HRV HTTP 服务器（端口 8080）。
 * 需在 WiFi 连接后调用。
 *
 * 端点：
 *   GET /ping  → {"status":"ok"}
 *   GET /hrv   → 最新 MAX30102 测量结果（JSON）
 *
 * 后台任务每 60 秒读一次 MAX30102，结果缓存在内存中。
 */
esp_err_t hrv_server_start(void);
void      hrv_server_stop(void);
