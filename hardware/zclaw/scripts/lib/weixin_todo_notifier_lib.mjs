const WEEKDAY_MAP = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseBooleanish(value, truthyValues = []) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;

  if (truthyValues.some((item) => normalized === normalizeString(item).toLowerCase())) {
    return true;
  }

  return ["true", "1", "yes", "y", "done", "completed"].includes(normalized);
}

export function getLocalParts(dateLike, timezone = "UTC") {
  const date = toDate(dateLike);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_MAP[parts.weekday] ?? 0,
  };
}

export function toLocalDateKey(dateLike, timezone = "UTC") {
  const parts = getLocalParts(dateLike, timezone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function toWeekKey(dateLike, timezone = "UTC") {
  const parts = getLocalParts(dateLike, timezone);
  const currentUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const offsetDays = Math.max(0, parts.weekday - 1);
  currentUtc.setUTCDate(currentUtc.getUTCDate() - offsetDays);
  const weekYear = currentUtc.getUTCFullYear();
  const weekMonth = currentUtc.getUTCMonth() + 1;
  const weekDay = currentUtc.getUTCDate();
  return `weekly:${weekYear}-${pad2(weekMonth)}-${pad2(weekDay)}`;
}

export function normalizeTodoRow(row, config = {}) {
  const {
    idField = "id",
    titleField = "title",
    bodyField = "description",
    dueAtField = "due_at",
    doneField = "completed",
    doneTruthyValues = [],
    statusField = "",
    doneStatusValues = ["done", "completed"],
    createdAtField = "created_at",
    updatedAtField = "updated_at",
  } = config;

  let isDone = false;
  if (doneField && Object.hasOwn(row, doneField)) {
    isDone = parseBooleanish(row[doneField], doneTruthyValues);
  } else if (statusField && Object.hasOwn(row, statusField)) {
    const normalizedStatus = normalizeString(row[statusField]).toLowerCase();
    isDone = doneStatusValues.some(
      (value) => normalizedStatus === normalizeString(value).toLowerCase(),
    );
  }

  return {
    id: normalizeString(row[idField]),
    title: normalizeString(row[titleField]),
    body: normalizeString(row[bodyField]),
    dueAt: normalizeString(row[dueAtField]),
    isDone,
    createdAt: normalizeString(row[createdAtField]),
    updatedAt: normalizeString(row[updatedAtField]),
    raw: row,
  };
}

export function dueReminderKey(todo) {
  return `${normalizeString(todo.id)}::${normalizeString(todo.dueAt)}`;
}

export function collectDueTodos(todos, options = {}) {
  const now = toDate(options.now ?? new Date()).getTime();
  const notifiedDueKeys = options.notifiedDueKeys ?? new Set();

  return [...todos]
    .filter((todo) => !todo.isDone)
    .filter((todo) => {
      if (!todo.dueAt) return false;
      const dueAt = new Date(todo.dueAt).getTime();
      if (!Number.isFinite(dueAt)) return false;
      return dueAt <= now;
    })
    .filter((todo) => !notifiedDueKeys.has(dueReminderKey(todo)))
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
}

export function shouldSendDailySummary(options = {}) {
  const {
    now = new Date(),
    timezone = "UTC",
    hour = 21,
    minute = 0,
    sentKeys = new Set(),
  } = options;

  const parts = getLocalParts(now, timezone);
  if (parts.hour < hour || (parts.hour === hour && parts.minute < minute)) {
    return null;
  }

  const key = `daily:${toLocalDateKey(now, timezone)}`;
  return sentKeys.has(key) ? null : key;
}

export function shouldSendWeeklySummary(options = {}) {
  const {
    now = new Date(),
    timezone = "UTC",
    weekday = 7,
    hour = 21,
    minute = 0,
    sentKeys = new Set(),
  } = options;

  const parts = getLocalParts(now, timezone);
  if (parts.weekday !== weekday) return null;
  if (parts.hour < hour || (parts.hour === hour && parts.minute < minute)) {
    return null;
  }

  const key = toWeekKey(now, timezone);
  return sentKeys.has(key) ? null : key;
}

export function buildOutgoingMessage({ text, userId, ctx } = {}) {
  const payload = { text: normalizeString(text) };
  if (userId) payload.user_id = normalizeString(userId);
  if (ctx) payload.ctx = normalizeString(ctx);
  return payload;
}
