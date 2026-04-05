#include "mqtt_uri_parse.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

static bool parse_scheme(const char *uri,
                         const char **host_start_out,
                         mqtt_uri_transport_t *transport_out,
                         uint32_t *default_port_out)
{
    if (strncmp(uri, "mqtt://", 7) == 0) {
        *host_start_out = uri + 7;
        *transport_out = MQTT_URI_TRANSPORT_TCP;
        *default_port_out = 1883;
        return true;
    }
    if (strncmp(uri, "mqtts://", 8) == 0) {
        *host_start_out = uri + 8;
        *transport_out = MQTT_URI_TRANSPORT_SSL;
        *default_port_out = 8883;
        return true;
    }
    if (strncmp(uri, "ws://", 5) == 0) {
        *host_start_out = uri + 5;
        *transport_out = MQTT_URI_TRANSPORT_WS;
        *default_port_out = 80;
        return true;
    }
    if (strncmp(uri, "wss://", 6) == 0) {
        *host_start_out = uri + 6;
        *transport_out = MQTT_URI_TRANSPORT_WSS;
        *default_port_out = 443;
        return true;
    }
    return false;
}

bool mqtt_uri_parse(const char *uri, mqtt_uri_parts_t *out)
{
    const char *host_start;
    const char *cursor;
    const char *host_end;
    const char *path_start;
    mqtt_uri_transport_t transport;
    uint32_t default_port = 0;
    size_t host_len;

    if (!uri || !out || uri[0] == '\0') {
        return false;
    }

    memset(out, 0, sizeof(*out));

    if (!parse_scheme(uri, &host_start, &transport, &default_port)) {
        return false;
    }

    if (!host_start || host_start[0] == '\0') {
        return false;
    }

    path_start = strpbrk(host_start, "/?#");
    if (!path_start) {
        path_start = host_start + strlen(host_start);
    }

    host_end = path_start;
    cursor = host_start;
    while (cursor < path_start && *cursor != ':') {
        cursor++;
    }
    if (cursor < path_start && *cursor == ':') {
        host_end = cursor;
        cursor++;
        if (cursor >= path_start) {
            return false;
        }
        for (const char *p = cursor; p < path_start; p++) {
            if (!isdigit((unsigned char)*p)) {
                return false;
            }
        }
        out->port = (uint32_t)strtoul(cursor, NULL, 10);
        if (out->port == 0 || out->port > 65535) {
            return false;
        }
    } else {
        out->port = default_port;
    }

    host_len = (size_t)(host_end - host_start);
    if (host_len == 0 || host_len >= sizeof(out->hostname)) {
        return false;
    }

    memcpy(out->hostname, host_start, host_len);
    out->hostname[host_len] = '\0';
    out->transport = transport;
    return true;
}
