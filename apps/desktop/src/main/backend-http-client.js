const { BackendEventAdapter } = require("./backend-adapter");

const DEFAULT_FOCUS_DURATION_MIN = 20;

function buildDefaultAuthState(baseUrl) {
  return {
    configured: Boolean(baseUrl),
    mode: baseUrl ? "anonymous" : "local",
    isLoggedIn: false,
    hasIdentity: false,
    needsLogin: Boolean(baseUrl),
    email: null,
    userId: null
  };
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  return text.replace(/\/+$/, "");
}

function deriveBackendBaseUrl({ explicitBaseUrl, fallbackWsUrl }) {
  const normalizedExplicit = normalizeBaseUrl(explicitBaseUrl);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const wsUrl = String(fallbackWsUrl || "").trim();
  if (!wsUrl) {
    return null;
  }

  try {
    const parsed = new URL(wsUrl);
    if (!parsed.pathname.endsWith("/ws/telemetry")) {
      return null;
    }

    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = parsed.pathname.slice(0, -"/ws/telemetry".length) || "/";
    parsed.search = "";
    parsed.hash = "";
    return normalizeBaseUrl(parsed.toString());
  } catch (_error) {
    return null;
  }
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapTodoStatus(isCompleted) {
  return isCompleted ? "done" : "pending";
}

function mapFocusStatus(status) {
  if (status === "running") {
    return "focusing";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "canceled") {
    return "canceled";
  }

  return "focusing";
}

function mapTriggerSource(source) {
  if (source === "wristband_button" || source === "squeeze") {
    return "wearable";
  }

  return "desktop";
}

function toPlannedEndAt(startedAt, durationSec) {
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) {
    return new Date(Date.now() + durationSec * 1000).toISOString();
  }

  return new Date(startedMs + durationSec * 1000).toISOString();
}

class BackendHttpClient {
  constructor({ baseUrl, authStorage }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.authStorage = authStorage || null;
    this.adapter = new BackendEventAdapter();
    this.session = null;
    this.authState = buildDefaultAuthState(this.baseUrl);
    this.profile = {};
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async init() {
    if (!this.isConfigured() || !this.authStorage) {
      return;
    }

    const saved = await this.authStorage.load();
    const accessToken = saved?.session?.access_token;

    if (!accessToken) {
      return;
    }

    this.session = {
      access_token: accessToken
    };

    try {
      await this.fetchSession();
    } catch (_error) {
      this.applyAuthPayload({
        session: null,
        auth: buildDefaultAuthState(this.baseUrl),
        profile: {}
      });
      await this.persistSession(null);
    }
  }

  getSession() {
    return this.session;
  }

  getAuthState() {
    return {
      ...this.authState
    };
  }

  async persistSession(session) {
    this.session = session || null;

    if (!this.authStorage) {
      return;
    }

    await this.authStorage.save(
      this.session?.access_token
        ? {
            session: {
              access_token: this.session.access_token
            }
          }
        : {
            session: null
          }
    );
  }

  applyAuthPayload(payload = {}) {
    this.session = payload.session || null;
    this.authState = payload.auth || buildDefaultAuthState(this.baseUrl);
    this.profile = payload.profile || {};
    return payload;
  }

  async request(pathname, { method = "GET", body } = {}) {
    if (!this.isConfigured()) {
      throw new Error("Backend API 还没有配置。");
    }

    const headers = {};
    if (body) {
      headers["content-type"] = "application/json";
    }

    if (this.session?.access_token) {
      headers.authorization = `Bearer ${this.session.access_token}`;
    }

    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `[backend] ${method} ${pathname} failed: ${response.status} ${errorText}`.trim()
      );
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  mapLatestTelemetry(snapshot) {
    const [event] = this.adapter.adapt({
      event: "snapshot",
      data: snapshot
    });

    if (!event || event.type !== "telemetry") {
      return null;
    }

    return {
      heartRate: event.heartRate ?? null,
      hrv: event.hrv ?? 0,
      sdnn: event.sdnn ?? null,
      focusScore: event.focusScore ?? null,
      stressScore: event.stressScore ?? 0,
      distanceMeters: event.distanceMeters ?? null,
      wearableRssi: event.wearableRssi ?? null,
      pressureValue: event.pressurePercent ?? 0,
      pressurePercent: event.pressurePercent ?? 0,
      pressureRaw: event.pressureRaw ?? 0,
      pressureLevel: event.pressureLevel || "idle",
      sourceDevice: event.sourceDevice || "backend",
      physioState: event.physioState || "unknown",
      presenceState: event.presenceState || "near",
      isAtDesk: event.presenceState === "near",
      recordedAt: event.recordedAt || new Date().toISOString()
    };
  }

  mapTodoRow(row) {
    return {
      id: row.id,
      title: row.task_text || "Untitled task",
      status: mapTodoStatus(Boolean(row.is_completed)),
      isActive: false,
      backendSynced: true,
      priority: toNumberOrNull(row.priority) ?? 1,
      updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      startTime: row.start_time || null,
      endTime: row.end_time || null
    };
  }

  mapFocusSessionRow(row) {
    const durationMinutes =
      toNumberOrNull(row.duration_minutes) ??
      toNumberOrNull(row.duration) ??
      DEFAULT_FOCUS_DURATION_MIN;
    const durationSec = Math.max(1, durationMinutes) * 60;
    const startedAt = row.start_time || row.created_at || new Date().toISOString();

    return {
      id: row.id,
      todoId: null,
      taskTitle: "本次专注",
      status: mapFocusStatus(row.status),
      backendSynced: true,
      durationSec,
      triggerSource: mapTriggerSource(row.trigger_source),
      startedAt,
      plannedEndAt: toPlannedEndAt(startedAt, durationSec),
      endedAt: row.end_time || null,
      startPhysioState: "unknown",
      awayCount: 0,
      remindersSent: [],
      updatedAt: row.end_time || row.updated_at || startedAt
    };
  }

  async fetchLatestTelemetry() {
    const snapshot = await this.request("/api/telemetry/latest");
    return this.mapLatestTelemetry(snapshot);
  }

  async fetchTodos() {
    const rows = await this.request("/api/todos");
    return Array.isArray(rows) ? rows.map((row) => this.mapTodoRow(row)) : [];
  }

  async fetchFocusSessions(limit = 20) {
    const response = await this.request(`/api/focus/sessions?limit=${limit}`);
    const rows = Array.isArray(response?.data) ? response.data : [];
    return rows.map((row) => this.mapFocusSessionRow(row));
  }

  async fetchFriends() {
    const response = await this.request("/api/friends/recommendations");
    return Array.isArray(response?.data) ? response.data : [];
  }

  async fetchFriendRanking(limit = 20) {
    const response = await this.request(
      `/api/friends/ranking?limit=${encodeURIComponent(limit)}`
    );
    return Array.isArray(response?.data) ? response.data : [];
  }

  async requestFriend(friendId) {
    return this.request("/api/friends/request", {
      method: "POST",
      body: {
        friend_id: friendId
      }
    });
  }

  async acceptFriend(friendId) {
    return this.request("/api/friends/accept", {
      method: "POST",
      body: {
        friend_id: friendId
      }
    });
  }

  async fetchDashboardSnapshot() {
    const [latestTelemetry, todos, focusSessions, friends, friendRanking] = await Promise.all([
      this.fetchLatestTelemetry(),
      this.fetchTodos(),
      this.fetchFocusSessions(20),
      this.fetchFriends(),
      this.fetchFriendRanking(20)
    ]);

    return {
      latestTelemetry,
      todos,
      focusSessions,
      friends,
      friendRanking
    };
  }

  async fetchSession() {
    const payload = this.applyAuthPayload(await this.request("/api/auth/session"));
    await this.persistSession(this.session);
    return payload;
  }

  async signInWithPassword({ email, password }) {
    const payload = this.applyAuthPayload(
      await this.request("/api/auth/sign-in", {
        method: "POST",
        body: {
          email,
          password
        }
      })
    );
    await this.persistSession(this.session);
    return payload;
  }

  async signUpWithPassword({ email, password }) {
    const payload = this.applyAuthPayload(
      await this.request("/api/auth/sign-up", {
        method: "POST",
        body: {
          email,
          password
        }
      })
    );
    await this.persistSession(this.session);
    return payload;
  }

  async signInDemo() {
    const payload = this.applyAuthPayload(
      await this.request("/api/auth/demo-sign-in", {
        method: "POST"
      })
    );
    await this.persistSession(this.session);
    return payload;
  }

  async signOut() {
    const payload = await this.request("/api/auth/sign-out", {
      method: "POST"
    });
    this.applyAuthPayload(payload);
    await this.persistSession(this.session);
    return payload;
  }

  async createTodo(todo) {
    const response = await this.request("/api/todos", {
      method: "POST",
      body: {
        task_text: todo.title,
        priority: todo.priority ?? 1,
        start_time: todo.startTime || null,
        end_time: todo.endTime || null
      }
    });

    return response ? this.mapTodoRow(response) : null;
  }

  async updateTodo(todoId, todo) {
    const response = await this.request(`/api/todos/${todoId}`, {
      method: "PATCH",
      body: {
        task_text: todo.title,
        is_completed: todo.status === "done",
        priority: todo.priority ?? 1,
        start_time: todo.startTime || null,
        end_time: todo.endTime || null
      }
    });

    return response && response.id ? this.mapTodoRow(response) : null;
  }

  async deleteTodo(todoId) {
    await this.request(`/api/todos/${todoId}`, {
      method: "DELETE"
    });
  }

  async startFocusSession({ durationMinutes, triggerSource }) {
    const response = await this.request("/api/focus/start", {
      method: "POST",
      body: {
        duration_minutes: durationMinutes,
        trigger_source:
          triggerSource === "wearable" ? "wristband_button" : "manual"
      }
    });

    return response ? this.mapFocusSessionRow(response) : null;
  }

  async finishFocusSession({ sessionId, status }) {
    const response = await this.request("/api/focus/finish", {
      method: "POST",
      body: {
        session_id: sessionId,
        status: status === "completed" ? "completed" : "canceled"
      }
    });

    return response ? this.mapFocusSessionRow(response) : null;
  }

  async fetchDevicesStatus() {
    return this.request("/api/devices/status");
  }

  async fetchDevicesConfig() {
    return this.request("/api/devices/config");
  }

  async scanDevices(timeout = 5) {
    const value = Number(timeout);
    const nextTimeout = Number.isFinite(value) ? value : 5;
    return this.request(`/api/devices/scan?timeout=${encodeURIComponent(nextTimeout)}`);
  }

  async configureDevices({ wristband = "", squeeze = "" } = {}) {
    return this.request("/api/devices/configure", {
      method: "POST",
      body: {
        wristband,
        squeeze
      }
    });
  }

  async disconnectDevice(deviceType = "all") {
    return this.request("/api/devices/disconnect", {
      method: "POST",
      body: {
        device_type: deviceType
      }
    });
  }

  async reconnectDevice(deviceType = "all") {
    return this.request("/api/devices/reconnect", {
      method: "POST",
      body: {
        device_type: deviceType
      }
    });
  }
}

module.exports = {
  BackendHttpClient,
  deriveBackendBaseUrl
};
