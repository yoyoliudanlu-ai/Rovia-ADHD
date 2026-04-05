/*
 * Host tests for Supabase todo tool behavior.
 */

#include <stdio.h>
#include <string.h>

#include <cjson/cJSON.h>

#include "mock_memory.h"
#include "tools_handlers.h"

#define TEST(name) static int test_##name(void)
#define ASSERT(cond) do { \
    if (!(cond)) { \
        printf("  FAIL: %s (line %d)\n", #cond, __LINE__); \
        return 1; \
    } \
} while (0)
#define ASSERT_STR_CONTAINS(haystack, needle) do { \
    if (strstr((haystack), (needle)) == NULL) { \
        printf("  FAIL: expected substring '%s' in '%s' (line %d)\n", (needle), (haystack), __LINE__); \
        return 1; \
    } \
} while (0)

static void seed_valid_supabase_config(void)
{
    mock_memory_set_kv("sb_url", "https://example.supabase.co");
    mock_memory_set_kv("sb_key", "test-supabase-key");
    mock_memory_set_kv("sb_table", "todos");
    mock_memory_set_kv("sb_userfld", "user_id");
    mock_memory_set_kv("sb_userid", "user-123");
    mock_memory_set_kv("sb_txtfld", "task_text");
    mock_memory_set_kv("sb_donefld", "is_completed");
    mock_memory_set_kv("sb_ctimefld", "created_at");
}

TEST(handler_rejects_missing_config)
{
    cJSON *input = cJSON_Parse("{\"filter\":\"open\",\"limit\":3}");
    char result[256] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    tools_supabase_test_reset();

    ASSERT(!tools_supabase_list_todos_handler(input, result, sizeof(result)));
    ASSERT_STR_CONTAINS(result, "Supabase config missing");

    cJSON_Delete(input);
    return 0;
}

TEST(handler_builds_expected_request_url_for_open_filter)
{
    cJSON *input = cJSON_Parse("{\"filter\":\"open\",\"limit\":3}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(200, "[]");

    ASSERT(tools_supabase_list_todos_handler(input, result, sizeof(result)));
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "/rest/v1/todos?");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "select=id,task_text,is_completed,created_at");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "user_id=eq.user-123");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "is_completed=eq.false");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "limit=3");
    ASSERT_STR_CONTAINS(result, "No todos found");

    cJSON_Delete(input);
    return 0;
}

TEST(handler_formats_rows_and_completion_state)
{
    cJSON *input = cJSON_Parse("{\"filter\":\"all\",\"limit\":2}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(
        200,
        "["
        "{\"id\":1,\"task_text\":\"buy milk\",\"is_completed\":false,\"created_at\":\"2026-04-05T10:00:00Z\"},"
        "{\"id\":2,\"task_text\":\"file taxes\",\"is_completed\":true,\"created_at\":\"2026-04-04T09:00:00Z\"}"
        "]");

    ASSERT(tools_supabase_list_todos_handler(input, result, sizeof(result)));
    ASSERT_STR_CONTAINS(result, "Supabase todos:");
    ASSERT_STR_CONTAINS(result, "[ ] #1 buy milk");
    ASSERT_STR_CONTAINS(result, "[x] #2 file taxes");

    cJSON_Delete(input);
    return 0;
}

TEST(handler_rejects_invalid_filter_value)
{
    cJSON *input = cJSON_Parse("{\"filter\":\"later\"}");
    char result[256] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();

    ASSERT(!tools_supabase_list_todos_handler(input, result, sizeof(result)));
    ASSERT_STR_CONTAINS(result, "filter must be one of all|open|completed");

    cJSON_Delete(input);
    return 0;
}

int test_tools_supabase_all(void)
{
    int failures = 0;

    printf("\nSupabase Tool Tests:\n");

    printf("  handler_rejects_missing_config... ");
    if (test_handler_rejects_missing_config() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  handler_builds_expected_request_url_for_open_filter... ");
    if (test_handler_builds_expected_request_url_for_open_filter() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  handler_formats_rows_and_completion_state... ");
    if (test_handler_formats_rows_and_completion_state() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  handler_rejects_invalid_filter_value... ");
    if (test_handler_rejects_invalid_filter_value() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    return failures;
}
