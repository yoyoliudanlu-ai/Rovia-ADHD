#include "cron.h"
#include "ota.h"

#include <stdio.h>

static bool s_mock_time_synced = true;
static long s_mock_time_epoch = 1712000000L;

const char *ota_get_version(void)
{
    return "test-version";
}

bool cron_is_time_synced(void)
{
    return s_mock_time_synced;
}

void cron_get_timezone(char *buf, size_t buf_len)
{
    if (!buf || buf_len == 0) {
        return;
    }
    snprintf(buf, buf_len, "UTC0");
}

void cron_get_timezone_abbrev(char *buf, size_t buf_len)
{
    if (!buf || buf_len == 0) {
        return;
    }
    snprintf(buf, buf_len, "UTC");
}

void cron_get_time_str(char *buf, size_t buf_len)
{
    if (!buf || buf_len == 0) {
        return;
    }
    snprintf(buf, buf_len, "%ld", s_mock_time_epoch);
}

esp_err_t cron_set_time_manual(time_t unix_time)
{
    if (unix_time <= 0) {
        return ESP_ERR_INVALID_ARG;
    }
    s_mock_time_epoch = (long)unix_time;
    s_mock_time_synced = true;
    return ESP_OK;
}
