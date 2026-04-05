#include "weixin_mqtt.h"
#include "config.h"
#include "messages.h"
#include "nvs_keys.h"
#include "memory.h"

#include "mqtt_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "cJSON.h"

#include <string.h>
#include <stdbool.h>

static const char *TAG = "weixin_mqtt";

static esp_mqtt_client_handle_t s_client      = NULL;
static QueueHandle_t             s_input_queue  = NULL;
static QueueHandle_t             s_mqtt_output  = NULL;
static bool                      s_connected    = false;

// Topic strings built at init time
static char s_topic_in[MQTT_TOPIC_MAX_LEN + 4];   // "<prefix>/in"
static char s_topic_out[MQTT_TOPIC_MAX_LEN + 5];  // "<prefix>/out"

// ── 解析收到的 MQTT 消息 → 放入 input_queue ──────────────────

static void handle_inbound(const char *data, int data_len)
{
    if (!s_input_queue || data_len <= 0) return;

    // 期望格式: {"text":"…","user_id":"…","ctx":"…"}
    char *buf = malloc(data_len + 1);
    if (!buf) {
        ESP_LOGE(TAG, "OOM parsing inbound message");
        return;
    }
    memcpy(buf, data, data_len);
    buf[data_len] = '\0';

    cJSON *root = cJSON_Parse(buf);
    free(buf);
    if (!root) {
        ESP_LOGW(TAG, "inbound: invalid JSON, ignoring");
        return;
    }

    cJSON *j_text    = cJSON_GetObjectItem(root, "text");
    cJSON *j_user_id = cJSON_GetObjectItem(root, "user_id");
    cJSON *j_ctx     = cJSON_GetObjectItem(root, "ctx");

    if (!cJSON_IsString(j_text) || !j_text->valuestring || !j_text->valuestring[0]) {
        ESP_LOGW(TAG, "inbound: missing text field");
        cJSON_Delete(root);
        return;
    }

    channel_msg_t msg = {0};
    msg.source = MSG_SOURCE_MQTT;

    strncpy(msg.text, j_text->valuestring, sizeof(msg.text) - 1);

    if (cJSON_IsString(j_user_id) && j_user_id->valuestring)
        strncpy(msg.mqtt_user_id, j_user_id->valuestring, sizeof(msg.mqtt_user_id) - 1);

    if (cJSON_IsString(j_ctx) && j_ctx->valuestring)
        strncpy(msg.mqtt_ctx, j_ctx->valuestring, sizeof(msg.mqtt_ctx) - 1);

    cJSON_Delete(root);

    if (xQueueSend(s_input_queue, &msg, pdMS_TO_TICKS(500)) != pdTRUE) {
        ESP_LOGW(TAG, "input_queue full, dropping WeChat message");
    } else {
        ESP_LOGI(TAG, "← WeChat [%s]: %.80s", msg.mqtt_user_id, msg.text);
    }
}

// ── MQTT 事件处理 ─────────────────────────────────────────────

static void mqtt_event_handler(void *arg, esp_event_base_t base,
                               int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED:
            s_connected = true;
            ESP_LOGI(TAG, "connected to broker, subscribing %s", s_topic_in);
            esp_mqtt_client_subscribe(s_client, s_topic_in, 1);
            break;

        case MQTT_EVENT_DISCONNECTED:
            s_connected = false;
            ESP_LOGW(TAG, "disconnected from broker");
            break;

        case MQTT_EVENT_DATA:
            if (event->topic_len > 0 &&
                strncmp(event->topic, s_topic_in, event->topic_len) == 0) {
                handle_inbound(event->data, event->data_len);
            }
            break;

        case MQTT_EVENT_ERROR:
            ESP_LOGE(TAG, "MQTT error type=%d", event->error_handle->error_type);
            break;

        default:
            break;
    }
}

// ── 出队任务：把 agent 回复发布到 MQTT ───────────────────────

static void mqtt_output_task(void *arg)
{
    mqtt_msg_t msg;
    char *payload = malloc(MQTT_MSG_BUF_SIZE + MQTT_USER_ID_MAX_LEN + MQTT_CTX_MAX_LEN + 64);
    if (!payload) {
        ESP_LOGE(TAG, "OOM for output buffer, task exit");
        vTaskDelete(NULL);
        return;
    }

    while (1) {
        if (xQueueReceive(s_mqtt_output, &msg, portMAX_DELAY) != pdTRUE) continue;

        if (!s_connected) {
            ESP_LOGW(TAG, "not connected, dropping reply");
            continue;
        }

        // 构造 JSON: {"text":"…","user_id":"…","ctx":"…"}
        cJSON *root = cJSON_CreateObject();
        cJSON_AddStringToObject(root, "text",    msg.text);
        cJSON_AddStringToObject(root, "user_id", msg.user_id);
        cJSON_AddStringToObject(root, "ctx",     msg.ctx);
        char *json = cJSON_PrintUnformatted(root);
        cJSON_Delete(root);

        if (!json) {
            ESP_LOGE(TAG, "cJSON_Print failed");
            continue;
        }

        int msg_id = esp_mqtt_client_publish(s_client, s_topic_out, json, 0, 1, 0);
        if (msg_id < 0) {
            ESP_LOGE(TAG, "publish failed");
        } else {
            ESP_LOGI(TAG, "→ WeChat [%s]: %.80s", msg.user_id, msg.text);
        }
        free(json);
    }
}

// ── 公开接口 ─────────────────────────────────────────────────

esp_err_t weixin_mqtt_init(void)
{
    char uri[MQTT_URI_MAX_LEN + 1]  = {0};
    char user[MQTT_USER_MAX_LEN + 1] = {0};
    char pass[MQTT_PASS_MAX_LEN + 1] = {0};
    char topic[MQTT_TOPIC_MAX_LEN + 1] = {0};

    // 读 NVS
    if (!memory_get(NVS_KEY_MQTT_URI, uri, sizeof(uri)) || !uri[0]) {
        ESP_LOGI(TAG, "mqtt_uri not configured, MQTT disabled");
        return ESP_ERR_NOT_FOUND;
    }
    memory_get(NVS_KEY_MQTT_USER, user, sizeof(user));
    memory_get(NVS_KEY_MQTT_PASS, pass, sizeof(pass));

    if (!memory_get(NVS_KEY_MQTT_TOPIC, topic, sizeof(topic)) || !topic[0]) {
        strncpy(topic, MQTT_DEFAULT_TOPIC, sizeof(topic) - 1);
    }

    snprintf(s_topic_in,  sizeof(s_topic_in),  "%s/in",  topic);
    snprintf(s_topic_out, sizeof(s_topic_out), "%s/out", topic);

    esp_mqtt_client_config_t cfg = {
        .broker.address.uri                    = uri,
        .broker.verification.crt_bundle_attach = esp_crt_bundle_attach,
        .credentials.username                  = user[0] ? user : NULL,
        .credentials.authentication.password   = pass[0] ? pass : NULL,
        .network.reconnect_timeout_ms          = MQTT_RECONNECT_MS,
    };

    s_client = esp_mqtt_client_init(&cfg);
    if (!s_client) {
        ESP_LOGE(TAG, "esp_mqtt_client_init failed");
        return ESP_FAIL;
    }

    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);

    esp_err_t err = esp_mqtt_client_start(s_client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_mqtt_client_start failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "MQTT client started: %s  in=%s  out=%s", uri, s_topic_in, s_topic_out);
    return ESP_OK;
}

esp_err_t weixin_mqtt_start(QueueHandle_t input_queue, QueueHandle_t mqtt_output_queue)
{
    if (!s_client) return ESP_ERR_INVALID_STATE;

    s_input_queue = input_queue;
    s_mqtt_output = mqtt_output_queue;

    if (xTaskCreate(mqtt_output_task, "mqtt_out", MQTT_TASK_STACK_SIZE,
                    NULL, 4, NULL) != pdPASS) {
        ESP_LOGE(TAG, "failed to create mqtt_output_task");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

bool weixin_mqtt_connected(void)
{
    return s_connected;
}
