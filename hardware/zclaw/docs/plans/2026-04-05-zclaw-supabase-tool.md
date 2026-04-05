# zclaw Supabase Todo Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a built-in zclaw firmware tool that can read the user's Supabase todos and answer chat requests through the existing agent flow.

**Architecture:** Implement a dedicated `supabase_list_todos` tool in C, store Supabase connection and field mapping in NVS, and return compact human-readable summaries to the LLM. Keep the first version read-only and limited to the configured todos table and user UUID.

**Tech Stack:** ESP-IDF C, `esp_http_client`, existing NVS helpers, host C tests with test doubles

---

### Task 1: Add failing tests for tool registration and core formatting

**Files:**
- Modify: `test/host/test_builtin_tools_registry.c`
- Create: `test/host/test_tools_supabase.c`
- Modify: `test/host/test_runner.c`

**Step 1: Write the failing tests**

Cover:

- built-in registry includes `supabase_list_todos`
- handler rejects missing config
- filter/limit parsing works
- formatted result includes id/status/text rows

**Step 2: Run tests to verify they fail**

Run host tests or the dedicated test runner target.

### Task 2: Add configuration keys and provision support

**Files:**
- Modify: `main/nvs_keys.h`
- Modify: `scripts/provision.sh`

**Step 1: Add new Supabase config keys**

Store URL, key, table, user field, user UUID, task text field, completed field, and created-at field.

**Step 2: Extend provisioning arguments**

Allow the host to save these values into device NVS.

### Task 3: Implement the tool

**Files:**
- Create: `main/tools_supabase.c`
- Modify: `main/tools_handlers.h`
- Modify: `main/builtin_tools.def`
- Modify: `main/CMakeLists.txt`

**Step 1: Parse tool input**

Support `filter` and `limit`.

**Step 2: Build and execute Supabase GET**

Read config from NVS and call Supabase REST API with `esp_http_client`.

**Step 3: Format compact tool output**

Return a concise list suitable for the LLM to turn into a chat reply.

### Task 4: Hook host-side test doubles

**Files:**
- Create: `test/host/mock_supabase_tool_deps.c`
- Modify: `main/tools_supabase.c`

**Step 1: Abstract the HTTP/config dependency points**

Use small static wrappers that can be replaced under `TEST_BUILD`.

**Step 2: Make host tests deterministic**

Feed fake rows and assert returned text.

### Task 5: Document usage

**Files:**
- Modify: `README.md`

**Step 1: Add brief usage notes**

Document provisioning fields and example user prompts.

### Task 6: Verification

**Files:**
- Test: `test/host/test_builtin_tools_registry.c`
- Test: `test/host/test_tools_supabase.c`

**Step 1: Run host tests**

Verify all new tests pass.
