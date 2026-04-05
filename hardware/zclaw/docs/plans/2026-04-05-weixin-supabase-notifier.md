# Weixin Supabase Notifier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a host-side notifier that watches Supabase todos, sends due reminders to WeChat, and emits daily/weekly summaries through Infini GLM-5.

**Architecture:** A Node script polls Supabase, normalizes rows through configurable field mappings, and publishes reminder/summary payloads to the existing MQTT -> WeChat bridge. The bridge learns and persists the latest inbound WeChat target so proactive notifications can be delivered without hardcoding `user_id`.

**Tech Stack:** Node.js ESM, built-in `fetch`, built-in `node:test`, existing `mqtt` package

---

### Task 1: Document runtime assumptions

**Files:**
- Create: `docs/plans/2026-04-05-weixin-supabase-notifier-design.md`
- Create: `docs/plans/2026-04-05-weixin-supabase-notifier.md`

**Step 1: Write the design summary**

Describe host-side ownership, Supabase polling, GLM-5 summarization, MQTT delivery, and local dedupe state.

**Step 2: Save the implementation plan**

List exact files, tests, and commands for the remaining tasks.

### Task 2: Write failing tests for notifier core

**Files:**
- Create: `test/node/test_weixin_todo_notifier.mjs`
- Create: `scripts/lib/weixin_todo_notifier_lib.mjs`

**Step 1: Write the failing tests**

Cover:

- `normalizeTodoRow()` maps configurable fields into a normalized task
- `collectDueTodos()` returns only overdue unfinished rows not already notified
- `shouldSendDailySummary()` and `shouldSendWeeklySummary()` fire only once per period
- `buildOutgoingMessage()` allows empty `user_id/ctx` for bridge fallback

**Step 2: Run test to verify it fails**

Run: `node --test test/node/test_weixin_todo_notifier.mjs`

Expected: FAIL because helper module/functions do not exist yet.

**Step 3: Write minimal implementation**

Add the helper module with the smallest code required to satisfy the tests.

**Step 4: Run test to verify it passes**

Run: `node --test test/node/test_weixin_todo_notifier.mjs`

Expected: PASS

### Task 3: Implement the notifier daemon

**Files:**
- Modify: `package.json`
- Create: `scripts/weixin_todo_notifier.mjs`
- Modify: `scripts/lib/weixin_todo_notifier_lib.mjs`

**Step 1: Write the failing test or assertion target**

Use the core helpers already covered by Task 2 as the behavioral contract.

**Step 2: Write minimal implementation**

Implement:

- env-driven config loading
- Supabase REST polling
- due reminder generation
- daily/weekly summary window selection
- Infini GLM-5 request + fallback summary
- MQTT publish loop
- local state persistence

**Step 3: Run tests**

Run: `node --test test/node/test_weixin_todo_notifier.mjs`

Expected: PASS

### Task 4: Enhance WeChat bridge for proactive delivery

**Files:**
- Modify: `weixin_bridge.mjs`

**Step 1: Write the failing test or manual contract**

Target behavior:

- inbound WeChat messages persist the latest `user_id` and `ctx`
- outbound MQTT messages may omit `user_id/ctx`
- bridge falls back to persisted default target before calling send API

**Step 2: Write minimal implementation**

Persist target metadata in the account state directory and apply fallback when `TOPIC_OUT` payload omits explicit routing fields.

**Step 3: Run tests or smoke checks**

At minimum re-run notifier unit tests and perform a syntax check with Node execution.

### Task 5: Add operator-facing usage notes

**Files:**
- Modify: `README.md`

**Step 1: Document runtime setup**

Add concise instructions for:

- configuring Supabase / Infini / MQTT env vars
- sending one initial WeChat message so the bridge learns the default target
- starting the bridge and notifier

**Step 2: Verify documentation references real files/commands**

Run quick syntax/tests for the scripts.

### Task 6: Verification

**Files:**
- Test: `test/node/test_weixin_todo_notifier.mjs`
- Test: `scripts/weixin_todo_notifier.mjs`
- Test: `weixin_bridge.mjs`

**Step 1: Run unit tests**

Run: `node --test test/node/test_weixin_todo_notifier.mjs`

Expected: PASS

**Step 2: Run syntax checks**

Run: `node --check scripts/weixin_todo_notifier.mjs`

Run: `node --check weixin_bridge.mjs`

Expected: PASS

**Step 3: Summarize assumptions**

Note that actual Supabase field names remain configurable via env vars and that the bridge needs one inbound WeChat message before proactive pushes can use the learned default target.
