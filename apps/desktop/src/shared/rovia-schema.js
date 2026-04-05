const path = require("path");

const SCHEMA_SOURCE = path.join(
  "supabase",
  "migrations",
  "202604041500_init_rovia.sql"
);

const TABLES = Object.freeze({
  telemetry: "telemetry_data",
  todos: "todos",
  focusSessions: "focus_sessions",
  appEvents: "app_events"
});

const SYNC_MODES = Object.freeze({
  demo: "demo",
  local: "local",
  backend: "backend",
  supabase: "supabase",
  authRequired: "auth-required"
});

const AUTH_MODES = Object.freeze({
  demo: "demo",
  local: "local",
  session: "session",
  staticUser: "static-user",
  anonymous: "anonymous"
});

const TODO_STATUSES = Object.freeze({
  pending: "pending",
  doing: "doing",
  done: "done"
});

const FOCUS_DB_STATUSES = Object.freeze({
  running: "running",
  away: "away",
  completed: "completed",
  interrupted: "interrupted",
  canceled: "canceled"
});

const FOCUS_LOCAL_STATUSES = Object.freeze({
  focusing: "focusing",
  away: "away",
  completed: "completed",
  interrupted: "interrupted",
  canceled: "canceled"
});

const DEFAULT_FOCUS_DURATION_SEC = 20 * 60;
const DEFAULT_TODO_PRIORITY = 1;
const SQUEEZE_SENSOR_MAX = 4095;

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizePressurePercent(snapshot) {
  if (snapshot?.pressurePercent !== undefined && snapshot?.pressurePercent !== null) {
    return Math.round(clampNumber(Number(snapshot.pressurePercent), 0, 100) * 100) / 100;
  }

  if (snapshot?.pressureValue !== undefined && snapshot?.pressureValue !== null) {
    const numericValue = Number(snapshot.pressureValue);
    if (Number.isFinite(numericValue)) {
      if (numericValue > 100) {
        return Math.round(
          clampNumber((numericValue / SQUEEZE_SENSOR_MAX) * 100, 0, 100) * 100
        ) / 100;
      }

      return Math.round(clampNumber(numericValue, 0, 100) * 100) / 100;
    }
  }

  return 0;
}

function normalizePressureRaw(snapshot) {
  if (snapshot?.pressureRaw !== undefined && snapshot?.pressureRaw !== null) {
    return Math.round(clampNumber(Number(snapshot.pressureRaw), 0, SQUEEZE_SENSOR_MAX));
  }

  if (snapshot?.pressureValue !== undefined && snapshot?.pressureValue !== null) {
    const numericValue = Number(snapshot.pressureValue);
    if (Number.isFinite(numericValue)) {
      if (numericValue > 100) {
        return Math.round(clampNumber(numericValue, 0, SQUEEZE_SENSOR_MAX));
      }

      return Math.round((clampNumber(numericValue, 0, 100) / 100) * SQUEEZE_SENSOR_MAX);
    }
  }

  return 0;
}

function normalizeTodoStatus(status, isCompleted = false) {
  if (isCompleted || status === TODO_STATUSES.done) {
    return TODO_STATUSES.done;
  }

  if (status === TODO_STATUSES.doing) {
    return TODO_STATUSES.doing;
  }

  return TODO_STATUSES.pending;
}

function buildTodoRow(todo, userId) {
  const status = normalizeTodoStatus(todo.status);
  const now = new Date().toISOString();

  return {
    id: todo.id,
    user_id: userId,
    title: todo.title,
    task_text: todo.title,
    status,
    is_completed: status === TODO_STATUSES.done,
    is_active: Boolean(todo.isActive),
    priority: todo.priority ?? DEFAULT_TODO_PRIORITY,
    updated_at: todo.updatedAt || now
  };
}

function mapTodoRow(row) {
  return {
    id: row.id,
    title: row.task_text || row.title || "Untitled task",
    status: normalizeTodoStatus(row.status, row.is_completed),
    isActive: Boolean(row.is_active),
    priority: row.priority ?? DEFAULT_TODO_PRIORITY,
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function toDbFocusStatus(status) {
  if (status === FOCUS_LOCAL_STATUSES.focusing) {
    return FOCUS_DB_STATUSES.running;
  }

  if (status === FOCUS_LOCAL_STATUSES.away) {
    return FOCUS_DB_STATUSES.away;
  }

  if (status === FOCUS_LOCAL_STATUSES.completed) {
    return FOCUS_DB_STATUSES.completed;
  }

  if (status === FOCUS_LOCAL_STATUSES.interrupted) {
    return FOCUS_DB_STATUSES.interrupted;
  }

  if (status === FOCUS_LOCAL_STATUSES.canceled) {
    return FOCUS_DB_STATUSES.canceled;
  }

  return FOCUS_DB_STATUSES.running;
}

function fromDbFocusStatus(status) {
  if (status === FOCUS_DB_STATUSES.away) {
    return FOCUS_LOCAL_STATUSES.away;
  }

  if (status === FOCUS_DB_STATUSES.completed) {
    return FOCUS_LOCAL_STATUSES.completed;
  }

  if (status === FOCUS_DB_STATUSES.interrupted) {
    return FOCUS_LOCAL_STATUSES.interrupted;
  }

  if (status === FOCUS_DB_STATUSES.canceled) {
    return FOCUS_LOCAL_STATUSES.canceled;
  }

  return FOCUS_LOCAL_STATUSES.focusing;
}

function isActiveFocusStatus(status) {
  const normalized = toDbFocusStatus(status);
  return (
    normalized === FOCUS_DB_STATUSES.running ||
    normalized === FOCUS_DB_STATUSES.away
  );
}

function isTerminalFocusStatus(status) {
  const normalized = toDbFocusStatus(status);
  return (
    normalized === FOCUS_DB_STATUSES.completed ||
    normalized === FOCUS_DB_STATUSES.interrupted ||
    normalized === FOCUS_DB_STATUSES.canceled
  );
}

function getPlannedEndAt(startedAt, durationSec) {
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) {
    return new Date(Date.now() + durationSec * 1000).toISOString();
  }

  return new Date(startMs + durationSec * 1000).toISOString();
}

function buildFocusSessionRow(session, userId) {
  const durationSec = session.durationSec ?? DEFAULT_FOCUS_DURATION_SEC;

  return {
    id: session.id,
    user_id: userId,
    todo_id: session.todoId || null,
    task_title: session.taskTitle,
    start_time: session.startedAt,
    end_time: session.endedAt || null,
    duration: Math.round(durationSec / 60),
    duration_sec: durationSec,
    status: toDbFocusStatus(session.status),
    trigger_source: session.triggerSource || "desktop",
    start_physio_state: session.startPhysioState || "unknown",
    away_count: session.awayCount ?? 0,
    updated_at: session.updatedAt || new Date().toISOString()
  };
}

function mapFocusSessionRow(row) {
  const durationSec =
    row.duration_sec ??
    (typeof row.duration === "number"
      ? row.duration * 60
      : DEFAULT_FOCUS_DURATION_SEC);
  const startedAt = row.start_time || row.created_at || new Date().toISOString();

  return {
    id: row.id,
    todoId: row.todo_id || null,
    taskTitle: row.task_title || "本次专注",
    status: fromDbFocusStatus(row.status),
    durationSec,
    triggerSource: row.trigger_source || "desktop",
    startedAt,
    plannedEndAt: getPlannedEndAt(startedAt, durationSec),
    endedAt: row.end_time || null,
    startPhysioState: row.start_physio_state || "unknown",
    awayCount: row.away_count ?? 0,
    remindersSent: [],
    updatedAt: row.updated_at || row.created_at || startedAt
  };
}

function buildTelemetryRow(snapshot, userId) {
  return {
    user_id: userId,
    heart_rate: snapshot.heartRate ?? null,
    hrv: snapshot.hrv ?? null,
    sdnn: snapshot.sdnn ?? null,
    focus_score: snapshot.focusScore ?? null,
    stress_level: snapshot.stressScore ?? null,
    distance_meters: snapshot.distanceMeters ?? null,
    wearable_rssi: snapshot.wearableRssi ?? null,
    squeeze_pressure: snapshot.pressureRaw ?? snapshot.pressureValue ?? null,
    squeeze_level: snapshot.pressureLevel || null,
    source_device: snapshot.sourceDevice || null,
    physio_state: snapshot.physioState || "unknown",
    is_at_desk: Boolean(snapshot.isAtDesk),
    recorded_at: snapshot.recordedAt || new Date().toISOString()
  };
}

function mapTelemetryRow(row) {
  if (!row) {
    return null;
  }

  const pressureSnapshot = {
    pressureValue: row.squeeze_pressure ?? 0
  };
  const pressurePercent = normalizePressurePercent(pressureSnapshot);
  const pressureRaw = normalizePressureRaw(pressureSnapshot);

  return {
    heartRate: row.heart_rate ?? null,
    hrv: row.hrv ?? 0,
    sdnn: row.sdnn ?? null,
    focusScore: row.focus_score ?? null,
    stressScore: row.stress_level ?? 0,
    distanceMeters: row.distance_meters ?? null,
    wearableRssi: row.wearable_rssi ?? null,
    pressureValue: pressurePercent,
    pressurePercent,
    pressureRaw,
    pressureLevel: row.squeeze_level || "idle",
    sourceDevice: row.source_device || null,
    physioState: row.physio_state || "unknown",
    presenceState: row.is_at_desk ? "near" : "far",
    isAtDesk: Boolean(row.is_at_desk),
    recordedAt: row.recorded_at || row.created_at || new Date().toISOString()
  };
}

module.exports = {
  AUTH_MODES,
  DEFAULT_FOCUS_DURATION_SEC,
  DEFAULT_TODO_PRIORITY,
  FOCUS_DB_STATUSES,
  FOCUS_LOCAL_STATUSES,
  SCHEMA_SOURCE,
  SYNC_MODES,
  TABLES,
  TODO_STATUSES,
  buildFocusSessionRow,
  buildTelemetryRow,
  buildTodoRow,
  fromDbFocusStatus,
  getPlannedEndAt,
  isActiveFocusStatus,
  isTerminalFocusStatus,
  mapFocusSessionRow,
  mapTelemetryRow,
  mapTodoRow,
  normalizeTodoStatus,
  toDbFocusStatus
};
