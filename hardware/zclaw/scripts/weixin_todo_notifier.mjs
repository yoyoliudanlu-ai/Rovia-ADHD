import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  buildOutgoingMessage,
  collectDueTodos,
  dueReminderKey,
  getLocalParts,
  normalizeTodoRow,
  shouldSendDailySummary,
  shouldSendWeeklySummary,
  toLocalDateKey,
  toWeekKey,
} from "./lib/weixin_todo_notifier_lib.mjs";
import { sendOpenClawWeixinText } from "./lib/openclaw_weixin_client.mjs";

const require = createRequire(import.meta.url);
const mqtt = require("mqtt");

const DEFAULT_LLM_API_URL = "https://cloud.infini-ai.com/maas/glm-5/nvidia/chat/completions";
const DEFAULT_LLM_MODEL = "glm-5";

function envString(name, fallback = "") {
  const value = process.env[name];
  return value == null ? fallback : String(value).trim();
}

function envInteger(name, fallback) {
  const raw = envString(name, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envCsv(name, fallback = []) {
  const raw = envString(name, "");
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveStateDir() {
  const explicit = envString("ZCLAW_NOTIFIER_DIR", "");
  if (explicit) return explicit;
  return path.join(os.homedir(), ".openclaw", "weixin-todo-notifier");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function saveJsonFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function loadConfig() {
  const stateDir = resolveStateDir();
  const config = {
    supabaseUrl: envString("SUPABASE_URL", ""),
    supabaseKey: envString("SUPABASE_KEY", ""),
    supabaseTable: envString("SUPABASE_TABLE", "todo"),
    supabaseUserField: envString("SUPABASE_USER_FIELD", "user_uuid"),
    supabaseUserUuid: envString("SUPABASE_USER_UUID", ""),
    idField: envString("TODO_ID_FIELD", "id"),
    titleField: envString("TODO_TITLE_FIELD", "title"),
    bodyField: envString("TODO_BODY_FIELD", "description"),
    dueAtField: envString("TODO_DUE_AT_FIELD", "due_at"),
    doneField: envString("TODO_DONE_FIELD", "completed"),
    doneTruthyValues: envCsv("TODO_DONE_TRUE_VALUES", ["true", "1", "done", "completed"]),
    statusField: envString("TODO_STATUS_FIELD", ""),
    doneStatusValues: envCsv("TODO_DONE_STATUS_VALUES", ["done", "completed"]),
    createdAtField: envString("TODO_CREATED_AT_FIELD", "created_at"),
    updatedAtField: envString("TODO_UPDATED_AT_FIELD", "updated_at"),
    llmApiUrl: envString("LLM_API_URL", DEFAULT_LLM_API_URL),
    llmApiKey: envString("LLM_API_KEY", envString("INFINI_API_KEY", "")),
    llmModel: envString("LLM_MODEL", DEFAULT_LLM_MODEL),
    deliveryMode: envString("WEIXIN_DELIVERY_MODE", envString("MQTT_URI", "") ? "mqtt" : "openclaw"),
    mqttUri: envString("MQTT_URI", ""),
    mqttUser: envString("MQTT_USER", ""),
    mqttPass: envString("MQTT_PASS", ""),
    mqttTopic: envString("MQTT_TOPIC", "zclaw"),
    weixinDir: envString("ZCLAW_WEIXIN_DIR", ""),
    weixinAccount: envString("WEIXIN_ACCOUNT", ""),
    timezone: envString("ZCLAW_NOTIFIER_TIMEZONE", "Asia/Shanghai"),
    pollIntervalMs: envInteger("ZCLAW_NOTIFIER_POLL_INTERVAL_MS", 60_000),
    dailyHour: envInteger("ZCLAW_DAILY_SUMMARY_HOUR", 21),
    dailyMinute: envInteger("ZCLAW_DAILY_SUMMARY_MINUTE", 0),
    weeklyWeekday: envInteger("ZCLAW_WEEKLY_SUMMARY_WEEKDAY", 7),
    weeklyHour: envInteger("ZCLAW_WEEKLY_SUMMARY_HOUR", 21),
    weeklyMinute: envInteger("ZCLAW_WEEKLY_SUMMARY_MINUTE", 30),
    targetUserId: envString("WEIXIN_TO_USER_ID", ""),
    targetCtx: envString("WEIXIN_CONTEXT_TOKEN", ""),
    stateFile: path.join(stateDir, "state.json"),
  };

  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_KEY");
  if (!config.supabaseUserUuid) missing.push("SUPABASE_USER_UUID");
  if (config.deliveryMode === "mqtt" && !config.mqttUri) missing.push("MQTT_URI");

  if (missing.length) {
    throw new Error(`缺少必要环境变量: ${missing.join(", ")}`);
  }

  return config;
}

function loadState(config) {
  const state = loadJsonFile(config.stateFile, {
    notifiedDueKeys: {},
    sentSummaries: {},
  });

  return {
    notifiedDueKeys: state.notifiedDueKeys && typeof state.notifiedDueKeys === "object"
      ? state.notifiedDueKeys
      : {},
    sentSummaries: state.sentSummaries && typeof state.sentSummaries === "object"
      ? state.sentSummaries
      : {},
  };
}

function saveState(config, state) {
  saveJsonFile(config.stateFile, state);
}

function buildSupabaseUrl(config) {
  const base = config.supabaseUrl.endsWith("/")
    ? config.supabaseUrl
    : `${config.supabaseUrl}/`;
  const url = new URL(`rest/v1/${config.supabaseTable}`, base);
  const selectFields = [
    config.idField,
    config.titleField,
    config.bodyField,
    config.dueAtField,
    config.doneField,
    config.statusField,
    config.createdAtField,
    config.updatedAtField,
  ].filter(Boolean);

  url.searchParams.set("select", [...new Set(selectFields)].join(",") || "*");
  url.searchParams.set(config.supabaseUserField, `eq.${config.supabaseUserUuid}`);
  if (config.dueAtField) {
    url.searchParams.set("order", `${config.dueAtField}.asc.nullslast`);
  }
  return url;
}

async function fetchTodos(config) {
  const response = await fetch(buildSupabaseUrl(config), {
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase 查询失败 HTTP ${response.status}: ${bodyText}`);
  }

  let rows;
  try {
    rows = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`Supabase 返回不是合法 JSON: ${error.message}`);
  }

  if (!Array.isArray(rows)) {
    throw new Error("Supabase 返回不是数组");
  }

  return rows.map((row) => normalizeTodoRow(row, config));
}

function formatLocalDateTime(value, timezone) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const parts = getLocalParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function uniqueRecentKeys(map, maxEntries = 2000) {
  const entries = Object.entries(map).sort((left, right) => {
    return new Date(right[1]).getTime() - new Date(left[1]).getTime();
  });
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function buildDueReminderText(todo, config) {
  const dueAt = formatLocalDateTime(todo.dueAt, config.timezone);
  const title = todo.title || todo.body || `任务 ${todo.id}`;
  const extra = todo.body && todo.body !== todo.title ? `\n备注：${todo.body}` : "";
  return `待办到时间了\n任务：${title}\n截止：${dueAt}${extra}`;
}

function isSameLocalDate(value, dateKey, timezone) {
  return value ? toLocalDateKey(value, timezone) === dateKey : false;
}

function isSameLocalWeek(value, weekKey, timezone) {
  return value ? toWeekKey(value, timezone) === weekKey : false;
}

function buildSummarySnapshot(type, todos, now, config) {
  if (type === "daily") {
    const dayKey = toLocalDateKey(now, config.timezone);
    return {
      label: `日报 ${dayKey}`,
      openCount: todos.filter((todo) => !todo.isDone).length,
      overdue: todos.filter(
        (todo) => !todo.isDone && todo.dueAt && new Date(todo.dueAt).getTime() <= new Date(now).getTime(),
      ),
      dueInPeriod: todos.filter((todo) => isSameLocalDate(todo.dueAt, dayKey, config.timezone)),
      completedInPeriod: todos.filter(
        (todo) => todo.isDone && isSameLocalDate(todo.updatedAt || todo.dueAt, dayKey, config.timezone),
      ),
      createdInPeriod: todos.filter((todo) => isSameLocalDate(todo.createdAt, dayKey, config.timezone)),
    };
  }

  const weekKey = toWeekKey(now, config.timezone);
  return {
    label: `周报 ${weekKey.replace("weekly:", "")}`,
    openCount: todos.filter((todo) => !todo.isDone).length,
    overdue: todos.filter(
      (todo) => !todo.isDone && todo.dueAt && new Date(todo.dueAt).getTime() <= new Date(now).getTime(),
    ),
    dueInPeriod: todos.filter((todo) => isSameLocalWeek(todo.dueAt, weekKey, config.timezone)),
    completedInPeriod: todos.filter(
      (todo) => todo.isDone && isSameLocalWeek(todo.updatedAt || todo.dueAt, weekKey, config.timezone),
    ),
    createdInPeriod: todos.filter((todo) => isSameLocalWeek(todo.createdAt, weekKey, config.timezone)),
  };
}

function listForPrompt(todos, config, limit = 8) {
  return todos.slice(0, limit).map((todo) => ({
    id: todo.id,
    title: todo.title || todo.body || "(无标题)",
    due_at: todo.dueAt ? formatLocalDateTime(todo.dueAt, config.timezone) : "",
    updated_at: todo.updatedAt ? formatLocalDateTime(todo.updatedAt, config.timezone) : "",
  }));
}

function buildSummaryFallback(type, snapshot) {
  const lines = [
    `${snapshot.label}`,
    `未完成总数：${snapshot.openCount}`,
    `本期新增：${snapshot.createdInPeriod.length}`,
    `本期完成：${snapshot.completedInPeriod.length}`,
    `本期到期：${snapshot.dueInPeriod.length}`,
    `当前逾期：${snapshot.overdue.length}`,
  ];

  if (snapshot.overdue.length > 0) {
    lines.push(`需要优先关注：${snapshot.overdue.slice(0, 3).map((todo) => todo.title || todo.body || todo.id).join("；")}`);
  } else if (type === "daily") {
    lines.push("今天没有新的逾期事项。");
  } else {
    lines.push("本周整体节奏稳定，没有新增逾期高优先任务。");
  }

  return lines.join("\n");
}

async function generateSummary(type, todos, now, config) {
  const snapshot = buildSummarySnapshot(type, todos, now, config);

  if (snapshot.dueInPeriod.length === 0 &&
      snapshot.completedInPeriod.length === 0 &&
      snapshot.createdInPeriod.length === 0 &&
      snapshot.overdue.length === 0) {
    return buildSummaryFallback(type, snapshot);
  }

  if (!config.llmApiKey) {
    return buildSummaryFallback(type, snapshot);
  }

  const prompt = [
    `请基于以下待办数据，输出一段适合直接发微信的中文${type === "daily" ? "日报" : "周报"}。`,
    "要求：",
    "1. 直接输出正文，不要 markdown。",
    "2. 先给一句总览，再给 3-6 行重点。",
    "3. 语气简洁、像助理汇报。",
    "4. 明确提醒逾期项和接下来最值得关注的事项。",
    "",
    `统计概览：${JSON.stringify({
      label: snapshot.label,
      open_count: snapshot.openCount,
      created_count: snapshot.createdInPeriod.length,
      completed_count: snapshot.completedInPeriod.length,
      due_count: snapshot.dueInPeriod.length,
      overdue_count: snapshot.overdue.length,
    }, null, 2)}`,
    "",
    `本期新增：${JSON.stringify(listForPrompt(snapshot.createdInPeriod, config), null, 2)}`,
    `本期完成：${JSON.stringify(listForPrompt(snapshot.completedInPeriod, config), null, 2)}`,
    `本期到期：${JSON.stringify(listForPrompt(snapshot.dueInPeriod, config), null, 2)}`,
    `当前逾期：${JSON.stringify(listForPrompt(snapshot.overdue, config), null, 2)}`,
  ].join("\n");

  try {
    const response = await fetch(config.llmApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llmApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: config.llmModel,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: "你是中文效率助理，负责把待办数据整理成适合微信发送的简洁总结。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${bodyText}`);
    }

    const json = JSON.parse(bodyText);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    throw new Error("LLM 返回中没有正文内容");
  } catch (error) {
    console.warn(`[summary] ${type} 生成失败，回退本地模板: ${error.message}`);
    return buildSummaryFallback(type, snapshot);
  }
}

function waitForMqttConnect(client) {
  return new Promise((resolve, reject) => {
    if (client.connected) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MQTT 连接超时"));
    }, 10_000);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      client.off("connect", onConnect);
      client.off("error", onError);
    };

    client.on("connect", onConnect);
    client.on("error", onError);
  });
}

async function createMqttClient(config) {
  const client = mqtt.connect(config.mqttUri, {
    ...(config.mqttUser ? { username: config.mqttUser } : {}),
    ...(config.mqttPass ? { password: config.mqttPass } : {}),
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });
  await waitForMqttConnect(client);
  return client;
}

function publishMessage(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createDelivery(config) {
  if (config.deliveryMode === "mqtt") {
    const client = await createMqttClient(config);
    return {
      mode: "mqtt",
      async sendText(text) {
        await publishMessage(client, `${config.mqttTopic}/out`, buildOutgoingMessage({
          text,
          userId: config.targetUserId,
          ctx: config.targetCtx,
        }));
      },
      close() {
        client.end(true);
      },
    };
  }

  return {
    mode: "openclaw",
    async sendText(text) {
      await sendOpenClawWeixinText({
        weixinDir: config.weixinDir,
        accountId: config.weixinAccount,
        explicitUserId: config.targetUserId,
        explicitContextToken: config.targetCtx,
        text,
      });
    },
    close() {},
  };
}

async function maybeSendDueReminders(delivery, config, state, todos, now) {
  const notifiedDueKeys = new Set(Object.keys(state.notifiedDueKeys));
  const dueTodos = collectDueTodos(todos, { now, notifiedDueKeys });
  if (dueTodos.length === 0) return;

  for (const todo of dueTodos) {
    await delivery.sendText(buildDueReminderText(todo, config));
    const key = dueReminderKey(todo);
    state.notifiedDueKeys[key] = new Date(now).toISOString();
    saveState(config, state);
    console.log(`[due] 已发送 ${todo.id || todo.title}`);
  }
}

async function maybeSendSummaries(delivery, config, state, todos, now) {
  const sentKeys = new Set(Object.keys(state.sentSummaries));
  const dailyKey = shouldSendDailySummary({
    now,
    timezone: config.timezone,
    hour: config.dailyHour,
    minute: config.dailyMinute,
    sentKeys,
  });

  if (dailyKey) {
    const text = await generateSummary("daily", todos, now, config);
    await delivery.sendText(text);
    state.sentSummaries[dailyKey] = new Date(now).toISOString();
    saveState(config, state);
    sentKeys.add(dailyKey);
    console.log(`[summary] 已发送 ${dailyKey}`);
  }

  const weeklyKey = shouldSendWeeklySummary({
    now,
    timezone: config.timezone,
    weekday: config.weeklyWeekday,
    hour: config.weeklyHour,
    minute: config.weeklyMinute,
    sentKeys,
  });

  if (weeklyKey) {
    const text = await generateSummary("weekly", todos, now, config);
    await delivery.sendText(text);
    state.sentSummaries[weeklyKey] = new Date(now).toISOString();
    saveState(config, state);
    console.log(`[summary] 已发送 ${weeklyKey}`);
  }
}

async function runCycle(delivery, config, state) {
  const now = new Date();
  const todos = await fetchTodos(config);
  console.log(`[cycle] 拉取到 ${todos.length} 条 todo`);

  await maybeSendDueReminders(delivery, config, state, todos, now);
  await maybeSendSummaries(delivery, config, state, todos, now);

  state.notifiedDueKeys = uniqueRecentKeys(state.notifiedDueKeys);
  state.sentSummaries = uniqueRecentKeys(state.sentSummaries, 400);
  saveState(config, state);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const mode = process.argv[2] || "watch";
  const config = loadConfig();
  const state = loadState(config);
  const delivery = await createDelivery(config);

  if (delivery.mode === "mqtt") {
    console.log(`[startup] MQTT 已连接，topic=${config.mqttTopic}/out`);
  } else {
    console.log("[startup] 使用 OpenClaw 微信直发模式");
  }
  console.log(`[startup] 时区=${config.timezone} 轮询=${config.pollIntervalMs}ms`);

  if (mode === "once") {
    await runCycle(delivery, config, state);
    delivery.close();
    return;
  }

  while (true) {
    try {
      await runCycle(delivery, config, state);
    } catch (error) {
      console.error(`[cycle] 失败: ${error.message}`);
    }
    await sleep(config.pollIntervalMs);
  }
}

main().catch((error) => {
  console.error("notifier 启动失败:", error);
  process.exit(1);
});
