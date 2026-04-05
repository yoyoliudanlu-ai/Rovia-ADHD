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

extern const char *tools_supabase_test_last_request_method(void);
extern const char *tools_supabase_test_last_request_body(void);

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

static void seed_local_proxy_supabase_config(void)
{
    seed_valid_supabase_config();
    mock_memory_set_kv("sb_url", "http://192.168.31.5:8787/proxy/supabase");
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

TEST(handler_allows_local_http_proxy_url)
{
    cJSON *input = cJSON_Parse("{\"filter\":\"open\",\"limit\":2}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_local_proxy_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(200, "[]");

    ASSERT(tools_supabase_list_todos_handler(input, result, sizeof(result)));
    ASSERT_STR_CONTAINS(
        tools_supabase_test_last_request_url(),
        "http://192.168.31.5:8787/proxy/supabase/rest/v1/todos?"
    );
    ASSERT_STR_CONTAINS(result, "No todos found");

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

TEST(create_todo_builds_post_request_with_expected_body)
{
    cJSON *input = cJSON_Parse("{\"text\":\"buy eggs\"}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(201, "[{\"id\":7,\"task_text\":\"buy eggs\",\"is_completed\":false}]");

    ASSERT(tools_supabase_create_todo_handler(input, result, sizeof(result)));
    ASSERT(strcmp(tools_supabase_test_last_request_method(), "POST") == 0);
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "/rest/v1/todos");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"user_id\":\"user-123\"");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"task_text\":\"buy eggs\"");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"is_completed\":false");
    ASSERT_STR_CONTAINS(result, "Created todo");

    cJSON_Delete(input);
    return 0;
}

TEST(update_todo_builds_patch_request_with_expected_fields)
{
    cJSON *input = cJSON_Parse("{\"id\":17,\"text\":\"buy oat milk\",\"completed\":true}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(200, "[{\"id\":17,\"task_text\":\"buy oat milk\",\"is_completed\":true}]");

    ASSERT(tools_supabase_update_todo_handler(input, result, sizeof(result)));
    ASSERT(strcmp(tools_supabase_test_last_request_method(), "PATCH") == 0);
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "/rest/v1/todos?");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "id=eq.17");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "user_id=eq.user-123");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"task_text\":\"buy oat milk\"");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"is_completed\":true");
    ASSERT_STR_CONTAINS(result, "Updated todo #17");

    cJSON_Delete(input);
    return 0;
}

TEST(complete_todo_marks_item_done_by_id)
{
    cJSON *input = cJSON_Parse("{\"id\":42}");
    char result[512] = {0};

    ASSERT(input != NULL);
    mock_memory_reset();
    seed_valid_supabase_config();
    tools_supabase_test_reset();
    tools_supabase_test_set_http_response(200, "[{\"id\":42,\"task_text\":\"stretch\",\"is_completed\":true}]");

    ASSERT(tools_supabase_complete_todo_handler(input, result, sizeof(result)));
    ASSERT(strcmp(tools_supabase_test_last_request_method(), "PATCH") == 0);
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_url(), "id=eq.42");
    ASSERT_STR_CONTAINS(tools_supabase_test_last_request_body(), "\"is_completed\":true");
    ASSERT_STR_CONTAINS(result, "Completed todo #42");

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

    printf("  handler_allows_local_http_proxy_url... ");
    if (test_handler_allows_local_http_proxy_url() == 0) {
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

    printf("  create_todo_builds_post_request_with_expected_body... ");
    if (test_create_todo_builds_post_request_with_expected_body() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  update_todo_builds_patch_request_with_expected_fields... ");
    if (test_update_todo_builds_patch_request_with_expected_fields() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    printf("  complete_todo_marks_item_done_by_id... ");
    if (test_complete_todo_marks_item_done_by_id() == 0) {
        printf("OK\n");
    } else {
        failures++;
    }

    return failures;
}
