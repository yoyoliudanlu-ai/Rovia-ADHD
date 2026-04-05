const { AUTH_MODES, DEFAULT_FOCUS_DURATION_SEC } = require("../shared/rovia-schema");

const DEMO_USER = Object.freeze({
  email: "demo@rovia.app",
  userId: "demo-rovia-user"
});

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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

function buildDemoFocusSessions() {
  return [
    {
      id: "demo-session-1",
      todoId: "demo-todo-4",
      taskTitle: "整理论文答辩提纲",
      status: "completed",
      durationSec: 20 * 60,
      triggerSource: "wearable",
      startedAt: isoMinutesAgo(66),
      plannedEndAt: isoMinutesAgo(46),
      endedAt: isoMinutesAgo(46),
      startPhysioState: "ready",
      awayCount: 0,
      remindersSent: [],
      updatedAt: isoMinutesAgo(45)
    },
    {
      id: "demo-session-2",
      todoId: "demo-todo-5",
      taskTitle: "补访谈纪要和情绪标签",
      status: "completed",
      durationSec: 18 * 60,
      triggerSource: "desktop",
      startedAt: isoMinutesAgo(182),
      plannedEndAt: isoMinutesAgo(162),
      endedAt: isoMinutesAgo(164),
      startPhysioState: "ready",
      awayCount: 0,
      remindersSent: [],
      updatedAt: isoMinutesAgo(163)
    },
    {
      id: "demo-session-3",
      todoId: "demo-todo-2",
      taskTitle: "同步手环阈值说明",
      status: "interrupted",
      durationSec: 12 * 60,
      triggerSource: "desktop",
      startedAt: isoMinutesAgo(420),
      plannedEndAt: isoMinutesAgo(400),
      endedAt: isoMinutesAgo(408),
      startPhysioState: "strained",
      awayCount: 1,
      remindersSent: [],
      updatedAt: isoMinutesAgo(407)
    },
    {
      id: "demo-session-4",
      todoId: "demo-todo-3",
      taskTitle: "复盘高压力片段",
      status: "completed",
      durationSec: 20 * 60,
      triggerSource: "wearable",
      startedAt: isoMinutesAgo(1480),
      plannedEndAt: isoMinutesAgo(1460),
      endedAt: isoMinutesAgo(1460),
      startPhysioState: "ready",
      awayCount: 0,
      remindersSent: [],
      updatedAt: isoMinutesAgo(1458)
    }
  ];
}

function buildDemoTodos() {
  return [
    {
      id: "demo-todo-1",
      title: "路演稿撰写",
      tag: "work",
      status: "doing",
      isActive: true,
      priority: 2,
      scheduledAt: new Date("2026-04-06T10:00:00+08:00").toISOString(),
      updatedAt: isoMinutesAgo(8)
    },
    {
      id: "demo-todo-2",
      title: "用户访谈洞察整理",
      tag: "work",
      status: "pending",
      isActive: false,
      priority: 1,
      scheduledAt: new Date("2026-04-06T13:30:00+08:00").toISOString(),
      updatedAt: isoMinutesAgo(26)
    },
    {
      id: "demo-todo-3",
      title: "毕业论文开题报告修改",
      tag: "study",
      status: "pending",
      isActive: false,
      priority: 1,
      scheduledAt: new Date("2026-04-06T16:00:00+08:00").toISOString(),
      updatedAt: isoMinutesAgo(52)
    },
    {
      id: "demo-todo-4",
      title: "论文答辩提纲整理",
      tag: "study",
      status: "done",
      isActive: false,
      priority: 2,
      scheduledAt: new Date("2026-04-05T20:00:00+08:00").toISOString(),
      updatedAt: isoMinutesAgo(45)
    },
    {
      id: "demo-todo-5",
      title: "市场调研结论补充",
      tag: "work",
      status: "done",
      isActive: false,
      priority: 1,
      scheduledAt: new Date("2026-04-05T15:30:00+08:00").toISOString(),
      updatedAt: isoMinutesAgo(163)
    }
  ];
}

function buildDemoTelemetry() {
  return {
    heartRate: null,
    hrv: 58,
    stressScore: 21,
    distanceMeters: 0.7,
    wearableRssi: -53,
    pressureValue: 16,
    pressureLevel: "light",
    sourceDevice: "demo-band",
    physioState: "ready",
    presenceState: "near",
    isAtDesk: true,
    recordedAt: isoMinutesAgo(3)
  };
}

function buildDemoSqueezeState() {
  return {
    pulseCount1m: 4,
    pulseCount5m: 13,
    ratePerMinute: 4,
    averageIntervalSec: 18.5,
    lastPulseAt: isoMinutesAgo(1),
    timeline: [
      { index: 0, count: 0 },
      { index: 1, count: 1 },
      { index: 2, count: 1 },
      { index: 3, count: 0 },
      { index: 4, count: 2 },
      { index: 5, count: 1 },
      { index: 6, count: 2 },
      { index: 7, count: 1 },
      { index: 8, count: 1 },
      { index: 9, count: 4 }
    ]
  };
}

function buildDemoAccountState({ configured = false } = {}) {
  return {
    configured,
    mode: AUTH_MODES.demo,
    isLoggedIn: true,
    hasIdentity: true,
    needsLogin: false,
    email: DEMO_USER.email,
    userId: DEMO_USER.userId
  };
}

function buildDemoExperience() {
  const recentFocusSessions = buildDemoFocusSessions();
  const latestTelemetry = buildDemoTelemetry();
  const latestFocusSession = recentFocusSessions[0] || null;

  return {
    todos: buildDemoTodos(),
    squeeze: buildDemoSqueezeState(),
    metrics: {
      physioState: latestTelemetry.physioState,
      heartRate: latestTelemetry.heartRate,
      hrv: latestTelemetry.hrv,
      stressScore: latestTelemetry.stressScore,
      distanceMeters: latestTelemetry.distanceMeters,
      wearableRssi: latestTelemetry.wearableRssi,
      pressureValue: latestTelemetry.pressureValue,
      pressureLevel: latestTelemetry.pressureLevel,
      sourceDevice: latestTelemetry.sourceDevice,
      presenceState: latestTelemetry.presenceState,
      lastSensorAt: latestTelemetry.recordedAt
    },
    remoteData: {
      lastSyncedAt: isoMinutesAgo(2),
      latestTelemetry,
      latestFocusSession,
      recentFocusSessions,
      focusSummary: summarizeFocusSessions(recentFocusSessions)
    },
    lastCompletedSession: latestFocusSession,
    lastCue: {
      id: "demo-cue",
      type: "hint",
      label: "今天已经稳定完成 3 轮专注",
      tone: "warm",
      at: isoMinutesAgo(4)
    }
  };
}

module.exports = {
  DEMO_USER,
  buildDemoAccountState,
  buildDemoExperience
};
