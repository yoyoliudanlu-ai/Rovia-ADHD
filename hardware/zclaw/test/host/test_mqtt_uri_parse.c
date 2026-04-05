#include <stdio.h>
#include <string.h>

#include "mqtt_uri_parse.h"

#define TEST(name) static int test_##name(void)
#define ASSERT(cond) do { \
    if (!(cond)) { \
        printf("  FAIL: %s (line %d)\n", #cond, __LINE__); \
        return 1; \
    } \
} while(0)
#define ASSERT_STR_EQ(a, b) do { \
    if (strcmp((a), (b)) != 0) { \
        printf("  FAIL: '%s' != '%s' (line %d)\n", (a), (b), __LINE__); \
        return 1; \
    } \
} while(0)

TEST(parses_mqtts_uri_with_explicit_port)
{
    mqtt_uri_parts_t parts;

    ASSERT(mqtt_uri_parse("mqtts://d21e0f64.ala.dedicated.aliyun.emqxcloud.cn:8883", &parts));
    ASSERT(parts.transport == MQTT_URI_TRANSPORT_SSL);
    ASSERT(parts.port == 8883);
    ASSERT_STR_EQ(parts.hostname, "d21e0f64.ala.dedicated.aliyun.emqxcloud.cn");
    return 0;
}

TEST(parses_mqtt_uri_with_default_port)
{
    mqtt_uri_parts_t parts;

    ASSERT(mqtt_uri_parse("mqtt://broker.example.com", &parts));
    ASSERT(parts.transport == MQTT_URI_TRANSPORT_TCP);
    ASSERT(parts.port == 1883);
    ASSERT_STR_EQ(parts.hostname, "broker.example.com");
    return 0;
}

TEST(parses_and_ignores_path_suffix)
{
    mqtt_uri_parts_t parts;

    ASSERT(mqtt_uri_parse("wss://example.com:443/mqtt", &parts));
    ASSERT(parts.transport == MQTT_URI_TRANSPORT_WSS);
    ASSERT(parts.port == 443);
    ASSERT_STR_EQ(parts.hostname, "example.com");
    return 0;
}

TEST(rejects_missing_host)
{
    mqtt_uri_parts_t parts;

    ASSERT(!mqtt_uri_parse("mqtts://:8883", &parts));
    ASSERT(!mqtt_uri_parse("mqtts://", &parts));
    ASSERT(!mqtt_uri_parse("", &parts));
    return 0;
}

int test_mqtt_uri_parse_all(void)
{
    int failures = 0;

    printf("\nMQTT URI Parse Tests:\n");

    printf("  parses_mqtts_uri_with_explicit_port... ");
    if (test_parses_mqtts_uri_with_explicit_port() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  parses_mqtt_uri_with_default_port... ");
    if (test_parses_mqtt_uri_with_default_port() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  parses_and_ignores_path_suffix... ");
    if (test_parses_and_ignores_path_suffix() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  rejects_missing_host... ");
    if (test_rejects_missing_host() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    return failures;
}
