#pragma once
#include "cJSON.h"
#include <stdbool.h>
#include <stddef.h>

bool tools_imu_read_handler(const cJSON *input, char *result, size_t result_len);
