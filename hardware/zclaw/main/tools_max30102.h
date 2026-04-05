#pragma once
#include "cJSON.h"
#include <stdbool.h>
#include <stddef.h>

bool tools_max30102_read_handler(const cJSON *input, char *result, size_t result_len);

/**
 * 直接读 MAX30102 并以 JSON 格式返回结果。
 * 成功：{"status":"ready","bpm":72.3,"rmssd":28.5,"sdnn":35.2,"focus":68,"stress":32}
 * 失败：{"status":"error","message":"..."}
 */
bool tools_max30102_read_json(int sda, int scl, char *out, size_t out_len);
