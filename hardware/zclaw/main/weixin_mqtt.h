#pragma once

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <stdbool.h>

// Initialize MQTT client from NVS config (mqtt_uri, mqtt_user, mqtt_pass, mqtt_topic).
// Returns ESP_ERR_NOT_FOUND if mqtt_uri not configured.
esp_err_t weixin_mqtt_init(void);

// Start MQTT receive task and output drainer task.
esp_err_t weixin_mqtt_start(QueueHandle_t input_queue, QueueHandle_t mqtt_output_queue);

// Returns true if the MQTT client is connected to the broker.
bool weixin_mqtt_connected(void);
