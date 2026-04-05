#include "tools_handlers.h"
#include "config.h"
#include "memory.h"
#include "nvs_keys.h"
#include "tools_common.h"

#include "cJSON.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef TEST_BUILD
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#endif

typedef struct {
    char url[SUPABASE_URL_MAX_LEN + 1];
    char key[SUPABASE_KEY_MAX_LEN + 1];
    char table[SUPABASE_TABLE_MAX_LEN + 1];
    char user_field[SUPABASE_FIELD_MAX_LEN + 1];
    char user_id[SUPABASE_USER_ID_MAX_LEN + 1];
    char text_field[SUPABASE_FIELD_MAX_LEN + 1];
    char done_field[SUPABASE_FIELD_MAX_LEN + 1];
    char created_field[SUPABASE_FIELD_MAX_LEN + 1];
} supabase_todo_config_t;

typedef struct {
    const char *filter;
    int limit;
} supabase_todo_query_t;

static bool load_required_config_value(const char *key,
                                       char *value,
                                       size_t value_len,
                                       char *result,
                                       size_t result_len)
{
    if (!memory_get(key, value, value_len) || value[0] == '\0') {
        snprintf(result, result_len, "Error: Supabase config missing: %s", key);
        return false;
    }
    return true;
}

static bool validate_identifier(const char *value,
                                const char *label,
                                char *result,
                                size_t result_len)
{
    char error[96] = {0};

    if (!tools_validate_string_input(value, SUPABASE_FIELD_MAX_LEN, error, sizeof(error))) {
        snprintf(result, result_len, "Error: invalid %s: %s", label, error);
        return false;
    }
    if (!tools_validate_nvs_key(value, error, sizeof(error))) {
        snprintf(result, result_len, "Error: invalid %s: %s", label, error);
        return false;
    }
    return true;
}

static bool load_supabase_todo_config(supabase_todo_config_t *config,
                                      char *result,
                                      size_t result_len)
{
    char error[96] = {0};

    if (!config) {
        snprintf(result, result_len, "Error: internal config state missing");
        return false;
    }

    memset(config, 0, sizeof(*config));

    if (!load_required_config_value(NVS_KEY_SB_URL, config->url, sizeof(config->url),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_KEY, config->key, sizeof(config->key),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_TABLE, config->table, sizeof(config->table),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_USER_FIELD, config->user_field, sizeof(config->user_field),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_USER_ID, config->user_id, sizeof(config->user_id),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_TEXT_FIELD, config->text_field, sizeof(config->text_field),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_DONE_FIELD, config->done_field, sizeof(config->done_field),
                                    result, result_len) ||
        !load_required_config_value(NVS_KEY_SB_CTIME_FIELD, config->created_field, sizeof(config->created_field),
                                    result, result_len)) {
        return false;
    }

    if (!tools_validate_https_url(config->url, error, sizeof(error))) {
        snprintf(result, result_len, "%s", error);
        return false;
    }

    if (!validate_identifier(config->table, "table", result, result_len) ||
        !validate_identifier(config->user_field, "user field", result, result_len) ||
        !validate_identifier(config->text_field, "text field", result, result_len) ||
        !validate_identifier(config->done_field, "done field", result, result_len) ||
        !validate_identifier(config->created_field, "created field", result, result_len)) {
        return false;
    }

    if (!tools_validate_string_input(config->user_id, SUPABASE_USER_ID_MAX_LEN, error, sizeof(error))) {
        snprintf(result, result_len, "Error: invalid Supabase user id: %s", error);
        return false;
    }

    return true;
}

static bool parse_query_args(const cJSON *input,
                             supabase_todo_query_t *query,
                             char *result,
                             size_t result_len)
{
    const cJSON *filter_json;
    const cJSON *limit_json;

    query->filter = "all";
    query->limit = SUPABASE_TODO_LIMIT_DEFAULT;

    if (!input) {
        return true;
    }

    filter_json = cJSON_GetObjectItemCaseSensitive((cJSON *)input, "filter");
    if (filter_json) {
        if (!cJSON_IsString(filter_json) || !filter_json->valuestring || filter_json->valuestring[0] == '\0') {
            snprintf(result, result_len, "Error: filter must be one of all|open|completed");
            return false;
        }
        if (strcmp(filter_json->valuestring, "all") != 0 &&
            strcmp(filter_json->valuestring, "open") != 0 &&
            strcmp(filter_json->valuestring, "completed") != 0) {
            snprintf(result, result_len, "Error: filter must be one of all|open|completed");
            return false;
        }
        query->filter = filter_json->valuestring;
    }

    limit_json = cJSON_GetObjectItemCaseSensitive((cJSON *)input, "limit");
    if (limit_json) {
        if (!cJSON_IsNumber(limit_json)) {
            snprintf(result, result_len, "Error: limit must be an integer");
            return false;
        }
        if (limit_json->valueint < 1 || limit_json->valueint > SUPABASE_TODO_LIMIT_MAX) {
            snprintf(result, result_len, "Error: limit must be 1-%d", SUPABASE_TODO_LIMIT_MAX);
            return false;
        }
        query->limit = limit_json->valueint;
    }

    return true;
}

static void copy_without_trailing_slash(char *dst, size_t dst_len, const char *src)
{
    size_t len;

    if (!dst || dst_len == 0) {
        return;
    }

    if (!src) {
        dst[0] = '\0';
        return;
    }

    snprintf(dst, dst_len, "%s", src);
    len = strlen(dst);
    while (len > 0 && dst[len - 1] == '/') {
        dst[len - 1] = '\0';
        len--;
    }
}

static bool build_request_url(const supabase_todo_config_t *config,
                              const supabase_todo_query_t *query,
                              char *url,
                              size_t url_len,
                              char *result,
                              size_t result_len)
{
    char base_url[SUPABASE_URL_MAX_LEN + 1];
    const char *done_value = NULL;
    int written;

    if (!config || !query || !url || url_len == 0) {
        snprintf(result, result_len, "Error: internal URL builder state missing");
        return false;
    }

    copy_without_trailing_slash(base_url, sizeof(base_url), config->url);
    if (strcmp(query->filter, "open") == 0) {
        done_value = "false";
    } else if (strcmp(query->filter, "completed") == 0) {
        done_value = "true";
    }

    if (done_value) {
        written = snprintf(url, url_len,
                           "%s/rest/v1/%s?select=id,%s,%s,%s&%s=eq.%s&%s=eq.%s&order=%s.desc.nullslast&limit=%d",
                           base_url,
                           config->table,
                           config->text_field,
                           config->done_field,
                           config->created_field,
                           config->user_field,
                           config->user_id,
                           config->done_field,
                           done_value,
                           config->created_field,
                           query->limit);
    } else {
        written = snprintf(url, url_len,
                           "%s/rest/v1/%s?select=id,%s,%s,%s&%s=eq.%s&order=%s.desc.nullslast&limit=%d",
                           base_url,
                           config->table,
                           config->text_field,
                           config->done_field,
                           config->created_field,
                           config->user_field,
                           config->user_id,
                           config->created_field,
                           query->limit);
    }

    if (written < 0 || (size_t)written >= url_len) {
        snprintf(result, result_len, "Error: Supabase request URL too long");
        return false;
    }

    return true;
}

static bool json_item_is_truthy(const cJSON *item)
{
    if (!item) {
        return false;
    }
    if (cJSON_IsBool(item)) {
        return cJSON_IsTrue(item);
    }
    if (cJSON_IsNumber(item)) {
        return item->valuedouble != 0.0;
    }
    if (cJSON_IsString(item) && item->valuestring) {
        return strcmp(item->valuestring, "true") == 0 ||
               strcmp(item->valuestring, "1") == 0 ||
               strcmp(item->valuestring, "completed") == 0 ||
               strcmp(item->valuestring, "done") == 0;
    }
    return false;
}

static void json_item_to_text(const cJSON *item, char *buf, size_t buf_len)
{
    if (!buf || buf_len == 0) {
        return;
    }

    if (!item) {
        buf[0] = '\0';
        return;
    }
    if (cJSON_IsString(item) && item->valuestring) {
        snprintf(buf, buf_len, "%s", item->valuestring);
        return;
    }
    if (cJSON_IsNumber(item)) {
        snprintf(buf, buf_len, "%d", item->valueint);
        return;
    }

    buf[0] = '\0';
}

static void shorten_iso_time(const char *raw, char *buf, size_t buf_len)
{
    if (!buf || buf_len == 0) {
        return;
    }
    if (!raw || raw[0] == '\0') {
        buf[0] = '\0';
        return;
    }
    if (strlen(raw) >= 16) {
        snprintf(buf, buf_len, "%.16s", raw);
        return;
    }
    snprintf(buf, buf_len, "%s", raw);
}

#ifdef TEST_BUILD
static int s_test_http_status = 200;
static char s_test_http_body[SUPABASE_RESPONSE_BUF_SIZE] = "[]";
static char s_test_last_request_url[SUPABASE_REQUEST_URL_BUF_SIZE] = {0};

void tools_supabase_test_reset(void)
{
    s_test_http_status = 200;
    snprintf(s_test_http_body, sizeof(s_test_http_body), "[]");
    s_test_last_request_url[0] = '\0';
}

void tools_supabase_test_set_http_response(int status_code, const char *body)
{
    s_test_http_status = status_code;
    snprintf(s_test_http_body, sizeof(s_test_http_body), "%s", body ? body : "[]");
}

const char *tools_supabase_test_last_request_url(void)
{
    return s_test_last_request_url;
}

static esp_err_t supabase_http_get(const supabase_todo_config_t *config,
                                   const char *url,
                                   char *response,
                                   size_t response_len,
                                   int *status_code)
{
    (void)config;

    if (!response || response_len == 0 || !status_code) {
        return ESP_ERR_INVALID_ARG;
    }

    snprintf(s_test_last_request_url, sizeof(s_test_last_request_url), "%s", url ? url : "");
    snprintf(response, response_len, "%s", s_test_http_body);
    *status_code = s_test_http_status;
    return ESP_OK;
}
#else
typedef struct {
    char *buf;
    size_t len;
    size_t max;
    bool truncated;
} supabase_http_ctx_t;

static esp_err_t supabase_http_event_handler(esp_http_client_event_t *event)
{
    supabase_http_ctx_t *ctx = (supabase_http_ctx_t *)event->user_data;
    size_t copy_len;

    if (!ctx) {
        return ESP_OK;
    }

    if (event->event_id != HTTP_EVENT_ON_DATA || !event->data || event->data_len <= 0) {
        return ESP_OK;
    }

    if (ctx->len >= ctx->max) {
        ctx->truncated = true;
        return ESP_OK;
    }

    copy_len = (size_t)event->data_len;
    if (copy_len > (ctx->max - ctx->len - 1)) {
        copy_len = ctx->max - ctx->len - 1;
        ctx->truncated = true;
    }

    memcpy(ctx->buf + ctx->len, event->data, copy_len);
    ctx->len += copy_len;
    ctx->buf[ctx->len] = '\0';
    return ESP_OK;
}

static esp_err_t supabase_http_get(const supabase_todo_config_t *config,
                                   const char *url,
                                   char *response,
                                   size_t response_len,
                                   int *status_code)
{
    supabase_http_ctx_t ctx;
    esp_http_client_config_t http_config;
    esp_http_client_handle_t client;
    char auth_header[SUPABASE_KEY_MAX_LEN + 32];
    esp_err_t err;

    if (!config || !url || !response || response_len == 0 || !status_code) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(&ctx, 0, sizeof(ctx));
    ctx.buf = response;
    ctx.max = response_len;
    response[0] = '\0';

    memset(&http_config, 0, sizeof(http_config));
    http_config.url = url;
    http_config.timeout_ms = HTTP_TIMEOUT_MS;
    http_config.event_handler = supabase_http_event_handler;
    http_config.user_data = &ctx;
    http_config.crt_bundle_attach = esp_crt_bundle_attach;

    client = esp_http_client_init(&http_config);
    if (!client) {
        return ESP_FAIL;
    }

    snprintf(auth_header, sizeof(auth_header), "Bearer %s", config->key);
    esp_http_client_set_method(client, HTTP_METHOD_GET);
    esp_http_client_set_header(client, "apikey", config->key);
    esp_http_client_set_header(client, "Authorization", auth_header);
    esp_http_client_set_header(client, "Accept", "application/json");

    err = esp_http_client_perform(client);
    *status_code = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (ctx.truncated) {
        return ESP_ERR_NO_MEM;
    }

    return err;
}
#endif

static bool format_todo_rows(const char *response_json,
                             const supabase_todo_config_t *config,
                             const supabase_todo_query_t *query,
                             char *result,
                             size_t result_len)
{
    cJSON *root;
    cJSON *row;
    char *ptr = result;
    size_t remaining = result_len;
    int emitted = 0;

    root = cJSON_Parse(response_json);
    if (!root || !cJSON_IsArray(root)) {
        cJSON_Delete(root);
        snprintf(result, result_len, "Error: invalid Supabase JSON response");
        return false;
    }

    if (!tools_append_fmt(&ptr, &remaining, "Supabase todos:")) {
        cJSON_Delete(root);
        result[result_len - 1] = '\0';
        return true;
    }

    cJSON_ArrayForEach(row, root) {
        const cJSON *id_item;
        const cJSON *text_item;
        const cJSON *done_item;
        const cJSON *created_item;
        char id_buf[24] = {0};
        char text_buf[160] = {0};
        char created_buf[24] = {0};
        bool done;

        if (emitted >= query->limit) {
            break;
        }

        id_item = cJSON_GetObjectItem(row, "id");
        text_item = cJSON_GetObjectItem(row, config->text_field);
        done_item = cJSON_GetObjectItem(row, config->done_field);
        created_item = cJSON_GetObjectItem(row, config->created_field);

        done = json_item_is_truthy(done_item);
        if (strcmp(query->filter, "open") == 0 && done) {
            continue;
        }
        if (strcmp(query->filter, "completed") == 0 && !done) {
            continue;
        }

        json_item_to_text(id_item, id_buf, sizeof(id_buf));
        json_item_to_text(text_item, text_buf, sizeof(text_buf));
        if (text_buf[0] == '\0') {
            snprintf(text_buf, sizeof(text_buf), "(untitled)");
        }
        if (created_item && cJSON_IsString(created_item) && created_item->valuestring) {
            shorten_iso_time(created_item->valuestring, created_buf, sizeof(created_buf));
        }

        if (!tools_append_fmt(&ptr, &remaining,
                              "\n- [%c] #%s %s%s%s",
                              done ? 'x' : ' ',
                              id_buf[0] ? id_buf : "?",
                              text_buf,
                              created_buf[0] ? " (" : "",
                              created_buf)) {
            break;
        }
        if (created_buf[0] != '\0') {
            if (!tools_append_fmt(&ptr, &remaining, ")")) {
                break;
            }
        }

        emitted++;
    }

    cJSON_Delete(root);

    if (emitted == 0) {
        snprintf(result, result_len, "No todos found for configured Supabase user.");
    }
    return true;
}

bool tools_supabase_list_todos_handler(const cJSON *input, char *result, size_t result_len)
{
    supabase_todo_config_t config;
    supabase_todo_query_t query;
    char request_url[SUPABASE_REQUEST_URL_BUF_SIZE];
    char response_json[SUPABASE_RESPONSE_BUF_SIZE];
    int status_code = -1;
    esp_err_t err;

    if (!result || result_len == 0) {
        return false;
    }

    if (!parse_query_args(input, &query, result, result_len)) {
        return false;
    }

    if (!load_supabase_todo_config(&config, result, result_len)) {
        return false;
    }

    if (!build_request_url(&config, &query, request_url, sizeof(request_url), result, result_len)) {
        return false;
    }

    err = supabase_http_get(&config, request_url, response_json, sizeof(response_json), &status_code);
    if (err != ESP_OK) {
        snprintf(result, result_len, "Error: Supabase request failed");
        return false;
    }
    if (status_code != 200) {
        snprintf(result, result_len, "Error: Supabase query failed (HTTP %d): %s",
                 status_code, response_json);
        return false;
    }

    return format_todo_rows(response_json, &config, &query, result, result_len);
}
