#ifndef MQTT_URI_PARSE_H
#define MQTT_URI_PARSE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum {
    MQTT_URI_TRANSPORT_TCP = 0,
    MQTT_URI_TRANSPORT_SSL,
    MQTT_URI_TRANSPORT_WS,
    MQTT_URI_TRANSPORT_WSS,
} mqtt_uri_transport_t;

typedef struct {
    mqtt_uri_transport_t transport;
    char hostname[128];
    uint32_t port;
} mqtt_uri_parts_t;

bool mqtt_uri_parse(const char *uri, mqtt_uri_parts_t *out);

#endif // MQTT_URI_PARSE_H
