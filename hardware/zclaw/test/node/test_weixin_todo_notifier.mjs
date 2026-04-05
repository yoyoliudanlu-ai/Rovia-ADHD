import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOutgoingMessage,
  collectDueTodos,
  normalizeTodoRow,
  shouldSendDailySummary,
  shouldSendWeeklySummary,
} from "../../scripts/lib/weixin_todo_notifier_lib.mjs";

test("normalizeTodoRow maps configurable fields into a stable shape", () => {
  const row = {
    task_id: "todo-1",
    name: "提交周报",
    notes: "把本周完成项整理一下",
    remind_at: "2026-04-05T08:30:00.000Z",
    done_flag: 0,
    created_on: "2026-04-04T08:00:00.000Z",
    updated_on: "2026-04-05T07:55:00.000Z",
  };

  const mapped = normalizeTodoRow(row, {
    idField: "task_id",
    titleField: "name",
    bodyField: "notes",
    dueAtField: "remind_at",
    doneField: "done_flag",
    doneTruthyValues: ["1", "true", "done"],
    createdAtField: "created_on",
    updatedAtField: "updated_on",
  });

  assert.equal(mapped.id, "todo-1");
  assert.equal(mapped.title, "提交周报");
  assert.equal(mapped.body, "把本周完成项整理一下");
  assert.equal(mapped.dueAt, "2026-04-05T08:30:00.000Z");
  assert.equal(mapped.isDone, false);
  assert.equal(mapped.createdAt, "2026-04-04T08:00:00.000Z");
  assert.equal(mapped.updatedAt, "2026-04-05T07:55:00.000Z");
});

test("collectDueTodos returns overdue unfinished tasks that were not already notified", () => {
  const todos = [
    { id: "a", title: "已到期未完成", dueAt: "2026-04-05T08:00:00.000Z", isDone: false },
    { id: "b", title: "还没到时间", dueAt: "2026-04-05T10:30:00.000Z", isDone: false },
    { id: "c", title: "已经完成", dueAt: "2026-04-05T07:00:00.000Z", isDone: true },
    { id: "d", title: "已提醒过", dueAt: "2026-04-05T06:00:00.000Z", isDone: false },
  ];

  const due = collectDueTodos(todos, {
    now: "2026-04-05T09:00:00.000Z",
    notifiedDueKeys: new Set(["d::2026-04-05T06:00:00.000Z"]),
  });

  assert.deepEqual(
    due.map((todo) => todo.id),
    ["a"],
  );
});

test("shouldSendDailySummary only fires once after the configured local send time", () => {
  const firstKey = shouldSendDailySummary({
    now: "2026-04-05T13:05:00.000Z",
    timezone: "Asia/Shanghai",
    hour: 21,
    minute: 0,
    sentKeys: new Set(),
  });

  assert.equal(firstKey, "daily:2026-04-05");

  const secondKey = shouldSendDailySummary({
    now: "2026-04-05T13:10:00.000Z",
    timezone: "Asia/Shanghai",
    hour: 21,
    minute: 0,
    sentKeys: new Set(["daily:2026-04-05"]),
  });

  assert.equal(secondKey, null);
});

test("shouldSendWeeklySummary only fires on the configured weekday after send time", () => {
  const sundayTooEarly = shouldSendWeeklySummary({
    now: "2026-04-05T00:30:00.000Z",
    timezone: "Asia/Shanghai",
    weekday: 7,
    hour: 9,
    minute: 0,
    sentKeys: new Set(),
  });

  assert.equal(sundayTooEarly, null);

  const sundayReady = shouldSendWeeklySummary({
    now: "2026-04-05T01:30:00.000Z",
    timezone: "Asia/Shanghai",
    weekday: 7,
    hour: 9,
    minute: 0,
    sentKeys: new Set(),
  });

  assert.equal(sundayReady, "weekly:2026-03-30");
});

test("buildOutgoingMessage keeps text and allows bridge-side default target fallback", () => {
  assert.deepEqual(
    buildOutgoingMessage({ text: "提醒：任务到时间了" }),
    { text: "提醒：任务到时间了" },
  );

  assert.deepEqual(
    buildOutgoingMessage({ text: "定向消息", userId: "wx-user", ctx: "ctx-token" }),
    { text: "定向消息", user_id: "wx-user", ctx: "ctx-token" },
  );
});
