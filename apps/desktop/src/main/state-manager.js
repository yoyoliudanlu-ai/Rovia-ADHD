const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

const {
  AUTH_MODES,
  DEFAULT_FOCUS_DURATION_SEC,
  SYNC_MODES,
  isActiveFocusStatus,
  isTerminalFocusStatus
} = require("../shared/rovia-schema");
const {
  buildDemoAccountState,
  buildDemoExperience
} = require("./demo-state");

const STATUS_TO_EMOTION = {
  Disconnected: "Offline",
  Idle: "Calm",
  Ready: "Invite",
  Support: "Care",
  Focusing: "Focus",
  Away: "Wait",
  Completed: "Celebrate"
};

const TODO_TAGS = Object.freeze({
  study: "study",
  work: "work",
  home: "home",
  health: "health",
  social: "social",
  general: "general"
});

const SQUEEZE_TIMELINE_BUCKETS = 10;
const SQUEEZE_TIMELINE_BUCKET_MS = 60 * 1000;
const SQUEEZE_STATS_WINDOW_MS =
  SQUEEZE_TIMELINE_BUCKETS * SQUEEZE_TIMELINE_BUCKET_MS;
const SQUEEZE_SENSOR_MAX = 4095;

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizePressurePercent(pressureValue, pressurePercent) {
  if (Number.isFinite(pressurePercent)) {
    return Math.round(clampNumber(pressurePercent, 0, 100) * 100) / 100;
  }

  if (!Number.isFinite(pressureValue)) {
    return 0;
  }

  if (pressureValue > 100) {
    return Math.round(
      clampNumber((pressureValue / SQUEEZE_SENSOR_MAX) * 100, 0, 100) * 100
    ) / 100;
  }

  return Math.round(clampNumber(pressureValue, 0, 100) * 100) / 100;
}

function normalizePressureRaw(pressureValue, pressureRaw, pressurePercent) {
  if (Number.isFinite(pressureRaw)) {
    return Math.round(clampNumber(pressureRaw, 0, SQUEEZE_SENSOR_MAX));
  }

  if (Number.isFinite(pressureValue) && pressureValue > 100) {
    return Math.round(clampNumber(pressureValue, 0, SQUEEZE_SENSOR_MAX));
  }

  const percent = normalizePressurePercent(pressureValue, pressurePercent);
  return Math.round((percent / 100) * SQUEEZE_SENSOR_MAX);
}

function normalizeTodoTag(tag) {
  const value = String(tag || "")
    .trim()
    .toLowerCase();
  return Object.values(TODO_TAGS).includes(value) ? value : TODO_TAGS.general;
}

function inferTodoTagByTitle(title) {
  const text = String(title || "").toLowerCase();

  if (/(论文|复习|考试|课程|作业|study|thesis)/.test(text)) {
    return TODO_TAGS.study;
  }
  if (/(调研|okr|汇报|会议|项目|work|market)/.test(text)) {
    return TODO_TAGS.work;
  }
  if (/(遛狗|洗衣|家务|做饭|打扫|home|chores)/.test(text)) {
    return TODO_TAGS.home;
  }
  if (/(运动|睡眠|冥想|health|锻炼)/.test(text)) {
    return TODO_TAGS.health;
  }
  if (/(社交|好友|约|social|friend)/.test(text)) {
    return TODO_TAGS.social;
  }

  return TODO_TAGS.general;
}

const DEFAULT_TODOS = [
  {
    id: randomUUID(),
    title: "路演稿撰写",
    tag: TODO_TAGS.work,
    status: "pending",
    isActive: true,
    priority: 2,
    scheduledAt: new Date("2026-04-06T10:00:00+08:00").toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: randomUUID(),
    title: "毕业论文开题报告修改",
    tag: TODO_TAGS.study,
    status: "pending",
    isActive: false,
    priority: 1,
    scheduledAt: new Date("2026-04-06T14:30:00+08:00").toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: randomUUID(),
    title: "手环阈值路测复盘",
    tag: TODO_TAGS.work,
    status: "pending",
    isActive: false,
    priority: 0,
    scheduledAt: new Date("2026-04-06T19:00:00+08:00").toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function cloneDefaults() {
  return DEFAULT_TODOS.map((todo) => ({ ...todo }));
}

function hasDefaultTodoSeed(todos) {
  if (!Array.isArray(todos) || todos.length !== DEFAULT_TODOS.length) {
    return false;
  }

  return DEFAULT_TODOS.every(
    (todo, index) => todos[index] && todos[index].title === todo.title
  );
}

function buildDefaultAuthState() {
  return {
    configured: false,
    mode: "local",
    isLoggedIn: false,
    hasIdentity: false,
    needsLogin: false,
    email: null,
    userId: null
  };
}

function buildDefaultRemoteData() {
  return {
    lastSyncedAt: null,
    latestTelemetry: null,
    latestFocusSession: null,
    recentFocusSessions: [],
    friends: [],
    friendRanking: [],
    focusSummary: {
      totalSessions: 0,
      completedSessions: 0,
      interruptedSessions: 0,
      totalMinutes: 0,
      averageMinutes: 0
    }
  };
}

function buildDefaultSqueezeState() {
  return {
    pulseCount1m: 0,
    pulseCount5m: 0,
    ratePerMinute: 0,
    averageIntervalSec: null,
    lastPulseAt: null,
    timeline: Array.from({ length: SQUEEZE_TIMELINE_BUCKETS }, (_, index) => ({
      index,
      count: 0
    }))
  };
}

function summarizeSqueezePulseTimes(pulseTimes, nowMs = Date.now()) {
  const recentTimes = pulseTimes
    .filter((timestamp) => Number.isFinite(timestamp))
    .filter((timestamp) => nowMs - timestamp <= SQUEEZE_STATS_WINDOW_MS)
    .sort((left, right) => left - right);

  const pulseCount1m = recentTimes.filter(
    (timestamp) => nowMs - timestamp <= 60 * 1000
  ).length;
  const pulseCount5m = recentTimes.filter(
    (timestamp) => nowMs - timestamp <= 5 * 60 * 1000
  ).length;

  let averageIntervalSec = null;
  if (recentTimes.length >= 2) {
    const intervals = [];
    for (let index = 1; index < recentTimes.length; index += 1) {
      intervals.push((recentTimes[index] - recentTimes[index - 1]) / 1000);
    }
    averageIntervalSec =
      Math.round(
        (intervals.reduce((sum, value) => sum + value, 0) / intervals.length) *
          10
      ) / 10;
  }

  const timeline = Array.from({ length: SQUEEZE_TIMELINE_BUCKETS }, (_, index) => {
    const bucketEnd = nowMs - (SQUEEZE_TIMELINE_BUCKETS - 1 - index) * SQUEEZE_TIMELINE_BUCKET_MS;
    const bucketStart = bucketEnd - SQUEEZE_TIMELINE_BUCKET_MS;
    return {
      index,
      count: recentTimes.filter(
        (timestamp) => timestamp > bucketStart && timestamp <= bucketEnd
      ).length
    };
  });

  return {
    pulseCount1m,
    pulseCount5m,
    ratePerMinute: pulseCount1m,
    averageIntervalSec,
    lastPulseAt: recentTimes.length
      ? new Date(recentTimes[recentTimes.length - 1]).toISOString()
      : null,
    timeline
  };
}

function buildDefaultState() {
  return {
    demoMode: false,
    runtimeStatus: "Idle",
    emotion: STATUS_TO_EMOTION.Idle,
    syncMode: SYNC_MODES.local,
    panelOpen: false,
    settings: {
      soundEnabled: false,
      cameraEnabled: false
    },
    auth: buildDefaultAuthState(),
    connection: {
      wearable: true,
      proximity: true,
      backend: false,
      supabase: false
    },
    squeeze: buildDefaultSqueezeState(),
    metrics: {
      physioState: "ready",
      heartRate: null,
      hrv: 46,
      sdnn: null,
      focusScore: null,
      stressScore: 28,
      distanceMeters: null,
      wearableRssi: null,
      pressureValue: 0,
      pressurePercent: 0,
      pressureRaw: 0,
      pressureLevel: "idle",
      sourceDevice: null,
      presenceState: "near",
      lastSensorAt: new Date().toISOString()
    },
    todos: cloneDefaults(),
    focusSession: null,
    lastCompletedSession: null,
    lastCue: null,
    remoteData: buildDefaultRemoteData()
  };
}

function getSessionSortTime(session) {
  return new Date(
    session?.updatedAt || session?.endedAt || session?.startedAt || 0
  ).getTime();
}

function summarizeFocusSessions(sessions) {
  const completedSessions = sessions.filter(
    (session) => session.status === "completed"
  ).length;
  const interruptedSessions = sessions.filter(
    (session) =>
      session.status === "interrupted" || session.status === "canceled"
  ).length;
  const totalDurationSec = sessions.reduce(
    (sum, session) => sum + (session.durationSec || DEFAULT_FOCUS_DURATION_SEC),
    0
  );
  const totalMinutes = Math.round(totalDurationSec / 60);
  const averageMinutes = sessions.length
    ? Math.round((totalDurationSec / 60 / sessions.length) * 10) / 10
    : 0;

  return {
    totalSessions: sessions.length,
    completedSessions,
    interruptedSessions,
    totalMinutes,
    averageMinutes
  };
}

class RoviaStateManager extends EventEmitter {
  constructor({ storage, supabase, backend }) {
    super();
    this.storage = storage;
    this.supabase = supabase;
    this.backend = backend;
    this.state = buildDefaultState();
    this.squeezePulseTimes = [];
    this.ticker = null;
    this.awayTimer = null;
    this.unsubscribeTodos = null;
    this.unsubscribeFocusSessions = null;
    this.persistTimer = null;
  }

  async init() {
    const persisted = await this.storage.load();

    if (persisted) {
      this.state = {
        ...buildDefaultState(),
        ...persisted,
        settings: {
          ...buildDefaultState().settings,
          ...(persisted.settings || {})
        },
        auth: {
          ...buildDefaultAuthState(),
          ...(persisted.auth || {})
        },
        connection: {
          ...buildDefaultState().connection,
          ...(persisted.connection || {})
        },
        squeeze: {
          ...buildDefaultSqueezeState(),
          ...(persisted.squeeze || {})
        },
        metrics: {
          ...buildDefaultState().metrics,
          ...(persisted.metrics || {})
        },
        todos:
          persisted.todos && persisted.todos.length > 0
            ? persisted.todos
            : cloneDefaults(),
        remoteData: {
          ...buildDefaultRemoteData(),
          ...(persisted.remoteData || {}),
          focusSummary: {
            ...buildDefaultRemoteData().focusSummary,
            ...(persisted.remoteData?.focusSummary || {})
          }
        }
      };
    }

    this.state.todos = this.state.todos.map((todo) => ({
      ...todo,
      tag: normalizeTodoTag(todo.tag || inferTodoTagByTitle(todo.title))
    }));

    // Privacy-safe default: camera always starts disabled on app launch,
    // even if the previous session left it enabled.
    this.state.settings.cameraEnabled = false;

    this.refreshAuthState();

    if (this.backend?.isConfigured?.()) {
      this.clearDemoForRealAccount();
    }

    if (this.shouldEnableDemoMode()) {
      this.applyDemoExperience();
    }

    const backendConfigured = Boolean(this.backend?.isConfigured?.());
    let backendConnected = false;
    if (backendConfigured) {
      backendConnected = await this.connectBackend();
    }

    if (!backendConfigured && !backendConnected && this.supabase.isConfigured()) {
      await this.connectSupabase();
    }

    this.recomputeRuntimeStatus();
    this.startTicker();
    await this.persistState();
  }

  destroy() {
    clearInterval(this.ticker);
    clearTimeout(this.awayTimer);
    clearTimeout(this.persistTimer);

    if (this.unsubscribeTodos) {
      this.unsubscribeTodos();
    }

    if (this.unsubscribeFocusSessions) {
      this.unsubscribeFocusSessions();
    }
  }

  startTicker() {
    this.ticker = setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    if (!this.state.focusSession) {
      return;
    }

    const remainingSec = this.getRemainingSec();

    if (remainingSec <= 0) {
      this.completeFocus();
      return;
    }

    this.maybeFireReminder(remainingSec);
    this.emitState();
  }

  refreshAuthState() {
    const backendAuth =
      this.backend?.isConfigured?.() && this.backend?.getAuthState
        ? {
            ...buildDefaultAuthState(),
            ...this.backend.getAuthState()
          }
        : null;

    if (backendAuth?.configured) {
      this.state.auth = backendAuth;
      this.updateSyncMode();
      return;
    }

    const supabaseAuth = {
      ...buildDefaultAuthState(),
      ...this.supabase.getAuthState()
    };

    this.state.auth =
      this.state.demoMode &&
      !supabaseAuth.isLoggedIn &&
      supabaseAuth.mode !== AUTH_MODES.staticUser
        ? buildDemoAccountState({
            configured: supabaseAuth.configured
          })
        : supabaseAuth;

    this.updateSyncMode();
  }

  updateSyncMode() {
    if (this.state.connection.backend) {
      this.state.syncMode = SYNC_MODES.backend;
      return;
    }

    if (this.state.connection.supabase) {
      this.state.syncMode = SYNC_MODES.supabase;
      return;
    }

    if (this.state.demoMode) {
      this.state.syncMode = SYNC_MODES.demo;
      return;
    }

    this.state.syncMode = this.state.auth.needsLogin
      ? SYNC_MODES.authRequired
      : SYNC_MODES.local;
  }

  clearRemoteData() {
    this.state.remoteData = buildDefaultRemoteData();
  }

  async teardownSupabaseSubscriptions() {
    const unsubscribers = [
      this.unsubscribeTodos,
      this.unsubscribeFocusSessions
    ].filter(Boolean);

    this.unsubscribeTodos = null;
    this.unsubscribeFocusSessions = null;

    await Promise.allSettled(unsubscribers.map((unsubscribe) => unsubscribe()));
  }

  async connectSupabase() {
    await this.teardownSupabaseSubscriptions();
    this.refreshAuthState();

    if (!this.supabase.canSync()) {
      this.state.connection.supabase = false;
      this.updateSyncMode();
      return;
    }

    try {
      const snapshot = await this.supabase.fetchDashboardSnapshot();
      this.applyRemoteSnapshot(snapshot);
      this.state.connection.backend = false;
      this.state.connection.supabase = true;
      this.updateSyncMode();

      this.unsubscribeTodos = this.supabase.subscribeTodos((remoteTodosSet) => {
        this.state.todos = this.reconcileTodos(remoteTodosSet);
        this.state.remoteData.lastSyncedAt = new Date().toISOString();
        this.recomputeRuntimeStatus();
        this.schedulePersist();
        this.emitState();
      });

      this.unsubscribeFocusSessions = this.supabase.subscribeFocusSessions(
        (remoteFocusSessions) => {
          this.applyRemoteFocusSessions(remoteFocusSessions);
          this.recomputeRuntimeStatus();
          this.schedulePersist();
          this.emitState();
        }
      );
    } catch (error) {
      console.warn("[supabase] init failed, fallback to local mode", error);
      this.state.connection.supabase = false;
      this.updateSyncMode();
    }
  }

  async connectBackend() {
    await this.teardownSupabaseSubscriptions();

    if (!this.backend?.isConfigured?.()) {
      this.state.connection.backend = false;
      this.updateSyncMode();
      return false;
    }

    try {
      const snapshot = await this.backend.fetchDashboardSnapshot();
      this.clearDemoForRealAccount();
      this.clearRemoteData();
      this.applyRemoteSnapshot(snapshot);
      this.state.connection.backend = true;
      this.state.connection.supabase = false;
      this.updateSyncMode();
      return true;
    } catch (error) {
      console.warn("[backend] init failed, fallback to local mode", error);
      this.state.connection.backend = false;
      this.updateSyncMode();
      return false;
    }
  }

  applyRemoteSnapshot(snapshot) {
    if (snapshot.todos?.length) {
      this.state.todos = this.reconcileTodos(snapshot.todos);
    }

    if (snapshot.focusSessions?.length) {
      this.applyRemoteFocusSessions(snapshot.focusSessions);
    }

    if (snapshot.latestTelemetry) {
      this.applyRemoteTelemetry(snapshot.latestTelemetry);
    }

    if (Array.isArray(snapshot.friends)) {
      this.state.remoteData.friends = snapshot.friends.map((friend) => ({
        ...friend,
        tags: Array.isArray(friend.tags) ? [...friend.tags] : []
      }));
    }

    if (Array.isArray(snapshot.friendRanking)) {
      this.state.remoteData.friendRanking = snapshot.friendRanking.map((entry) => ({
        ...entry
      }));
    }

    this.state.remoteData.lastSyncedAt = new Date().toISOString();
  }

  applyRemoteTelemetry(latestTelemetry) {
    const nextPressurePercent = normalizePressurePercent(
      latestTelemetry.pressureValue,
      latestTelemetry.pressurePercent
    );
    const nextPressureRaw = normalizePressureRaw(
      latestTelemetry.pressureValue,
      latestTelemetry.pressureRaw,
      latestTelemetry.pressurePercent
    );

    this.state.remoteData.latestTelemetry = latestTelemetry;
    this.state.remoteData.lastSyncedAt = new Date().toISOString();
    this.state.metrics = {
      ...this.state.metrics,
      physioState: latestTelemetry.physioState || this.state.metrics.physioState,
      heartRate: latestTelemetry.heartRate ?? null,
      hrv: latestTelemetry.hrv ?? this.state.metrics.hrv,
      sdnn: latestTelemetry.sdnn ?? this.state.metrics.sdnn,
      focusScore: latestTelemetry.focusScore ?? this.state.metrics.focusScore,
      stressScore: latestTelemetry.stressScore ?? this.state.metrics.stressScore,
      distanceMeters:
        latestTelemetry.distanceMeters ?? this.state.metrics.distanceMeters,
      wearableRssi: latestTelemetry.wearableRssi ?? this.state.metrics.wearableRssi,
      pressureValue: nextPressurePercent,
      pressurePercent: nextPressurePercent,
      pressureRaw: nextPressureRaw,
      pressureLevel: latestTelemetry.pressureLevel || this.state.metrics.pressureLevel,
      sourceDevice: latestTelemetry.sourceDevice || this.state.metrics.sourceDevice,
      presenceState: latestTelemetry.presenceState || this.state.metrics.presenceState,
      lastSensorAt: latestTelemetry.recordedAt || this.state.metrics.lastSensorAt
    };
  }

  syncActiveTodoFromSession(session) {
    if (!session?.taskTitle) {
      return;
    }

    if (session.todoId) {
      let found = false;

      this.state.todos = this.state.todos.map((todo) => {
        const isActive = todo.id === session.todoId;
        if (isActive) {
          found = true;
        }

        return {
          ...todo,
          title: isActive ? session.taskTitle : todo.title,
          status:
            isActive && todo.status === "pending" && isActiveFocusStatus(session.status)
              ? "doing"
              : todo.status,
          isActive
        };
      });

      if (!found) {
        this.state.todos.unshift({
          id: session.todoId,
          title: session.taskTitle,
          tag: inferTodoTagByTitle(session.taskTitle),
          status: isTerminalFocusStatus(session.status)
            ? session.status === "completed"
              ? "done"
              : "pending"
            : "doing",
          isActive: isActiveFocusStatus(session.status),
          priority: 1,
          updatedAt: session.updatedAt || new Date().toISOString()
        });
      }

      return;
    }

    const activeTodo = this.getActiveTodo();
    if (activeTodo && activeTodo.status !== "done") {
      activeTodo.title = session.taskTitle;
    }
  }

  applyRemoteFocusSessions(remoteFocusSessions, options = {}) {
    this.refreshRemoteFocusData(remoteFocusSessions, options);
  }

  isSessionNewer(nextSession, currentSession) {
    return getSessionSortTime(nextSession) > getSessionSortTime(currentSession);
  }

  reconcileTodos(remoteTodos) {
    if (!remoteTodos.length) {
      return this.state.todos;
    }

    const activeId =
      remoteTodos.find((todo) => todo.isActive)?.id ||
      remoteTodos.find((todo) => todo.status !== "done")?.id ||
      remoteTodos[0]?.id;

    const localTagById = new Map(
      this.state.todos.map((todo) => [todo.id, normalizeTodoTag(todo.tag)])
    );

    return remoteTodos.map((todo) => ({
      ...todo,
      backendSynced: Boolean(todo.backendSynced),
      tag: normalizeTodoTag(
        todo.tag || localTagById.get(todo.id) || inferTodoTagByTitle(todo.title)
      ),
      isActive: todo.id === activeId
    }));
  }

  mergeBackendTodo(remoteTodo, localTodo = {}) {
    return {
      ...localTodo,
      ...remoteTodo,
      tag: normalizeTodoTag(
        remoteTodo.tag || localTodo.tag || inferTodoTagByTitle(remoteTodo.title)
      ),
      isActive:
        remoteTodo.isActive !== undefined
          ? Boolean(remoteTodo.isActive)
          : Boolean(localTodo.isActive),
      priority: remoteTodo.priority ?? localTodo.priority ?? 1,
      backendSynced: true,
      updatedAt:
        remoteTodo.updatedAt || localTodo.updatedAt || new Date().toISOString()
    };
  }

  replaceTodoAfterBackendSync(localTodoId, remoteTodo) {
    if (!remoteTodo?.id) {
      return;
    }

    const localTodo = this.state.todos.find((item) => item.id === localTodoId) || {};
    const merged = this.mergeBackendTodo(remoteTodo, localTodo);
    const nextTodos = [];
    let replaced = false;

    for (const todo of this.state.todos) {
      if (todo.id === localTodoId) {
        nextTodos.push(merged);
        replaced = true;
        continue;
      }

      if (todo.id === remoteTodo.id && localTodoId !== remoteTodo.id) {
        continue;
      }

      nextTodos.push(todo);
    }

    if (!replaced) {
      nextTodos.unshift(merged);
    }

    this.state.todos = nextTodos;

    if (this.state.focusSession?.todoId === localTodoId) {
      this.state.focusSession.todoId = remoteTodo.id;
    }

    if (this.state.lastCompletedSession?.todoId === localTodoId) {
      this.state.lastCompletedSession.todoId = remoteTodo.id;
    }
  }

  mergeBackendFocusSession(remoteSession = {}, localSession = {}) {
    return {
      ...localSession,
      ...remoteSession,
      todoId: localSession.todoId || remoteSession.todoId || null,
      taskTitle: localSession.taskTitle || remoteSession.taskTitle || "本次专注",
      triggerSource: localSession.triggerSource || remoteSession.triggerSource,
      startPhysioState:
        localSession.startPhysioState || remoteSession.startPhysioState || "unknown",
      awayCount: localSession.awayCount ?? remoteSession.awayCount ?? 0,
      remindersSent: [...(localSession.remindersSent || [])],
      backendSynced: true,
      updatedAt:
        remoteSession.updatedAt || localSession.updatedAt || new Date().toISOString()
    };
  }

  refreshRemoteFocusData(remoteFocusSessions, { reconcileActiveSession = true } = {}) {
    const sortedSessions = [...remoteFocusSessions].sort(
      (left, right) => getSessionSortTime(right) - getSessionSortTime(left)
    );

    this.state.remoteData.latestFocusSession = sortedSessions[0]
      ? { ...sortedSessions[0] }
      : null;
    this.state.remoteData.recentFocusSessions = sortedSessions
      .slice(0, 6)
      .map((session) => ({ ...session }));
    this.state.remoteData.focusSummary = summarizeFocusSessions(sortedSessions);
    this.state.remoteData.lastSyncedAt = new Date().toISOString();

    if (!reconcileActiveSession) {
      return;
    }

    const activeRemoteSession = sortedSessions.find((session) =>
      isActiveFocusStatus(session.status)
    );
    const matchingCurrentSession = this.state.focusSession
      ? sortedSessions.find((session) => session.id === this.state.focusSession.id)
      : null;

    if (activeRemoteSession) {
      const currentReminders =
        this.state.focusSession?.id === activeRemoteSession.id
          ? [...(this.state.focusSession.remindersSent || [])]
          : [];

      this.state.focusSession = {
        ...activeRemoteSession,
        remindersSent: currentReminders
      };
      this.syncActiveTodoFromSession(this.state.focusSession);
    } else if (
      matchingCurrentSession &&
      isTerminalFocusStatus(matchingCurrentSession.status)
    ) {
      this.state.focusSession = null;
      this.state.lastCompletedSession = { ...matchingCurrentSession };
    }

    const latestTerminalSession = sortedSessions.find((session) =>
      isTerminalFocusStatus(session.status)
    );

    if (
      latestTerminalSession &&
      this.isSessionNewer(latestTerminalSession, this.state.lastCompletedSession)
    ) {
      this.state.lastCompletedSession = { ...latestTerminalSession };
    }
  }

  async refreshBackendFocusData({ reconcileActiveSession = false } = {}) {
    if (!this.state.connection.backend || !this.backend?.isConfigured?.()) {
      return;
    }

    try {
      const remoteFocusSessions = await this.backend.fetchFocusSessions(20);
      this.refreshRemoteFocusData(remoteFocusSessions, { reconcileActiveSession });
    } catch (error) {
      this.markBackendUnavailable("[backend] focus refresh failed", error);
    }
  }

  getRemainingSec() {
    if (!this.state.focusSession) {
      return 0;
    }

    const plannedEnd = new Date(this.state.focusSession.plannedEndAt).getTime();
    return Math.max(0, Math.ceil((plannedEnd - Date.now()) / 1000));
  }

  getPublicState() {
    const activeTodo = this.getActiveTodo();

    return {
      runtimeStatus: this.state.runtimeStatus,
      emotion: this.state.emotion,
      syncMode: this.state.syncMode,
      panelOpen: this.state.panelOpen,
      settings: { ...this.state.settings },
      auth: { ...this.state.auth },
      connection: { ...this.state.connection },
      squeeze: {
        ...this.state.squeeze,
        timeline: this.state.squeeze.timeline.map((bucket) => ({ ...bucket }))
      },
      metrics: { ...this.state.metrics },
      activeTodo,
      todos: this.state.todos.map((todo) => ({ ...todo })),
      focusSession: this.state.focusSession
        ? {
            ...this.state.focusSession,
            remainingSec: this.getRemainingSec()
          }
        : null,
      lastCompletedSession: this.state.lastCompletedSession
        ? { ...this.state.lastCompletedSession }
        : null,
      lastCue: this.state.lastCue ? { ...this.state.lastCue } : null,
      remoteData: {
        ...this.state.remoteData,
        latestTelemetry: this.state.remoteData.latestTelemetry
          ? { ...this.state.remoteData.latestTelemetry }
          : null,
        latestFocusSession: this.state.remoteData.latestFocusSession
          ? { ...this.state.remoteData.latestFocusSession }
          : null,
        recentFocusSessions: this.state.remoteData.recentFocusSessions.map(
          (session) => ({ ...session })
        ),
        friends: this.state.remoteData.friends.map((friend) => ({
          ...friend,
          tags: Array.isArray(friend.tags) ? [...friend.tags] : []
        })),
        friendRanking: this.state.remoteData.friendRanking.map((entry) => ({
          ...entry
        })),
        focusSummary: {
          ...this.state.remoteData.focusSummary
        }
      }
    };
  }

  emitState() {
    this.emit("state", this.getPublicState());
  }

  shouldEnableDemoMode() {
    if (this.backend?.isConfigured?.()) {
      return false;
    }

    const supabaseAuth = this.supabase.getAuthState();
    if (supabaseAuth.isLoggedIn || supabaseAuth.mode === AUTH_MODES.staticUser) {
      return false;
    }

    if (this.state.demoMode) {
      return true;
    }

    const hasRemoteHistory =
      Boolean(this.state.lastCompletedSession) ||
      Boolean(this.state.remoteData?.latestTelemetry) ||
      Boolean(this.state.remoteData?.recentFocusSessions?.length);

    return !hasRemoteHistory && hasDefaultTodoSeed(this.state.todos);
  }

  applyDemoExperience() {
    const demo = buildDemoExperience();

    this.state.demoMode = true;
    this.squeezePulseTimes = [];
    this.state.settings.cameraEnabled = false;
    this.state.connection.backend = false;
    this.state.connection.supabase = false;
    this.state.squeeze = {
      ...demo.squeeze,
      timeline: demo.squeeze.timeline.map((bucket) => ({ ...bucket }))
    };
    this.state.metrics = {
      ...this.state.metrics,
      ...demo.metrics
    };
    this.state.todos = demo.todos.map((todo) => ({ ...todo }));
    this.state.focusSession = null;
    this.state.lastCompletedSession = demo.lastCompletedSession
      ? { ...demo.lastCompletedSession }
      : null;
    this.state.lastCue = demo.lastCue ? { ...demo.lastCue } : null;
    this.state.remoteData = {
      ...demo.remoteData,
      latestTelemetry: demo.remoteData.latestTelemetry
        ? { ...demo.remoteData.latestTelemetry }
        : null,
      latestFocusSession: demo.remoteData.latestFocusSession
        ? { ...demo.remoteData.latestFocusSession }
        : null,
      recentFocusSessions: demo.remoteData.recentFocusSessions.map((session) => ({
        ...session
      })),
      friends: (demo.remoteData.friends || []).map((friend) => ({
        ...friend,
        tags: Array.isArray(friend.tags) ? [...friend.tags] : []
      })),
      friendRanking: (demo.remoteData.friendRanking || []).map((entry) => ({
        ...entry
      })),
      focusSummary: {
        ...demo.remoteData.focusSummary
      }
    };
    this.refreshAuthState();
    this.recomputeRuntimeStatus();
  }

  resetDemoExperience() {
    const defaults = buildDefaultState();

    this.state.demoMode = false;
    this.squeezePulseTimes = [];
    this.state.settings.cameraEnabled = false;
    this.state.connection.backend = false;
    this.state.connection.supabase = false;
    this.state.squeeze = {
      ...defaults.squeeze,
      timeline: defaults.squeeze.timeline.map((bucket) => ({ ...bucket }))
    };
    this.state.metrics = {
      ...defaults.metrics,
      lastSensorAt: new Date().toISOString()
    };
    this.state.todos = cloneDefaults();
    this.state.focusSession = null;
    this.state.lastCompletedSession = null;
    this.state.lastCue = {
      id: randomUUID(),
      type: "hint",
      label: "已退出演示模式",
      tone: "soft",
      at: new Date().toISOString()
    };
    this.clearRemoteData();
    this.refreshAuthState();
    this.recomputeRuntimeStatus();
  }

  clearDemoForRealAccount() {
    if (!this.state.demoMode) {
      return;
    }

    const defaults = buildDefaultState();
    this.state.demoMode = false;
    this.state.settings.cameraEnabled = false;
    this.state.connection.backend = false;
    this.state.metrics = {
      ...defaults.metrics,
      lastSensorAt: new Date().toISOString()
    };
    this.state.todos = cloneDefaults();
    this.state.focusSession = null;
    this.state.lastCompletedSession = null;
    this.state.lastCue = null;
    this.clearRemoteData();
  }

  setPanelOpen(panelOpen) {
    this.state.panelOpen = panelOpen;
    this.emitState();
  }

  async enterDemoMode() {
    if (this.backend?.isConfigured?.() && this.backend?.signInDemo) {
      await this.backend.signInDemo();
      this.clearDemoForRealAccount();
      this.refreshAuthState();
      await this.connectBackend();
      this.schedulePersist();
      this.emitState();
      return;
    }

    await this.teardownSupabaseSubscriptions();
    this.applyDemoExperience();
    this.schedulePersist();
    this.emitState();
  }

  async exitDemoMode() {
    await this.teardownSupabaseSubscriptions();
    this.resetDemoExperience();
    if (this.backend?.isConfigured?.()) {
      await this.connectBackend();
    } else if (this.supabase.isConfigured()) {
      await this.connectSupabase();
    }
    this.schedulePersist();
    this.emitState();
  }

  async signInWithPassword({ email, password }) {
    if (this.backend?.isConfigured?.() && this.backend?.signInWithPassword) {
      await this.backend.signInWithPassword({ email, password });
      this.clearDemoForRealAccount();
      this.refreshAuthState();
      await this.connectBackend();
      this.recomputeRuntimeStatus();
      this.schedulePersist();
      this.emitState();
      return;
    }

    await this.supabase.signInWithPassword({ email, password });
    this.clearDemoForRealAccount();
    this.refreshAuthState();
    if (!this.backend?.isConfigured?.()) {
      await this.connectSupabase();
    }
    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();
  }

  async signUpWithPassword({ email, password }) {
    if (this.backend?.isConfigured?.() && this.backend?.signUpWithPassword) {
      const result = await this.backend.signUpWithPassword({ email, password });
      this.clearDemoForRealAccount();
      this.refreshAuthState();
      await this.connectBackend();
      this.recomputeRuntimeStatus();
      this.schedulePersist();
      this.emitState();
      return result;
    }

    const result = await this.supabase.signUpWithPassword({ email, password });
    this.clearDemoForRealAccount();
    this.refreshAuthState();
    if (!this.backend?.isConfigured?.()) {
      await this.connectSupabase();
    }
    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();
    return result;
  }

  async signOut() {
    if (this.backend?.isConfigured?.() && this.backend?.signOut) {
      await this.backend.signOut();
      this.state.connection.backend = false;
      this.clearRemoteData();
      this.refreshAuthState();
      await this.connectBackend();
      this.recomputeRuntimeStatus();
      this.schedulePersist();
      this.emitState();
      return;
    }

    await this.teardownSupabaseSubscriptions();
    await this.supabase.signOut();
    this.state.connection.supabase = false;
    this.clearRemoteData();
    this.refreshAuthState();
    if (this.backend?.isConfigured?.()) {
      await this.connectBackend();
    }
    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();
  }

  async startFocus({ triggerSource = "desktop" } = {}) {
    if (this.state.focusSession) {
      this.pushCue("hint", "这一轮还在进行中", "soft");
      this.emitState();
      return;
    }

    const now = new Date();
    const todo = this.ensureFocusTodo();

    todo.isActive = true;
    if (todo.status === "pending") {
      todo.status = "doing";
    }
    todo.updatedAt = now.toISOString();

    this.state.focusSession = {
      id: randomUUID(),
      todoId: todo.id,
      taskTitle: todo.title,
      status: "focusing",
      durationSec: DEFAULT_FOCUS_DURATION_SEC,
      triggerSource,
      startedAt: now.toISOString(),
      plannedEndAt: new Date(
        now.getTime() + DEFAULT_FOCUS_DURATION_SEC * 1000
      ).toISOString(),
      endedAt: null,
      startPhysioState: this.state.metrics.physioState,
      awayCount: 0,
      remindersSent: ["started"],
      updatedAt: now.toISOString()
    };

    this.pushCue(
      "start",
      this.state.metrics.physioState === "strained"
        ? "先慢慢开始这一轮"
        : "进入 20 分钟专注",
      this.state.metrics.physioState === "strained" ? "soft" : "normal"
    );

    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();

    await Promise.allSettled([
      this.safeSyncTodo(todo),
      this.safeSyncFocusSession(this.state.focusSession),
      this.safeInsertAppEvent({
        type: "focus_started",
        payload: {
          triggerSource,
          todoId: todo.id,
          physioState: this.state.metrics.physioState
        }
      })
    ]);
  }

  async endFocusEarly() {
    if (!this.state.focusSession) {
      return;
    }

    const session = {
      ...this.state.focusSession,
      status: "interrupted",
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.focusSession = null;
    this.state.lastCompletedSession = session;
    this.pushCue("hint", "这一轮已结束", "soft");
    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();

    await Promise.allSettled([
      this.safeSyncFocusSession(session),
      this.safeInsertAppEvent({
        type: "focus_interrupted",
        payload: {
          todoId: session.todoId
        }
      })
    ]);
  }

  async completeFocus() {
    if (!this.state.focusSession) {
      return;
    }

    const session = {
      ...this.state.focusSession,
      status: "completed",
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.focusSession = null;
    this.state.lastCompletedSession = session;
    this.state.runtimeStatus = "Completed";
    this.state.emotion = STATUS_TO_EMOTION.Completed;
    this.pushCue("success", "这一轮完成了", "warm");
    this.schedulePersist();
    this.emitState();

    await Promise.allSettled([
      this.safeSyncFocusSession(session),
      this.safeInsertAppEvent({
        type: "focus_completed",
        payload: {
          todoId: session.todoId
        }
      })
    ]);
  }

  async restartFocus() {
    if (this.state.focusSession) {
      return;
    }

    await this.startFocus({ triggerSource: "desktop" });
  }

  async markTodoDone(todoId) {
    const todo = this.state.todos.find((item) => item.id === todoId);

    if (!todo) {
      return;
    }

    todo.status = "done";
    todo.isActive = false;
    todo.updatedAt = new Date().toISOString();

    const nextTodo = this.state.todos.find((item) => item.status !== "done");
    if (nextTodo) {
      nextTodo.isActive = true;
    }

    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();
    await this.safeSyncTodo(todo);
  }

  async setActiveTodo(todoId) {
    this.state.todos = this.state.todos.map((todo) => ({
      ...todo,
      isActive: todo.id === todoId
    }));

    const focusTodo = this.state.todos.find((todo) => todo.id === todoId);
    if (focusTodo && this.state.focusSession) {
      this.state.focusSession.todoId = focusTodo.id;
      this.state.focusSession.taskTitle = focusTodo.title;
      this.state.focusSession.updatedAt = new Date().toISOString();
      await this.safeSyncFocusSession(this.state.focusSession);
    }

    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();

    if (this.state.connection.backend) {
      return;
    }

    await Promise.allSettled(
      this.state.todos.map((todo) => this.safeSyncTodo(todo))
    );
  }

  async createTodo(input) {
    const payload =
      typeof input === "object" && input !== null
        ? input
        : {
            title: input
          };

    const cleanTitle = String(payload.title || "").trim();
    const tag = normalizeTodoTag(payload.tag || inferTodoTagByTitle(cleanTitle));

    if (!cleanTitle) {
      return;
    }

    const hasActiveTodo = this.state.todos.some((todo) => todo.isActive);
    const todo = {
      id: randomUUID(),
      title: cleanTitle,
      tag,
      status: "pending",
      isActive: !hasActiveTodo,
      priority: 1,
      scheduledAt: payload.scheduledAt || null,
      updatedAt: new Date().toISOString()
    };

    this.state.todos.unshift(todo);
    this.recomputeRuntimeStatus();
    this.schedulePersist();
    this.emitState();
    await this.safeSyncTodo(todo);
  }

  async updateTodoTitle(todoId, title) {
    const cleanTitle = String(title || "").trim();

    if (!cleanTitle) {
      return;
    }

    const todo = this.state.todos.find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    todo.title = cleanTitle;
    todo.updatedAt = new Date().toISOString();

    if (this.state.focusSession && this.state.focusSession.todoId === todoId) {
      this.state.focusSession.taskTitle = cleanTitle;
      this.state.focusSession.updatedAt = new Date().toISOString();
      await this.safeSyncFocusSession(this.state.focusSession);
    }

    this.schedulePersist();
    this.emitState();
    await this.safeSyncTodo(todo);
  }

  async updateTodoTag(todoId, tag) {
    const todo = this.state.todos.find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    todo.tag = normalizeTodoTag(tag);
    todo.updatedAt = new Date().toISOString();

    this.schedulePersist();
    this.emitState();
    await this.safeSyncTodo(todo);
  }

  async setPhysioState({
    physioState,
    heartRate,
    hrv,
    sdnn,
    focusScore,
    stressScore,
    distanceMeters,
    wearableRssi,
    pressureValue,
    pressurePercent,
    pressureRaw,
    pressureLevel,
    sourceDevice,
    skipTelemetrySync = false
  }) {
    const nextPhysioState = physioState || this.state.metrics.physioState;
    const nextHrv = hrv ?? this.state.metrics.hrv;
    const nextStressScore = stressScore ?? this.state.metrics.stressScore;
    const nextPressurePercent = normalizePressurePercent(
      pressureValue,
      pressurePercent
    );
    const nextPressureRaw = normalizePressureRaw(
      pressureValue,
      pressureRaw,
      pressurePercent
    );

    this.state.metrics = {
      ...this.state.metrics,
      physioState: nextPhysioState,
      heartRate:
        Number.isFinite(heartRate) && heartRate > 0 ? Math.round(heartRate) : null,
      hrv: nextHrv,
      sdnn: sdnn !== undefined ? sdnn : this.state.metrics.sdnn,
      focusScore:
        focusScore !== undefined ? focusScore : this.state.metrics.focusScore,
      stressScore: nextStressScore,
      distanceMeters:
        distanceMeters !== undefined
          ? distanceMeters
          : this.state.metrics.distanceMeters,
      wearableRssi:
        wearableRssi !== undefined ? wearableRssi : this.state.metrics.wearableRssi,
      pressureValue: nextPressurePercent,
      pressurePercent: nextPressurePercent,
      pressureRaw: nextPressureRaw,
      pressureLevel: pressureLevel || this.state.metrics.pressureLevel,
      sourceDevice: sourceDevice || this.state.metrics.sourceDevice,
      lastSensorAt: new Date().toISOString()
    };

    if (!this.state.focusSession) {
      this.recomputeRuntimeStatus();
    }

    this.pushCue(
      "sensor",
      physioState === "strained" ? "现在稍微紧绷一点" : "状态已更新",
      physioState === "strained" ? "soft" : "normal"
    );

    this.schedulePersist();
    this.emitState();

    const tasks = [
      this.safeInsertAppEvent({
        type: "physio_changed",
        payload: {
          physioState: nextPhysioState,
          heartRate: this.state.metrics.heartRate,
          hrv: nextHrv,
          sdnn: this.state.metrics.sdnn,
          focusScore: this.state.metrics.focusScore,
          stressScore: nextStressScore,
          distanceMeters,
          wearableRssi,
          pressureValue: nextPressurePercent,
          pressurePercent: nextPressurePercent,
          pressureRaw: nextPressureRaw,
          pressureLevel,
          sourceDevice
        }
      })
    ];

    if (!skipTelemetrySync) {
      tasks.unshift(this.safeInsertWearableSnapshot());
    }

    await Promise.allSettled(tasks);
  }

  async setPresenceState(presenceState) {
    this.state.metrics.presenceState = presenceState;
    this.state.metrics.lastSensorAt = new Date().toISOString();

    clearTimeout(this.awayTimer);

    if (this.state.focusSession) {
      if (presenceState === "far") {
        this.awayTimer = setTimeout(async () => {
          if (!this.state.focusSession || this.state.metrics.presenceState !== "far") {
            return;
          }

          if (this.state.focusSession.status !== "away") {
            this.state.focusSession.status = "away";
            this.state.focusSession.awayCount += 1;
            this.state.focusSession.updatedAt = new Date().toISOString();
            this.state.runtimeStatus = "Away";
            this.state.emotion = STATUS_TO_EMOTION.Away;
            this.pushCue("hint", "先等你回到桌前", "soft");
            this.schedulePersist();
            this.emitState();
            await this.safeSyncFocusSession(this.state.focusSession);
          }
        }, 5000);
      } else if (this.state.focusSession.status === "away") {
        this.state.focusSession.status = "focusing";
        this.state.focusSession.updatedAt = new Date().toISOString();
        this.recomputeRuntimeStatus();
        this.pushCue("hint", "欢迎回来，继续这一轮", "warm");
      }
    } else {
      this.recomputeRuntimeStatus();
    }

    this.schedulePersist();
    this.emitState();

    await Promise.allSettled([
      this.safeInsertPresenceEvent(),
      this.safeInsertAppEvent({
        type: "presence_changed",
        payload: {
          presenceState
        }
      })
    ]);
  }

  async toggleSound() {
    this.state.settings.soundEnabled = !this.state.settings.soundEnabled;
    this.schedulePersist();
    this.emitState();
  }

  async setCameraEnabled(cameraEnabled) {
    this.state.settings.cameraEnabled = Boolean(cameraEnabled);
    this.schedulePersist();
    this.emitState();
  }

  async setWearableConnection(isConnected) {
    this.state.connection.wearable = isConnected;
    if (!isConnected) {
      this.pushCue("hint", "手环桥接暂时离线", "soft");
    }
    this.recomputeRuntimeStatus();
    this.emitState();
  }

  registerSqueezePulse(timestamp) {
    const timeMs = Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp).getTime()
      : Date.now();

    this.squeezePulseTimes = this.squeezePulseTimes
      .filter((entry) => Number.isFinite(entry))
      .filter((entry) => timeMs - entry <= SQUEEZE_STATS_WINDOW_MS);
    this.squeezePulseTimes.push(timeMs);
    this.state.squeeze = summarizeSqueezePulseTimes(this.squeezePulseTimes, timeMs);
  }

  async ingestSidecarEvent(event) {
    if (!event || typeof event !== "object") {
      return;
    }

    if (event.type === "telemetry") {
      await this.setPhysioState({
        physioState: event.physioState || "unknown",
        heartRate: event.heartRate,
        hrv: event.hrv ?? 0,
        sdnn: event.sdnn,
        focusScore: event.focusScore,
        stressScore: event.stressScore ?? 0,
        distanceMeters: event.distanceMeters,
        wearableRssi: event.wearableRssi,
        pressureValue: event.pressureValue,
        pressurePercent: event.pressurePercent,
        pressureRaw: event.pressureRaw,
        pressureLevel: event.pressureLevel,
        sourceDevice: event.sourceDevice || event.deviceId,
        skipTelemetrySync: Boolean(event.syncedBySidecar)
      });

      if (event.presenceState) {
        await this.setPresenceState(event.presenceState);
      }
      return;
    }

    if (event.type === "band_alert") {
      this.pushCue("hint", event.message || "手环提醒已触发", "soft");
      this.emitState();
      return;
    }

    if (event.type === "squeeze_pulse") {
      const nextPressurePercent = normalizePressurePercent(
        event.pressureValue,
        event.pressurePercent
      );
      const nextPressureRaw = normalizePressureRaw(
        event.pressureValue,
        event.pressureRaw,
        event.pressurePercent
      );
      this.state.metrics = {
        ...this.state.metrics,
        pressureValue: nextPressurePercent,
        pressurePercent: nextPressurePercent,
        pressureRaw: nextPressureRaw,
        pressureLevel: event.pressureLevel || this.state.metrics.pressureLevel,
        sourceDevice: event.sourceDevice || event.deviceId || this.state.metrics.sourceDevice,
        lastSensorAt: event.timestamp || new Date().toISOString()
      };
      this.registerSqueezePulse(event.timestamp);
      this.schedulePersist();
      this.emitState();
      return;
    }

    if (event.type === "enter_task") {
      await this.startFocus({
        triggerSource: "wearable"
      });
    }
  }

  async acknowledgeCompleted() {
    this.state.lastCompletedSession = this.state.lastCompletedSession
      ? this.state.lastCompletedSession
      : null;
    this.recomputeRuntimeStatus();
    this.emitState();
  }

  ensureFocusTodo() {
    const activeTodo =
      this.state.todos.find((todo) => todo.isActive && todo.status !== "done") ||
      this.state.todos.find((todo) => todo.status !== "done");

    if (activeTodo) {
      this.state.todos = this.state.todos.map((todo) => ({
        ...todo,
        isActive: todo.id === activeTodo.id
      }));
      return this.state.todos.find((todo) => todo.id === activeTodo.id);
    }

    const placeholder = {
      id: randomUUID(),
      title: "本次专注",
      tag: TODO_TAGS.general,
      status: "pending",
      isActive: true,
      priority: 1,
      updatedAt: new Date().toISOString()
    };

    this.state.todos.unshift(placeholder);
    return placeholder;
  }

  getActiveTodo() {
    return (
      this.state.todos.find((todo) => todo.isActive) ||
      this.state.todos.find((todo) => todo.status !== "done") ||
      null
    );
  }

  maybeFireReminder(remainingSec) {
    if (!this.state.focusSession || this.state.focusSession.status !== "focusing") {
      return;
    }

    const checkpoints = [
      { key: "mid", threshold: 10 * 60, label: "还剩 10 分钟" },
      { key: "final", threshold: 60, label: "还剩 1 分钟" }
    ];

    for (const checkpoint of checkpoints) {
      if (
        !this.state.focusSession.remindersSent.includes(checkpoint.key) &&
        remainingSec <= checkpoint.threshold
      ) {
        this.state.focusSession.remindersSent.push(checkpoint.key);
        this.pushCue(
          "reminder",
          checkpoint.label,
          this.state.metrics.physioState === "strained" ? "soft" : "normal"
        );
        break;
      }
    }
  }

  recomputeRuntimeStatus() {
    if (!this.state.connection.wearable && !this.state.connection.proximity) {
      this.state.runtimeStatus = "Disconnected";
      this.state.emotion = STATUS_TO_EMOTION.Disconnected;
      return;
    }

    if (this.state.focusSession) {
      if (this.state.focusSession.status === "away") {
        this.state.runtimeStatus = "Away";
        this.state.emotion = STATUS_TO_EMOTION.Away;
        return;
      }

      this.state.runtimeStatus = "Focusing";
      this.state.emotion = STATUS_TO_EMOTION.Focusing;
      return;
    }

    const isNear = this.state.metrics.presenceState === "near";
    const hasPendingTodo = this.state.todos.some((todo) => todo.status !== "done");
    const physioState = this.state.metrics.physioState;

    if (!isNear) {
      this.state.runtimeStatus = "Idle";
      this.state.emotion = STATUS_TO_EMOTION.Idle;
      return;
    }

    if (physioState === "ready" && hasPendingTodo) {
      this.state.runtimeStatus = "Ready";
      this.state.emotion = STATUS_TO_EMOTION.Ready;
      return;
    }

    if (physioState === "strained" || physioState === "unknown") {
      this.state.runtimeStatus = "Support";
      this.state.emotion = STATUS_TO_EMOTION.Support;
      return;
    }

    this.state.runtimeStatus = "Idle";
    this.state.emotion = STATUS_TO_EMOTION.Idle;
  }

  pushCue(type, label, tone) {
    this.state.lastCue = {
      id: randomUUID(),
      type,
      label,
      tone,
      at: new Date().toISOString()
    };
  }

  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistState().catch((error) => {
        console.warn("[storage] persist failed", error);
      });
    }, 200);
  }

  async persistState() {
    await this.storage.save({
      ...this.state,
      squeeze: buildDefaultSqueezeState(),
      connection: {
        ...this.state.connection
      }
    });
  }

  markSupabaseUnavailable(logLabel, error) {
    console.warn(logLabel, error);
    this.state.connection.supabase = false;
    this.updateSyncMode();
    this.emitState();
  }

  markBackendUnavailable(logLabel, error) {
    console.warn(logLabel, error);
    this.state.connection.backend = false;
    this.updateSyncMode();
    this.emitState();
  }

  async safeSyncTodo(todo) {
    if (this.state.connection.backend) {
      try {
        const remoteTodo = todo.backendSynced
          ? await this.backend.updateTodo(todo.id, todo)
          : await this.backend.createTodo(todo);

        if (remoteTodo?.id) {
          this.replaceTodoAfterBackendSync(todo.id, remoteTodo);
          this.state.remoteData.lastSyncedAt = new Date().toISOString();
          this.schedulePersist();
          this.emitState();
        }
      } catch (error) {
        this.markBackendUnavailable("[backend] todo sync failed", error);
      }
      return;
    }

    if (!this.state.connection.supabase) {
      return;
    }

    try {
      await this.supabase.upsertTodo(todo);
    } catch (error) {
      this.markSupabaseUnavailable("[supabase] todo sync failed", error);
    }
  }

  async safeSyncFocusSession(session) {
    if (this.state.connection.backend) {
      try {
        let syncedSession = null;

        if (isActiveFocusStatus(session.status)) {
          if (session.backendSynced) {
            return;
          }

          syncedSession = this.mergeBackendFocusSession(
            await this.backend.startFocusSession({
              durationMinutes: Math.max(
                1,
                Math.round((session.durationSec || DEFAULT_FOCUS_DURATION_SEC) / 60)
              ),
              triggerSource: session.triggerSource
            }),
            session
          );

          if (this.state.focusSession?.id === session.id) {
            this.state.focusSession = syncedSession;
          }
        } else {
          let sessionToFinish = session;

          if (!session.backendSynced) {
            const startedSession = await this.backend.startFocusSession({
              durationMinutes: Math.max(
                1,
                Math.round((session.durationSec || DEFAULT_FOCUS_DURATION_SEC) / 60)
              ),
              triggerSource: session.triggerSource
            });
            sessionToFinish = this.mergeBackendFocusSession(startedSession, session);
          }

          syncedSession = this.mergeBackendFocusSession(
            await this.backend.finishFocusSession({
              sessionId: sessionToFinish.id,
              status: session.status
            }),
            sessionToFinish
          );

          if (this.state.lastCompletedSession?.id === session.id) {
            this.state.lastCompletedSession = syncedSession;
          }
        }

        if (syncedSession?.id) {
          this.state.remoteData.lastSyncedAt = new Date().toISOString();
          await this.refreshBackendFocusData();
          this.schedulePersist();
          this.emitState();
        }
      } catch (error) {
        this.markBackendUnavailable("[backend] focus session sync failed", error);
      }
      return;
    }

    if (!this.state.connection.supabase) {
      return;
    }

    try {
      await this.supabase.upsertFocusSession(session);
    } catch (error) {
      this.markSupabaseUnavailable("[supabase] focus session sync failed", error);
    }
  }

  async safeInsertWearableSnapshot() {
    if (!this.state.connection.supabase) {
      return;
    }

    try {
      await this.supabase.insertWearableSnapshot({
        hrv: this.state.metrics.hrv,
        sdnn: this.state.metrics.sdnn,
        focusScore: this.state.metrics.focusScore,
        stressScore: this.state.metrics.stressScore,
        distanceMeters: this.state.metrics.distanceMeters,
        wearableRssi: this.state.metrics.wearableRssi,
        pressureValue: this.state.metrics.pressureValue,
        pressurePercent: this.state.metrics.pressurePercent,
        pressureRaw: this.state.metrics.pressureRaw,
        pressureLevel: this.state.metrics.pressureLevel,
        sourceDevice: this.state.metrics.sourceDevice,
        physioState: this.state.metrics.physioState,
        isAtDesk: this.state.metrics.presenceState === "near",
        recordedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("[supabase] wearable snapshot insert failed", error);
    }
  }

  async safeInsertPresenceEvent() {
    if (!this.state.connection.supabase) {
      return;
    }

    try {
      await this.supabase.insertPresenceEvent({
        presenceState: this.state.metrics.presenceState,
        recordedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("[supabase] presence insert failed", error);
    }
  }

  async safeInsertAppEvent(event) {
    if (!this.state.connection.supabase) {
      return;
    }

    try {
      await this.supabase.insertAppEvent({
        ...event,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("[supabase] app event insert failed", error);
    }
  }
}

module.exports = {
  RoviaStateManager
};
