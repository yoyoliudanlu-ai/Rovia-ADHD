import { ensureFriendMap } from "./friend-map.js?v=20260405-01";
import {
  buildDeviceMetricEntries,
  buildPrimarySignal
} from "../shared/body-signals.mjs";
import {
  buildDeviceConfigurePayload,
  buildDeviceConnectionSummary,
  normalizeScanResults,
  resolveSelectedDeviceName
} from "../shared/device-scan.mjs";
import {
  buildAuthViewModel,
  normalizeAuthMode,
  shouldShowAuthConfirm,
  validateAuthDraft
} from "../shared/auth-form.mjs";
import { mapDeviceErrorMessage } from "../shared/device-errors.mjs";
import { mapAuthErrorMessage } from "../shared/auth-errors.mjs";

const panelFrame = document.querySelector(".panel-frame");
const panelDate = document.getElementById("panel-date");
const panelGreeting = document.getElementById("panel-greeting");
const localeToggle = document.getElementById("locale-toggle");
const profileButton = document.getElementById("profile-button");
const runtimeStatus = document.getElementById("runtime-status");
const cueText = document.getElementById("cue-text");
const currentTaskTitle = document.getElementById("current-task-title");
const focusTime = document.getElementById("focus-time");
const focusTrigger = document.getElementById("focus-trigger");
const focusSummary = document.getElementById("focus-summary");
const physioState = document.getElementById("physio-state");
const physioMetrics = document.getElementById("physio-metrics");
const presenceState = document.getElementById("presence-state");
const sensorTime = document.getElementById("sensor-time");
const deviceSyncMode = document.getElementById("device-sync-mode");
const deviceScanRefresh = document.getElementById("device-scan-refresh");
const deviceConnectSubmit = document.getElementById("device-connect-submit");
const deviceDisconnectAll = document.getElementById("device-disconnect-all");
const deviceScanCopy = document.getElementById("device-scan-copy");
const deviceScanFeedback = document.getElementById("device-scan-feedback");
const deviceScanList = document.getElementById("device-scan-list");
const wristbandConnectionState = document.getElementById("wristband-connection-state");
const wristbandSelectedName = document.getElementById("wristband-selected-name");
const wristbandRssi = document.getElementById("wristband-rssi");
const wristbandPresence = document.getElementById("wristband-presence");
const wristbandHrv = document.getElementById("wristband-hrv");
const wristbandConnectionCopy = document.getElementById("wristband-connection-copy");
const squeezeConnectionState = document.getElementById("squeeze-connection-state");
const squeezeSelectedName = document.getElementById("squeeze-selected-name");
const squeezeOnlineState = document.getElementById("squeeze-online-state");
const squeezePressureRaw = document.getElementById("squeeze-pressure-raw");
const squeezeConnectionCopy = document.getElementById("squeeze-connection-copy");
const wristbandFocusTriggerToggle = document.getElementById("wristband-focus-trigger-toggle");
const cameraStatus = document.getElementById("camera-status");
const cameraCopy = document.getElementById("camera-copy");
const cameraStart = document.getElementById("camera-start");
const cameraStop = document.getElementById("camera-stop");
const syncMode = document.getElementById("sync-mode");
const focusSyncMode = document.getElementById("focus-sync-mode");
const latestSessionTitle = document.getElementById("latest-session-title");
const latestSessionMeta = document.getElementById("latest-session-meta");
const focusTotalMinutes = document.getElementById("focus-total-minutes");
const focusTotalMeta = document.getElementById("focus-total-meta");
const focusCompletedCount = document.getElementById("focus-completed-count");
const focusInterruptedCount = document.getElementById("focus-interrupted-count");
const focusWeekChart = document.getElementById("focus-week-chart");
const todoProgressTitle = document.getElementById("todo-progress-title");
const todoProgressMeta = document.getElementById("todo-progress-meta");
const focusDataHint = document.getElementById("focus-data-hint");
const recentSessionsList = document.getElementById("recent-sessions-list");
const authTitle = document.getElementById("auth-title");
const authMeta = document.getElementById("auth-meta");
const authForm = document.getElementById("auth-form");
const authModeLogin = document.getElementById("auth-mode-login");
const authModeRegister = document.getElementById("auth-mode-register");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authConfirmField = document.getElementById("auth-confirm-field");
const authConfirmPassword = document.getElementById("auth-confirm-password");
const authSubmit = document.getElementById("auth-submit");
const authDemo = document.getElementById("auth-demo");
const authUserActions = document.getElementById("auth-user-actions");
const authEmailPill = document.getElementById("auth-email-pill");
const signOutButton = document.getElementById("sign-out-button");
const soundToggle = document.getElementById("sound-toggle");
const startDesktop = document.getElementById("start-desktop");
const startWearable = document.getElementById("start-wearable");
const endFocus = document.getElementById("end-focus");
const todoPageCurrentTitle = document.getElementById("todo-page-current-title");
const todoPageCurrentMeta = document.getElementById("todo-page-current-meta");
const todoCurrentEcho = document.getElementById("todo-current-echo");
const todoOpenCount = document.getElementById("todo-open-count");
const todoDoneCount = document.getElementById("todo-done-count");
const todoSummaryNote = document.getElementById("todo-summary-note");
const todoSyncModeCopy = document.getElementById("todo-sync-mode-copy");
const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoDate = document.getElementById("todo-date");
const todoTime = document.getElementById("todo-time");
const todoTag = document.getElementById("todo-tag");
const todoList = document.getElementById("todo-list");
const squeezeHeroCard = document.getElementById("squeeze-hero-card");
const squeezeVisualStage = document.getElementById("squeeze-visual-stage");
const squeezeRegulationPill = document.getElementById("squeeze-regulation-pill");
const squeezeLiveLevel = document.getElementById("squeeze-live-level");
const squeezeLivePressure = document.getElementById("squeeze-live-pressure");
const squeezeLivePressureMeta = document.getElementById("squeeze-live-pressure-meta");
const squeezeLivePercent = document.getElementById("squeeze-live-percent");
const squeezeLivePercentMeta = document.getElementById("squeeze-live-percent-meta");
const squeezeLiveRate = document.getElementById("squeeze-live-rate");
const squeezeGuidance = document.getElementById("squeeze-guidance");
const squeezeCountMinute = document.getElementById("squeeze-count-minute");
const squeezeCountMinuteMeta = document.getElementById("squeeze-count-minute-meta");
const squeezeCountFive = document.getElementById("squeeze-count-five");
const squeezeCountFiveMeta = document.getElementById("squeeze-count-five-meta");
const squeezeLastSeen = document.getElementById("squeeze-last-seen");
const squeezeLastSeenMeta = document.getElementById("squeeze-last-seen-meta");
const squeezeTimelineChart = document.getElementById("squeeze-timeline-chart");
const squeezePatternCopy = document.getElementById("squeeze-pattern-copy");
const squeezeRangeFill = document.getElementById("squeeze-range-fill");
const friendHeadline = document.getElementById("friend-headline");
const friendSummary = document.getElementById("friend-summary");
const friendCount = document.getElementById("friend-count");
const friendCosmos = document.getElementById("friend-cosmos");
const friendCosmosEmpty = document.getElementById("friend-cosmos-empty");
const friendMapMeta = document.getElementById("friend-map-meta");
const friendList = document.getElementById("friend-list");
const friendActiveTags = document.getElementById("friend-active-tags");
const friendRankingSelf = document.getElementById("friend-ranking-self");
const friendRankingPodium = document.getElementById("friend-ranking-podium");
const friendRankingList = document.getElementById("friend-ranking-list");
const profileRuntime = document.getElementById("profile-runtime");
const profileMainTag = document.getElementById("profile-main-tag");
const profileBio = document.getElementById("profile-bio");
const quitButton = document.getElementById("quit-button");
const accountQuitButton = document.getElementById("account-quit-app");

const AVAILABLE_TABS = new Set(["focus", "todo", "squeeze", "device", "friend", "account"]);
let activeTab = "focus";
let currentState = null;
let authMode = "login";
let authBusy = false;
let authBusyAction = null;
let authFeedback = "";
let friendFeedback = "";
let friendMapController = null;
let expandedTodoId = null;
let cameraBusy = false;
let cameraState = "idle";
let deviceModuleBusy = false;
let deviceStatusPollTimer = null;
const LOCALE_STORAGE_KEY = "rovia-panel-locale";
const DEVICE_SELECTION_STORAGE_KEY = "rovia-device-selection";
const FRIEND_REQUEST_STORAGE_KEY = "rovia-friend-requests";
const SQUEEZE_SENSOR_MAX = 4095;
const DEVICE_STATUS_POLL_MS = 1200;
let deviceModuleState = {
  scanResults: [],
  selected: loadDeviceSelections(),
  status: null,
  scanFeedback: "",
  scanLoaded: false
};
let currentLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY) || "zh";
let requestedFriendIds = loadFriendRequestIds();

function loadDeviceSelections() {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(DEVICE_SELECTION_STORAGE_KEY) || "{}"
    );
    return buildDeviceConfigurePayload(raw);
  } catch (_error) {
    return {
      wristband: "",
      squeeze: ""
    };
  }
}

function persistDeviceSelections() {
  window.localStorage.setItem(
    DEVICE_SELECTION_STORAGE_KEY,
    JSON.stringify(buildDeviceConfigurePayload(deviceModuleState.selected))
  );
}

function setAuthMode(mode, { clearFeedback = false } = {}) {
  authMode = normalizeAuthMode(mode);
  if (clearFeedback) {
    authFeedback = "";
  }
  if (authConfirmPassword && authMode !== "register") {
    authConfirmPassword.value = "";
  }
  if (currentState) {
    render(currentState);
  }
}

function getAuthValidationFeedback(reason) {
  const messages = {
    missing_credentials: t("auth.needCredentials"),
    password_too_short: t("auth.passwordTooShort"),
    password_mismatch: t("auth.passwordMismatch")
  };

  return messages[reason] || t("auth.signInFailed");
}

const I18N = {
  zh: {
    "app.profile": "账号和个人",
    "app.closePanel": "关闭面板",
    "app.localeToggle": "切换中英文",
    "tabs.focus": "专注",
    "tabs.todo": "任务",
    "tabs.squeeze": "捏捏",
    "tabs.device": "设备",
    "tabs.friend": "好友",
    "common.task": "任务",
    "common.state": "状态",
    "common.trigger": "触发方式",
    "focus.currentSession": "当前会话",
    "focus.currentFocus": "当前专注",
    "focus.dashboard": "我的专注数据",
    "focus.startDesktop": "开始",
    "focus.startWearable": "手环",
    "focus.endSession": "结束",
    "focus.lastRound": "最近一轮",
    "focus.dailyRounds": "今日轮次",
    "focus.dailyMinutes": "今日时长",
    "focus.bodySignals": "身体信号",
    "focus.trend": "7 日趋势",
    "focus.recentSessions": "最近记录",
    "todo.activeTask": "当前任务",
    "todo.overview": "任务概览",
    "todo.currentLabel": "当前",
    "todo.mainTagLabel": "主要标签",
    "todo.openLabel": "待完成",
    "todo.doneLabel": "已完成",
    "todo.newTodo": "新增任务",
    "todo.newTodoPlaceholder": "新增一个任务",
    "todo.addAction": "新增",
    "todo.stream": "任务面板",
    "squeeze.live": "捏捏实时状态",
    "squeeze.currentLevel": "当前力度",
    "squeeze.pressure": "压力值",
    "squeeze.mappedPressure": "映射压力",
    "squeeze.frequency": "频率数据",
    "squeeze.lastMinute": "最近 1 分钟",
    "squeeze.lastFiveMinutes": "最近 5 分钟",
    "squeeze.lastDetected": "最近一次",
    "squeeze.timeline": "10 分钟脉冲分布",
    "tags.study": "学习",
    "tags.work": "工作",
    "tags.home": "家务",
    "tags.health": "健康",
    "tags.social": "社交",
    "tags.general": "其他",
    "friend.discovery": "好友发现",
    "friend.map": "Rovia 交友地图",
    "friend.suggested": "推荐好友",
    "friend.ranking": "专注排行榜",
    "device.status": "设备状态",
    "device.physio": "生理",
    "device.presence": "距离",
    "device.sync": "同步",
    "device.controls": "设备控制",
    "device.physioPreset": "生理预设",
    "device.presencePreset": "距离预设",
    "account.account": "账号",
    "account.emailPlaceholder": "邮箱",
    "account.passwordPlaceholder": "密码",
    "account.passwordHintPlaceholder": "密码（至少 6 位）",
    "account.confirmPasswordPlaceholder": "确认密码",
    "account.signIn": "登录",
    "account.signUp": "注册",
    "account.demo": "演示",
    "account.signOut": "退出登录",
    "account.profile": "个人",
    "account.currentMood": "当前状态",
    "account.currentTag": "主要标签",
    "account.app": "应用",
    "account.quitApp": "退出 Rovia",
    "states.ready": "准备好",
    "states.strained": "紧绷",
    "states.unknown": "未知",
    "states.near": "靠近",
    "states.far": "远离",
    "states.atDesk": "在桌前",
    "states.awayDesk": "离开桌面",
    "runtime.Disconnected": "离线",
    "runtime.Idle": "待机",
    "runtime.Ready": "可开始",
    "runtime.Support": "需要支持",
    "runtime.Focusing": "正在专注",
    "runtime.Away": "暂时离开",
    "runtime.Completed": "已完成",
    "emotion.Offline": "离线",
    "emotion.Calm": "平静",
    "emotion.Invite": "邀请",
    "emotion.Care": "照护",
    "emotion.Focus": "专注",
    "emotion.Wait": "等待",
    "emotion.Celebrate": "庆祝",
    "sync.demo": "演示",
    "sync.local": "本地",
    "sync.backend": "后端",
    "sync.supabase": "云端",
    "sync.auth-required": "登录",
    "trigger.desktop": "桌面",
    "trigger.wearable": "手环",
    "focusStatus.focusing": "进行中",
    "focusStatus.away": "离开中",
    "focusStatus.completed": "已完成",
    "focusStatus.interrupted": "中断",
    "focusStatus.canceled": "取消",
    "todoStatus.pending": "待开始",
    "todoStatus.doing": "进行中",
    "todoStatus.done": "已完成",
    "todoAction.current": "当前",
    "todoAction.activate": "设为当前",
    "todoAction.rename": "改名",
    "todoAction.done": "完成",
    "todoAction.tag": "改标签",
    "todoAction.manage": "管理任务",
    "todoAction.manageClose": "收起操作",
    "friend.tagsMock": "标签：模拟",
    "friend.tagsPrefix": "标签：",
    "friend.mockMatches": "{count} 个模拟匹配",
    "friend.matches": "{count} 个匹配",
    "friend.headlineMatches": "找到与你任务类型接近的人",
    "friend.headlineNeedTags": "先建立一些任务标签，再来连接朋友",
    "friend.summaryMock": "当前先用 mock 匹配结果展示交友地图，后续可以直接接真实推荐。",
    "friend.summaryMatches": "你们可以互相关注，也可以发起一场共同 20 分钟专注。",
    "friend.summaryNoMatches": "在 Todo 里添加学习、工作、家务等标签后，这里会出现更准确的关系网。",
    "friend.requestSent": "已向 {name} 发送好友请求",
    "friend.joinedCluster": "{name} 已加入你的专注星群",
    "friend.coFocusAccepted": "{name} 接受了邀请，正在同步 20 分钟专注",
    "friend.add": "加好友",
    "friend.added": "已添加",
    "friend.connected": "已连接",
    "friend.coFocus": "一起专注",
    "friend.rankingSelf": "我的名次 #{rank}",
    "friend.rankingMetricRounds": "{value} 轮",
    "friend.rankingMetricMinutes": "{value} 分钟",
    "friend.rankingMetricStreak": "连续 {value} 天",
    "friend.noMatches": "暂无匹配用户。先在 Todo 里给任务打上类型标签。",
    "friend.mapEmpty": "匹配成功后才会显示交友地图。",
    "friend.mapMeta": "当前匹配 {count} 人，地图显示 {count} 个 Rovia 节点。",
    "account.demoTitle": "当前展示的是模拟账户和使用数据，用于路演、评审和前端走查。",
    "account.notConfiguredTitle": "账号服务未配置",
    "account.notConfiguredMeta": "填写后端地址和认证配置后可真实登录，也可以先用演示模式展示页面。",
    "account.sessionMeta": "账号同步已开启，当前 user_id 为 {userId}。",
    "account.waitingSyncMeta": "账号已恢复，正在等待后端同步。",
    "account.staticUserTitle": "固定用户模式",
    "account.staticUserMeta": "当前使用固定 user_id：{userId}。如果要走真实账号，请改成邮箱密码登录。",
    "account.authTitle": "账号登录",
    "account.authMeta": "登录后可同步任务、HRV 和压力数据",
    "account.signInTitle": "账号登录",
    "account.registerTitle": "账号注册",
    "account.signInMeta": "登录或注册后启用任务、专注和好友数据同步。首次注册可能需要邮箱确认。",
    "account.demoMode": "演示模式",
    "account.liveSync": "实时同步",
    "account.signedIn": "已登录",
    "account.currentAccount": "当前账号：{email}",
    "account.profileBioDemo": "当前是 Demo 账号。你看到的专注轮次、身体状态和 Todo 数据都来自本地模拟样本。",
    "account.profileBioConnected": "账号已连接。你可以在 Friend 页探索同标签用户，并发起一起专注。",
    "account.profileBioLocal": "当前是本地模式。登录后可同步账号数据并获得跨端关系推荐。",
    "account.appCopy": "退出前会自动保存本地状态，并断开当前桌宠连接。",
    "auth.needCredentials": "请输入邮箱和密码。",
    "auth.passwordTooShort": "密码至少 6 位。",
    "auth.passwordMismatch": "两次输入密码不一致。",
    "auth.signInFailed": "登录失败，请检查账号信息或后端认证配置。",
    "auth.signInSuccess": "登录成功，账号已连接。",
    "auth.signUpFailed": "注册失败，请检查账号格式或后端认证配置。",
    "auth.demoFailed": "加载演示数据失败。",
    "auth.signOutFailed": "退出登录失败。",
    "auth.signOutSuccess": "已退出登录。",
    "auth.exitDemoFailed": "退出演示失败。",
    "auth.alreadyRegistered": "该邮箱已被注册，请直接登录。",
    "auth.needsEmailConfirmation": "注册成功，请前往邮箱点击确认链接后再登录。",
    "auth.signUpSuccess": "注册成功，账号已自动登录。",
    "auth.exitDemoSuccess": "已退出演示模式。",
    "auth.signingIn": "登录中",
    "auth.signingUp": "注册中",
    "auth.loadingDemo": "加载中",
    "auth.signingOut": "退出中",
    "focus.noTask": "暂无任务",
    "focus.noSyncedRounds": "还没有同步记录",
    "focus.noRecentSessions": "登录后这里会显示最近同步的专注记录。",
    "focus.noRecentCloudSessions": "还没有同步到 focus_sessions 记录。",
    "focus.waiting": "等待中",
    "focus.completedRound": "本轮已完成",
    "focus.notStarted": "当前未开始专注",
    "focus.hintDemo": "当前展示的是模拟账户的专注历史、身体数据和 Todo 进度，用于演示效果。",
    "focus.hintSynced": "最近同步 {count} 轮，最后更新 {time}。",
    "focus.hintWaitingCloud": "账号服务已连接，正在等待第一批同步数据。",
    "focus.hintNeedLogin": "先登录账号，Focus 页就会显示后端专注统计和实时同步结果。",
    "focus.hintLocal": "当前仍在本地模式，后端专注数据还没有接进来。",
    "focus.currentTaskMeta": "当前任务：{title}",
    "focus.lastTaskMeta": "上一轮：{title}",
    "focus.nextStepMeta": "先写下一个最小的下一步",
    "focus.summary.focusing": "正在陪你完成 {title}",
    "focus.summary.Disconnected": "离线中，本地支持仍可用",
    "focus.summary.Idle": "从一个小步骤开始就好",
    "focus.summary.Ready": "现在可以开始",
    "focus.summary.Support": "先轻一点，也没关系",
    "focus.summary.Away": "这一轮在等你回来",
    "focus.summary.Completed": "这一轮已经完成",
    "focus.dailyRoundsMeta": "完成 {completed} / 中断 {interrupted}",
    "focus.dailyRoundsMetaEmpty": "今天还没有新的专注轮次",
    "focus.dailyMinutesMeta": "平均 {average} 分钟 / 轮",
    "focus.dailyMinutesMetaEmpty": "完成第一轮后，这里会开始累积",
    "focus.signalMeta": "HRV {hrv} | 压力 {stress}",
    "focus.lastSessionMeta": "{status} / {trigger} / {time}",
    "focus.lastSessionEmpty": "下一轮完成后，这里会显示最近记录。",
    "device.sensorWaiting": "设备数据还在等待中。",
    "device.sensorJustNow": "刚刚更新",
    "device.sensorSeconds": "{value} 秒前更新",
    "device.sensorMinutes": "{value} 分钟前更新",
    "device.sensorHours": "{value} 小时前更新",
    "todo.empty": "还没有任务，先写下一个最小的下一步。",
    "todo.promptRename": "更新任务标题",
    "todo.promptTag": "设置任务类型：study/work/home/health/social/general",
    "todo.summaryNote": "待完成 {open} · 已完成 {done} · 主要标签 {tag}",
    "todo.summaryTag": "主要标签：{tag}",
    "todo.summaryNoteEmpty": "先写下一个可执行的小任务",
    "todo.currentMeta": "当前专注：{title}",
    "todo.currentMetaFocusing": "专注进行中",
    "todo.currentMetaActive": "已设为当前任务",
    "todo.currentMetaIdle": "先整理下一轮任务",
    "todo.updated": "{time} 更新",
    "todo.activeBadge": "当前专注",
    "misc.justNow": "刚刚",
    "misc.secondsAgo": "{value} 秒前",
    "misc.minutesAgo": "{value} 分钟前",
    "misc.hoursAgo": "{value} 小时前",
    "misc.daysAgo": "{value} 天前",
    "misc.yes": "确定",
    "misc.no": "取消",
    "quit.confirm": "“{title}” 还在进行中。\n\n退出后这轮会结束，但本地状态会自动保存。\n\n确定退出 Rovia 吗？"
  },
  en: {
    "app.profile": "Account & Profile",
    "app.closePanel": "Close panel",
    "app.localeToggle": "Switch language",
    "tabs.focus": "Focus",
    "tabs.todo": "Todo",
    "tabs.squeeze": "Squeeze",
    "tabs.device": "Device",
    "tabs.friend": "Friend",
    "common.task": "Task",
    "common.state": "State",
    "common.trigger": "Trigger",
    "focus.currentSession": "Current Session",
    "focus.currentFocus": "Current Focus",
    "focus.dashboard": "My Focus Data",
    "focus.startDesktop": "Start",
    "focus.startWearable": "Band",
    "focus.endSession": "End",
    "focus.lastRound": "Last Round",
    "focus.dailyRounds": "Today's Rounds",
    "focus.dailyMinutes": "Today's Minutes",
    "focus.bodySignals": "Body Signals",
    "focus.trend": "7-Day Trend",
    "focus.recentSessions": "Recent Sessions",
    "todo.activeTask": "Active Task",
    "todo.overview": "Task Overview",
    "todo.currentLabel": "Current",
    "todo.mainTagLabel": "Main Tag",
    "todo.openLabel": "Open",
    "todo.doneLabel": "Done",
    "todo.newTodo": "New Todo",
    "todo.newTodoPlaceholder": "Add a task",
    "todo.addAction": "Add",
    "todo.stream": "Task Board",
    "squeeze.live": "Live Squeeze State",
    "squeeze.currentLevel": "Current Level",
    "squeeze.pressure": "Pressure",
    "squeeze.mappedPressure": "Mapped Pressure",
    "squeeze.frequency": "Frequency",
    "squeeze.lastMinute": "Last 1 min",
    "squeeze.lastFiveMinutes": "Last 5 min",
    "squeeze.lastDetected": "Last detected",
    "squeeze.timeline": "10 min pulse pattern",
    "tags.study": "Study",
    "tags.work": "Work",
    "tags.home": "Home",
    "tags.health": "Health",
    "tags.social": "Social",
    "tags.general": "General",
    "friend.discovery": "Friend Discovery",
    "friend.map": "Rovia Friend Map",
    "friend.suggested": "Suggested Friends",
    "friend.ranking": "Focus Ranking",
    "device.status": "Device Status",
    "device.physio": "Physio",
    "device.presence": "Presence",
    "device.sync": "Sync",
    "device.controls": "Device Controls",
    "device.physioPreset": "Physio Preset",
    "device.presencePreset": "Presence Preset",
    "account.account": "Account",
    "account.emailPlaceholder": "Email",
    "account.passwordPlaceholder": "Password",
    "account.passwordHintPlaceholder": "Password (at least 6 characters)",
    "account.confirmPasswordPlaceholder": "Confirm password",
    "account.signIn": "Sign In",
    "account.signUp": "Sign Up",
    "account.demo": "Demo",
    "account.signOut": "Sign Out",
    "account.profile": "Profile",
    "account.currentMood": "Current Mood",
    "account.currentTag": "Main Tag",
    "account.app": "App",
    "account.quitApp": "Quit Rovia",
    "states.ready": "Ready",
    "states.strained": "Strained",
    "states.unknown": "Unknown",
    "states.near": "Near",
    "states.far": "Far",
    "states.atDesk": "At desk",
    "states.awayDesk": "Away",
    "runtime.Disconnected": "Offline",
    "runtime.Idle": "Idle",
    "runtime.Ready": "Ready",
    "runtime.Support": "Support",
    "runtime.Focusing": "Focusing",
    "runtime.Away": "Away",
    "runtime.Completed": "Completed",
    "emotion.Offline": "Offline",
    "emotion.Calm": "Calm",
    "emotion.Invite": "Invite",
    "emotion.Care": "Care",
    "emotion.Focus": "Focus",
    "emotion.Wait": "Wait",
    "emotion.Celebrate": "Celebrate",
    "sync.demo": "DEMO",
    "sync.local": "LOCAL",
    "sync.backend": "BACKEND",
    "sync.supabase": "SUPABASE",
    "sync.auth-required": "LOGIN",
    "trigger.desktop": "Desktop",
    "trigger.wearable": "Wearable",
    "focusStatus.focusing": "running",
    "focusStatus.away": "away",
    "focusStatus.completed": "completed",
    "focusStatus.interrupted": "interrupted",
    "focusStatus.canceled": "canceled",
    "todoStatus.pending": "pending",
    "todoStatus.doing": "doing",
    "todoStatus.done": "done",
    "todoAction.current": "Current",
    "todoAction.activate": "Activate",
    "todoAction.rename": "Rename",
    "todoAction.done": "Done",
    "todoAction.tag": "Tag",
    "todoAction.manage": "Manage task",
    "todoAction.manageClose": "Collapse actions",
    "friend.tagsMock": "tags: mock",
    "friend.tagsPrefix": "tags: ",
    "friend.mockMatches": "{count} mock matches",
    "friend.matches": "{count} matches",
    "friend.headlineMatches": "People with similar task types",
    "friend.headlineNeedTags": "Add a few task tags to start matching",
    "friend.summaryMock": "Mock matches are shown for now so the friend map can be demoed before the backend is connected.",
    "friend.summaryMatches": "You can follow each other or start a shared 20-minute focus round.",
    "friend.summaryNoMatches": "Add tags like study, work, or home in Todo to get more accurate recommendations here.",
    "friend.requestSent": "Sent a friend request to {name}",
    "friend.joinedCluster": "{name} joined your focus cluster",
    "friend.coFocusAccepted": "{name} accepted the invite and synced into a 20-minute round",
    "friend.add": "Add",
    "friend.added": "Added",
    "friend.connected": "Connected",
    "friend.coFocus": "Co-focus",
    "friend.rankingSelf": "My rank #{rank}",
    "friend.rankingMetricRounds": "{value} rounds",
    "friend.rankingMetricMinutes": "{value} min",
    "friend.rankingMetricStreak": "{value}-day streak",
    "friend.noMatches": "No matches yet. Add tags to your todos first.",
    "friend.mapEmpty": "The map appears after matching succeeds.",
    "friend.mapMeta": "{count} matches found, so the map shows {count} Rovia nodes.",
    "account.demoTitle": "This view uses a demo account and sample data for presentations and UI walkthroughs.",
    "account.notConfiguredTitle": "Account service not configured",
    "account.notConfiguredMeta": "Add backend and auth settings to enable real sign-in, or stay in demo mode for now.",
    "account.sessionMeta": "Account sync is active. Current user_id: {userId}.",
    "account.waitingSyncMeta": "Session restored and waiting for backend sync.",
    "account.staticUserTitle": "Static User Mode",
    "account.staticUserMeta": "The current fixed user_id is {userId}. Use email/password auth if you want a real account identity.",
    "account.authTitle": "Account Login",
    "account.authMeta": "Sign in to sync tasks, HRV, and squeeze data.",
    "account.signInTitle": "Account Login",
    "account.registerTitle": "Create Account",
    "account.signInMeta": "Sign in or register to enable sync for tasks, focus, and friend data. First-time sign-up may require email confirmation.",
    "account.demoMode": "demo mode",
    "account.liveSync": "live sync",
    "account.signedIn": "signed in",
    "account.currentAccount": "Current account: {email}",
    "account.profileBioDemo": "This is a demo account. Focus rounds, body signals, and todo data are all sample records.",
    "account.profileBioConnected": "Your account is connected. Explore matched users in Friend and start a shared focus round.",
    "account.profileBioLocal": "You are in local mode right now. Sign in to sync across devices and unlock shared recommendations.",
    "account.appCopy": "Local state is saved automatically before quitting, and device connections will be closed.",
    "auth.needCredentials": "Please enter both email and password.",
    "auth.passwordTooShort": "Password must be at least 6 characters.",
    "auth.passwordMismatch": "The passwords do not match.",
    "auth.signInFailed": "Sign-in failed. Check your account or backend auth configuration.",
    "auth.signInSuccess": "Signed in successfully. Your account is connected.",
    "auth.signUpFailed": "Sign-up failed. Check your email format or backend auth configuration.",
    "auth.demoFailed": "Failed to load demo data.",
    "auth.signOutFailed": "Failed to sign out.",
    "auth.signOutSuccess": "Signed out.",
    "auth.exitDemoFailed": "Failed to exit demo mode.",
    "auth.alreadyRegistered": "This email is already registered. Please sign in instead.",
    "auth.needsEmailConfirmation": "Registration succeeded. Please confirm the email before signing in.",
    "auth.signUpSuccess": "Registration succeeded and the account is already signed in.",
    "auth.exitDemoSuccess": "Demo mode exited.",
    "auth.signingIn": "Signing in",
    "auth.signingUp": "Signing up",
    "auth.loadingDemo": "Loading",
    "auth.signingOut": "Signing out",
    "focus.noTask": "No active task",
    "focus.noSyncedRounds": "No synced rounds yet",
    "focus.noRecentSessions": "Recent synced focus sessions will appear here after you sign in.",
    "focus.noRecentCloudSessions": "No focus_sessions have been synced yet.",
    "focus.waiting": "Waiting",
    "focus.completedRound": "Round completed",
    "focus.notStarted": "No active focus round",
    "focus.hintDemo": "This page is showing demo account history, body signals, and todo progress for presentation purposes.",
    "focus.hintSynced": "{count} rounds synced recently, last updated {time}.",
    "focus.hintWaitingCloud": "The account service is connected and waiting for the first synced batch.",
    "focus.hintNeedLogin": "Sign in and this page will show backend focus stats and sync results.",
    "focus.hintLocal": "You are still in local mode, so backend focus data is not connected yet.",
    "focus.currentTaskMeta": "Current task: {title}",
    "focus.lastTaskMeta": "Last round: {title}",
    "focus.nextStepMeta": "Begin with one small next step",
    "focus.summary.focusing": "Holding this round for {title}",
    "focus.summary.Disconnected": "Offline, local support stays on",
    "focus.summary.Idle": "Start with one small step",
    "focus.summary.Ready": "Ready to begin",
    "focus.summary.Support": "Take it a little softer",
    "focus.summary.Away": "Waiting for you to return",
    "focus.summary.Completed": "One round completed",
    "focus.dailyRoundsMeta": "Completed {completed} / Interrupted {interrupted}",
    "focus.dailyRoundsMetaEmpty": "No focus rounds yet today",
    "focus.dailyMinutesMeta": "Average {average} min per round",
    "focus.dailyMinutesMetaEmpty": "Complete your first round and minutes will start adding up here.",
    "focus.signalMeta": "HRV {hrv} | Stress {stress}",
    "focus.lastSessionMeta": "{status} / {trigger} / {time}",
    "focus.lastSessionEmpty": "The latest completed round will show up here.",
    "device.sensorWaiting": "Sensor data is waiting.",
    "device.sensorJustNow": "Updated just now",
    "device.sensorSeconds": "Updated {value}s ago",
    "device.sensorMinutes": "Updated {value}m ago",
    "device.sensorHours": "Updated {value}h ago",
    "todo.empty": "No tasks yet. Start with one small item.",
    "todo.promptRename": "Rename task",
    "todo.promptTag": "Set task type: study/work/home/health/social/general",
    "todo.summaryNote": "Open {open} · Done {done} · Main tag {tag}",
    "todo.summaryTag": "Main tag: {tag}",
    "todo.summaryNoteEmpty": "Write down one actionable next step",
    "todo.currentMeta": "Current focus: {title}",
    "todo.currentMetaFocusing": "Focus round in progress",
    "todo.currentMetaActive": "Marked as your active task",
    "todo.currentMetaIdle": "Shape the next round from this list",
    "todo.updated": "Updated {time}",
    "todo.activeBadge": "Current focus",
    "misc.justNow": "just now",
    "misc.secondsAgo": "{value}s ago",
    "misc.minutesAgo": "{value}m ago",
    "misc.hoursAgo": "{value}h ago",
    "misc.daysAgo": "{value}d ago",
    "misc.yes": "Confirm",
    "misc.no": "Cancel",
    "quit.confirm": "“{title}” is still running.\n\nQuitting will end the round, but local state will be saved automatically.\n\nQuit Rovia now?"
  }
};

const TODO_TAG_LABELS = {
  study: "学习",
  work: "工作",
  home: "家务",
  health: "健康",
  social: "社交",
  general: "其他"
};

const FRIEND_UNIVERSE = [
  { id: "u1", name: "Lin", tags: ["study", "work"], mood: "steady" },
  { id: "u2", name: "Mia", tags: ["work", "social"], mood: "energetic" },
  { id: "u3", name: "Kai", tags: ["study", "health"], mood: "calm" },
  { id: "u4", name: "Noa", tags: ["home", "health"], mood: "steady" },
  { id: "u5", name: "Iris", tags: ["work", "study"], mood: "calm" },
  { id: "u6", name: "Jin", tags: ["home", "social"], mood: "warm" },
  { id: "u7", name: "Ari", tags: ["study"], mood: "focused" },
  { id: "u8", name: "Tao", tags: ["work", "home"], mood: "steady" }
];

const FRIEND_RANKING_MOCK = [
  { id: "self", name: "You", rounds: 6, minutes: 124, streak: 4 },
  { id: "u5", name: "Iris", rounds: 9, minutes: 182, streak: 7 },
  { id: "u3", name: "Kai", rounds: 8, minutes: 166, streak: 5 },
  { id: "u1", name: "Lin", rounds: 7, minutes: 151, streak: 6 },
  { id: "u7", name: "Ari", rounds: 5, minutes: 112, streak: 3 },
  { id: "u2", name: "Mia", rounds: 4, minutes: 95, streak: 2 }
];

const FRIEND_MOOD_THEMES = {
  steady: {
    start: "#d7e5ff",
    end: "#d8d6fb"
  },
  energetic: {
    start: "#ffe4a7",
    end: "#ffd0a8"
  },
  calm: {
    start: "#cbf3e4",
    end: "#c5ebff"
  },
  warm: {
    start: "#fadadd",
    end: "#ffd7b8"
  },
  focused: {
    start: "#d5e6ff",
    end: "#dce6ff"
  }
};

function t(key, values = {}) {
  const template = I18N[currentLocale]?.[key] ?? I18N.zh[key] ?? key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

function loadFriendRequestIds() {
  try {
    const raw = window.localStorage.getItem(FRIEND_REQUEST_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter(Boolean).map((value) => String(value)));
  } catch (error) {
    return new Set();
  }
}

function persistFriendRequestIds() {
  try {
    window.localStorage.setItem(
      FRIEND_REQUEST_STORAGE_KEY,
      JSON.stringify(Array.from(requestedFriendIds))
    );
  } catch (error) {
    // ignore storage write failures in embedded webviews
  }
}

function getFriendStateId(friendId) {
  return String(friendId || "").replace(/-mock-\d+$/, "");
}

function applyStaticCopy() {
  document.documentElement.lang = currentLocale === "zh" ? "zh-CN" : "en";

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });

}

function formatTime(totalSec) {
  const min = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(totalSec % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

function formatPanelDate(date = new Date()) {
  if (currentLocale === "zh") {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date).toUpperCase();
}

function formatSensorTime(iso) {
  if (!iso) {
    return t("device.sensorWaiting");
  }

  const delta = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (delta < 5) {
    return t("device.sensorJustNow");
  }
  if (delta < 60) {
    return t("device.sensorSeconds", { value: delta });
  }
  if (delta < 3600) {
    return t("device.sensorMinutes", { value: Math.floor(delta / 60) });
  }

  return t("device.sensorHours", { value: Math.floor(delta / 3600) });
}

function formatRelativeTime(iso) {
  if (!iso) {
    return t("misc.justNow");
  }

  const delta = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (delta < 60) {
    return t("misc.secondsAgo", { value: delta });
  }
  if (delta < 3600) {
    return t("misc.minutesAgo", { value: Math.floor(delta / 60) });
  }
  if (delta < 86400) {
    return t("misc.hoursAgo", { value: Math.floor(delta / 3600) });
  }

  return t("misc.daysAgo", { value: Math.floor(delta / 86400) });
}

function formatTodoSchedule(date, slotIndex = 0) {
  const base = new Date(date || Date.now());
  const slotTemplates = [
    { hour: 10, minute: 0 },
    { hour: 14, minute: 0 },
    { hour: 16, minute: 30 },
    { hour: 19, minute: 30 }
  ];
  const slot = slotTemplates[slotIndex % slotTemplates.length];
  const scheduled = new Date(base);
  scheduled.setHours(slot.hour, slot.minute, 0, 0);
  scheduled.setDate(base.getDate() + Math.floor(slotIndex / slotTemplates.length));

  const month = scheduled.getMonth() + 1;
  const day = scheduled.getDate();
  const hour = String(scheduled.getHours()).padStart(2, "0");
  const minute = String(scheduled.getMinutes()).padStart(2, "0");

  if (currentLocale === "zh") {
    return `${month}月${day}日 ${hour}:${minute}`;
  }

  return `${month}/${day} ${hour}:${minute}`;
}

function buildScheduledAt(dateValue, timeValue) {
  if (!dateValue) {
    return null;
  }

  const timeText = timeValue || "10:00";
  const iso = new Date(`${dateValue}T${timeText}:00`);
  if (Number.isNaN(iso.getTime())) {
    return null;
  }

  return iso.toISOString();
}

function getDefaultTodoScheduleInput() {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return {
    date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
      next.getDate()
    ).padStart(2, "0")}`,
    time: `${String(next.getHours()).padStart(2, "0")}:00`
  };
}

function extractTodoDisplayTitle(title) {
  const cleanTitle = String(title || "").trim();
  return cleanTitle.replace(
    /^(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2})\s*\d{1,2}:\d{2}\s*/,
    ""
  );
}

function getFriendTheme(friendId) {
  if (friendId === "self") {
    return { start: "#d9d0ff", end: "#c6ebff" };
  }

  const friend = FRIEND_UNIVERSE.find((entry) => entry.id === friendId);
  return FRIEND_MOOD_THEMES[friend?.mood] || FRIEND_MOOD_THEMES.steady;
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return currentLocale === "zh" ? "早上好。" : "Good morning.";
  }
  if (hour < 18) {
    return currentLocale === "zh" ? "下午好。" : "Good afternoon.";
  }
  return currentLocale === "zh" ? "晚上好。" : "Good evening.";
}

function humanizeTrigger(triggerSource) {
  return triggerSource === "wearable" ? t("trigger.wearable") : t("trigger.desktop");
}

function humanizePhysio(physio) {
  return t(`states.${physio}`) || physio;
}

function humanizePresence(presence) {
  return presence === "far" ? t("states.far") : t("states.near");
}

function humanizeSqueezeLevel(level) {
  const labels =
    currentLocale === "zh"
      ? {
          idle: "平静",
          light: "轻捏",
          firm: "稳定捏压",
          squeeze: "高强度捏压"
        }
      : {
          idle: "Calm",
          light: "Light",
          firm: "Firm",
          squeeze: "Intense"
        };

  return labels[level] || labels.idle;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getSqueezePressurePercent(metrics = {}) {
  const explicitPercent = Number(metrics.pressurePercent);
  if (Number.isFinite(explicitPercent)) {
    return Math.round(clampNumber(explicitPercent, 0, 100));
  }

  const rawOrPercent = Number(metrics.pressureRaw ?? metrics.pressureValue);
  if (!Number.isFinite(rawOrPercent)) {
    return 0;
  }

  if (rawOrPercent > 100) {
    return Math.round(clampNumber((rawOrPercent / SQUEEZE_SENSOR_MAX) * 100, 0, 100));
  }

  return Math.round(clampNumber(rawOrPercent, 0, 100));
}

function getSqueezePressureRaw(metrics = {}) {
  const explicitRaw = Number(metrics.pressureRaw);
  if (Number.isFinite(explicitRaw)) {
    return Math.round(clampNumber(explicitRaw, 0, SQUEEZE_SENSOR_MAX));
  }

  const rawOrPercent = Number(metrics.pressureValue);
  if (!Number.isFinite(rawOrPercent)) {
    return 0;
  }

  if (rawOrPercent > 100) {
    return Math.round(clampNumber(rawOrPercent, 0, SQUEEZE_SENSOR_MAX));
  }

  return Math.round((clampNumber(rawOrPercent, 0, 100) / 100) * SQUEEZE_SENSOR_MAX);
}

function resolveSqueezeRegulationKey(squeeze, pressurePercent) {
  if (pressurePercent >= 78 || squeeze.ratePerMinute >= 8 || squeeze.pulseCount5m >= 18) {
    return "intense";
  }
  if (pressurePercent >= 34 || squeeze.ratePerMinute >= 3 || squeeze.pulseCount5m >= 8) {
    return "active";
  }
  return "steady";
}

function resolveSqueezeRegulationState(squeeze, pressurePercent) {
  const key = resolveSqueezeRegulationKey(squeeze, pressurePercent);
  if (key === "intense") {
    return currentLocale === "zh" ? "高频调节" : "intense regulation";
  }
  if (key === "active") {
    return currentLocale === "zh" ? "正在调节" : "active regulation";
  }
  return currentLocale === "zh" ? "平稳" : "steady";
}

function getSqueezeGuidance(state) {
  const squeeze = state.squeeze || {};
  const pressureLevel = state.metrics?.pressureLevel || "idle";
  const pressurePercent = getSqueezePressurePercent(state.metrics);

  if (!squeeze.lastPulseAt) {
    return currentLocale === "zh"
      ? "还没有检测到捏捏动作，连接设备后这里会显示你的调节节奏。"
      : "No squeeze pulses yet. Connect the device to see your regulation rhythm here.";
  }

  if (pressureLevel === "squeeze" || pressurePercent >= 78 || squeeze.ratePerMinute >= 8) {
    return currentLocale === "zh"
      ? "捏捏频率偏高，可能正在用重复动作缓冲压力。Rovia 可以陪你切到更轻的任务。"
      : "Squeeze frequency is high. Repetitive motion may be buffering pressure, and Rovia can help shift to a lighter task.";
  }

  if (squeeze.ratePerMinute >= 3) {
    return currentLocale === "zh"
      ? "你正在用捏捏维持节奏，这通常适合进入结构化的 20 分钟专注。"
      : "You are using the squeeze to hold rhythm, which often pairs well with a structured 20-minute focus block.";
  }

  return currentLocale === "zh"
    ? "当前捏捏节奏比较平稳，可以继续保持低压力的专注环境。"
    : "Your squeeze rhythm looks steady right now, which supports a lower-pressure focus environment.";
}

function humanizeRuntime(status, emotion) {
  const runtimeLabel = t(`runtime.${status}`);
  const emotionLabel = t(`emotion.${emotion}`) || emotion;
  return `${runtimeLabel} / ${emotionLabel}`;
}

function humanizeSyncMode(mode) {
  return t(`sync.${mode || "local"}`);
}

function humanizeFocusStatus(status) {
  return t(`focusStatus.${status || "unknown"}`) || status || t("states.unknown");
}

function getFocusSummary(state) {
  if (state.focusSession) {
    return t("focus.summary.focusing", {
      title: state.focusSession.taskTitle
    });
  }

  return t(`focus.summary.${state.runtimeStatus}`) || t("focus.summary.Idle");
}

function humanizeTodoStatus(status) {
  return t(`todoStatus.${status}`) || status;
}

function getTodoMeta(todo) {
  const parts = [humanizeTodoStatus(todo.status)];
  if (todo.isActive) {
    parts.unshift(t("todoAction.current"));
  }
  return parts.join(" / ");
}

function normalizeTodoTag(tag) {
  const value = String(tag || "")
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TODO_TAG_LABELS, value)) {
    return value;
  }
  return "general";
}

function humanizeTodoTag(tag) {
  const normalized = normalizeTodoTag(tag);
  return t(`tags.${normalized}`) || TODO_TAG_LABELS[normalized] || TODO_TAG_LABELS.general;
}

async function requestQuitFromPanel() {
  if (currentState?.focusSession) {
    const taskTitle = currentState.focusSession.taskTitle || t("focus.currentFocus");
    const shouldQuit = window.confirm(t("quit.confirm", { title: taskTitle }));
    if (!shouldQuit) {
      return;
    }
  }

  await window.rovia.quitApp();
}

function calculateTagStats(todos) {
  const counts = {};
  for (const todo of todos) {
    const tag = normalizeTodoTag(todo.tag);
    counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

function setActiveTab(tab) {
  activeTab = tab;

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });

  document.querySelectorAll(".panel-page").forEach((page) => {
    page.classList.toggle("is-active", page.id === `page-${tab}`);
  });
}

function openPanelTab(tab) {
  const nextTab = AVAILABLE_TABS.has(tab) ? tab : "focus";
  setActiveTab(nextTab);
  startDeviceStatusPolling();

  if (nextTab === "friend") {
    window.requestAnimationFrame(() => {
      if (currentState) {
        renderFriendList(currentState);
      }
      friendMapController?.handleResize?.();
    });
  }

  if (nextTab === "device") {
    refreshDeviceStatus().then(() => {
      renderDeviceConnector();
    });
  }
}

function createTodoCard(todo, slotIndex = 0) {
  const isExpanded = expandedTodoId === todo.id;
  const item = document.createElement("article");
  item.className = "todo-item";
  item.dataset.active = String(todo.isActive);
  item.dataset.done = String(todo.status === "done");
  item.dataset.open = String(isExpanded);

  const main = document.createElement("div");
  main.className = "todo-main";

  const titleWrap = document.createElement("div");
  titleWrap.className = "todo-title-wrap";

  const title = document.createElement("div");
  title.className = "todo-title";
  title.textContent = extractTodoDisplayTitle(todo.title);

  const time = document.createElement("div");
  time.className = "todo-time";
  time.textContent = `${formatTodoSchedule(todo.scheduledAt || todo.updatedAt, slotIndex)} · ${formatRelativeTime(
    todo.updatedAt
  )}`;

  const subline = document.createElement("div");
  subline.className = "todo-subline";
  subline.textContent = getTodoMeta(todo);

  const status = document.createElement("span");
  status.className = "todo-status-pill";
  status.textContent = humanizeTodoStatus(todo.status);

  const top = document.createElement("div");
  top.className = "todo-top";

  const head = document.createElement("div");
  head.className = "todo-head";

  titleWrap.append(title, time, subline);
  head.append(titleWrap, status);

  const manageButton = document.createElement("button");
  manageButton.className = "todo-menu-button";
  manageButton.type = "button";
  manageButton.textContent = "···";
  manageButton.setAttribute(
    "aria-label",
    isExpanded ? t("todoAction.manageClose") : t("todoAction.manage")
  );
  manageButton.setAttribute("title", isExpanded ? t("todoAction.manageClose") : t("todoAction.manage"));
  manageButton.setAttribute("aria-expanded", String(isExpanded));
  manageButton.addEventListener("click", () => {
    expandedTodoId = isExpanded ? null : todo.id;
    if (currentState) {
      render(currentState);
    }
  });

  top.append(head, manageButton);

  const badges = document.createElement("div");
  badges.className = "todo-badges";

  const normalizedTag = normalizeTodoTag(todo.tag);
  const tag = document.createElement("span");
  tag.className = "todo-tag";
  tag.dataset.tag = normalizedTag;
  tag.textContent = humanizeTodoTag(normalizedTag);
  badges.append(tag);

  if (todo.isActive) {
    const activeBadge = document.createElement("span");
    activeBadge.className = "todo-inline-badge";
    activeBadge.textContent = t("todo.activeBadge");
    badges.appendChild(activeBadge);
  }

  main.append(top, badges);

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  if (isExpanded) {
    if (!todo.isActive && todo.status !== "done") {
      const activate = document.createElement("button");
      activate.className = "mini-button";
      activate.type = "button";
      activate.textContent = t("todoAction.activate");
      activate.addEventListener("click", () => {
        expandedTodoId = null;
        window.rovia.setActiveTodo(todo.id);
      });
      actions.appendChild(activate);
    }

    const edit = document.createElement("button");
    edit.className = "mini-button";
    edit.type = "button";
    edit.textContent = t("todoAction.rename");
    edit.addEventListener("click", () => {
      const nextTitle = window.prompt(t("todo.promptRename"), todo.title);
      if (nextTitle) {
        expandedTodoId = null;
        window.rovia.updateTodoTitle(todo.id, nextTitle);
      }
    });
    actions.appendChild(edit);

    const tagEdit = document.createElement("button");
    tagEdit.className = "mini-button";
    tagEdit.type = "button";
    tagEdit.textContent = t("todoAction.tag");
    tagEdit.addEventListener("click", () => {
      const nextTag = window.prompt(t("todo.promptTag"), normalizedTag);
      if (nextTag) {
        expandedTodoId = null;
        window.rovia.updateTodoTag(todo.id, normalizeTodoTag(nextTag));
      }
    });
    actions.appendChild(tagEdit);

    if (todo.status !== "done") {
      const done = document.createElement("button");
      done.className = "mini-button";
      done.type = "button";
      done.textContent = t("todoAction.done");
      done.addEventListener("click", () => {
        expandedTodoId = null;
        window.rovia.markTodoDone(todo.id);
      });
      actions.appendChild(done);
    }
  }

  item.append(main);
  if (isExpanded && actions.childElementCount) {
    item.append(actions);
  }

  return item;
}

function appendTodoGroup(container, title, todos, options = {}) {
  if (!todos.length) {
    return;
  }

  const { collapsible = false, open = false } = options;
  if (!collapsible) {
    const section = document.createElement("section");
    section.className = "todo-group";

    const head = document.createElement("div");
    head.className = "todo-group-head";

    const label = document.createElement("span");
    label.className = "todo-group-title";
    label.textContent = title;

    const count = document.createElement("span");
    count.className = "todo-group-count";
    count.textContent = String(todos.length);

    const list = document.createElement("div");
    list.className = "todo-group-list";
    todos.forEach((todo, index) => {
      list.appendChild(createTodoCard(todo, index));
    });

    head.append(label, count);
    section.append(head, list);
    container.appendChild(section);
    return;
  }

  const details = document.createElement("details");
  details.className = "todo-group todo-group-details";
  details.open = open;

  const summary = document.createElement("summary");
  summary.className = "todo-group-summary";

  const label = document.createElement("span");
  label.textContent = title;

  const count = document.createElement("span");
  count.className = "todo-group-count";
  count.textContent = String(todos.length);

  const list = document.createElement("div");
  list.className = "todo-group-list";
  todos.forEach((todo, index) => {
    list.appendChild(createTodoCard(todo, index));
  });

  summary.append(label, count);
  details.append(summary, list);
  container.appendChild(details);
}

function renderTodos(state) {
  todoList.innerHTML = "";

  if (!state.todos.length) {
    const empty = document.createElement("p");
    empty.className = "card-subtle";
    empty.textContent = t("todo.empty");
    todoList.appendChild(empty);
    return;
  }

  const rank = {
    true: 0,
    doing: 1,
    pending: 2,
    done: 3
  };

  const todos = [...state.todos].sort((left, right) => {
    const leftRank = left.isActive ? rank.true : rank[left.status] ?? 99;
    const rightRank = right.isActive ? rank.true : rank[right.status] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });

  const openTodos = todos.filter((todo) => todo.status !== "done");
  const doneTodos = todos.filter((todo) => todo.status === "done");

  appendTodoGroup(todoList, t("todo.openLabel"), openTodos);
  appendTodoGroup(todoList, t("todo.doneLabel"), doneTodos, {
    collapsible: true,
    open: !openTodos.length
  });
}

function collectActiveTags(state) {
  const counts = calculateTagStats(state.todos || []);
  const sorted = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  return sorted.slice(0, 3).map(([tag]) => tag);
}

function scoreFriend(friend, activeTags) {
  if (!activeTags.length) {
    return 0;
  }
  return friend.tags.filter((tag) => activeTags.includes(tag)).length;
}

function clearFriendMapOverlay() {
  if (!friendCosmos) {
    return;
  }

  friendCosmos.querySelectorAll(".friend-map-surface").forEach((node) => {
    node.remove();
  });
}

function renderFriendMapOverlay(matches) {
  if (!friendCosmos) {
    return;
  }

  clearFriendMapOverlay();

  const width = friendCosmos.clientWidth || 320;
  const height = friendCosmos.clientHeight || 240;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("friend-map-surface");

  const nodes = matches.map((friend, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(matches.length, 1);
    const localRadius = radius * (0.78 + (index % 3) * 0.1);
    return {
      ...friend,
      x: centerX + Math.cos(angle) * localRadius,
      y: centerY + Math.sin(angle) * localRadius
    };
  });

  for (const node of nodes) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(centerX));
    line.setAttribute("y1", String(centerY));
    line.setAttribute("x2", String(node.x));
    line.setAttribute("y2", String(node.y));
    line.setAttribute("class", "friend-link");
    svg.appendChild(line);
  }

  friendCosmos.appendChild(svg);

  const anchor = document.createElement("div");
  anchor.className = "friend-anchor friend-map-surface";
  anchor.textContent = "YOU";
  friendCosmos.appendChild(anchor);

  for (const node of nodes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "friend-orb friend-map-surface";
    button.style.left = `${node.x}px`;
    button.style.top = `${node.y}px`;
    button.style.setProperty("--float-duration", `${3.4 + (node.score || 1) * 0.4}s`);
    button.style.setProperty("--float-delay", `${(node.id.charCodeAt(0) % 7) * 0.12}s`);
    button.title = `${node.name} | ${node.tags.map(humanizeTodoTag).join(" / ")}`;
    button.addEventListener("click", () => {
      friendFeedback = t("friend.joinedCluster", { name: node.name });
      if (currentState) {
        render(currentState);
      }
    });

    const label = document.createElement("span");
    label.className = "friend-orb-name";
    label.textContent = node.name;

    button.append(label);
    friendCosmos.appendChild(button);
  }
}

function renderFriendCosmos(state, matches, activeTags) {
  if (!friendCosmos) {
    return;
  }

  if (!friendMapController) {
    friendMapController = ensureFriendMap(friendCosmos);
  }

  if (!matches.length) {
    friendCosmos.style.display = "none";
    friendCosmos.setAttribute("aria-hidden", "true");
    friendMapController?.setVisible(false);
    friendMapController?.setMatchCount(0);
    clearFriendMapOverlay();
    if (friendCosmosEmpty) {
      friendCosmosEmpty.hidden = false;
      friendCosmosEmpty.textContent = t("friend.mapEmpty");
    }
    if (friendMapMeta) {
      friendMapMeta.textContent = t("friend.mapEmpty");
    }
    return;
  }

  friendCosmos.style.display = "block";
  friendCosmos.removeAttribute("aria-hidden");
  friendMapController?.setVisible(true);
  friendMapController?.setMatchCount(matches.length);
  if (friendCosmosEmpty) {
    friendCosmosEmpty.hidden = true;
  }
  if (friendMapMeta) {
    friendMapMeta.textContent = t("friend.mapMeta", { count: matches.length });
  }

  renderFriendMapOverlay(matches);
  window.requestAnimationFrame(() => {
    friendMapController?.handleResize?.();
    renderFriendMapOverlay(matches);
  });
}

function buildFriendRanking(state, matches) {
  const remoteRanking = Array.isArray(state.remoteData?.friendRanking)
    ? state.remoteData.friendRanking
    : [];
  if (remoteRanking.length) {
    return remoteRanking.map((entry) => ({
      ...entry
    }));
  }

  const todayStats = buildTodayFocusStats(state);
  const selfEntry = {
    id: "self",
    name: currentLocale === "zh" ? "你" : "You",
    rounds: Math.max(1, todayStats.totalSessions || 0),
    minutes: Math.max(20, todayStats.totalMinutes || 0),
    streak: Math.max(1, Math.min(7, activeTab === "friend" ? todayStats.completedSessions + 1 : 1))
  };

  const rankingMap = new Map([[selfEntry.id, selfEntry]]);
  FRIEND_RANKING_MOCK.forEach((entry) => {
    if (entry.id !== "self") {
      rankingMap.set(entry.id, { ...entry });
    }
  });

  matches.forEach((friend, index) => {
    const existing = rankingMap.get(getFriendStateId(friend.id));
    rankingMap.set(getFriendStateId(friend.id), {
      id: getFriendStateId(friend.id),
      name: friend.name,
      rounds: existing?.rounds ?? Math.max(3, 6 - index),
      minutes: existing?.minutes ?? Math.max(72, 148 - index * 11),
      streak: existing?.streak ?? Math.max(1, 5 - index)
    });
  });

  return Array.from(rankingMap.values()).sort((left, right) => {
    if (right.rounds !== left.rounds) {
      return right.rounds - left.rounds;
    }
    if (right.minutes !== left.minutes) {
      return right.minutes - left.minutes;
    }
    return right.streak - left.streak;
  });
}

function renderFriendRanking(state, matches) {
  if (!friendRankingSelf || !friendRankingPodium || !friendRankingList) {
    return;
  }

  const ranking = buildFriendRanking(state, matches);
  const selfIndex = ranking.findIndex(
    (entry) => entry.id === "self" || entry.is_self === true
  );
  const selfRank = Math.max(
    1,
    selfIndex + 1
  );

  friendRankingSelf.textContent = t("friend.rankingSelf", { rank: selfRank });
  friendRankingPodium.innerHTML = "";
  friendRankingList.innerHTML = "";

  ranking.slice(0, 3).forEach((entry, index) => {
    const theme = getFriendTheme(entry.id);
    const card = document.createElement("article");
    card.className = "friend-rank-card";
    if (entry.id === "self") {
      card.classList.add("is-self");
    }
    card.style.setProperty("--rank-start", theme.start);
    card.style.setProperty("--rank-end", theme.end);

    const rank = document.createElement("span");
    rank.className = "friend-rank-order";
    rank.textContent = `#${index + 1}`;

    const avatar = document.createElement("div");
    avatar.className = "friend-rank-avatar";
    avatar.setAttribute("aria-hidden", "true");

    const avatarCore = document.createElement("span");
    avatarCore.className = "friend-rank-avatar-core";
    avatar.appendChild(avatarCore);

    const copy = document.createElement("div");
    copy.className = "friend-rank-copy";

    const name = document.createElement("h3");
    name.className = "friend-rank-name";
    name.textContent = entry.name;

    const meta = document.createElement("p");
    meta.className = "friend-rank-meta";
    meta.textContent = [
      t("friend.rankingMetricRounds", { value: entry.rounds }),
      t("friend.rankingMetricMinutes", { value: entry.minutes })
    ].join(" / ");

    const streak = document.createElement("span");
    streak.className = "friend-pill";
    streak.textContent = t("friend.rankingMetricStreak", { value: entry.streak });

    copy.append(name, meta);
    card.append(rank, avatar, copy, streak);
    friendRankingPodium.appendChild(card);
  });

  ranking.slice(3).forEach((entry, index) => {
    const theme = getFriendTheme(entry.id);
    const row = document.createElement("article");
    row.className = "friend-rank-row";
    if (entry.id === "self") {
      row.classList.add("is-self");
    }
    row.style.setProperty("--rank-start", theme.start);
    row.style.setProperty("--rank-end", theme.end);

    const avatar = document.createElement("div");
    avatar.className = "friend-rank-avatar is-small";
    avatar.setAttribute("aria-hidden", "true");

    const avatarCore = document.createElement("span");
    avatarCore.className = "friend-rank-avatar-core";
    avatar.appendChild(avatarCore);

    const left = document.createElement("div");
    left.className = "friend-rank-row-copy";

    const title = document.createElement("div");
    title.className = "friend-rank-row-title";
    title.textContent = `#${index + 4} ${entry.name}`;

    const desc = document.createElement("p");
    desc.className = "friend-rank-meta";
    desc.textContent = [
      t("friend.rankingMetricRounds", { value: entry.rounds }),
      t("friend.rankingMetricMinutes", { value: entry.minutes }),
      t("friend.rankingMetricStreak", { value: entry.streak })
    ].join(" / ");

    left.append(title, desc);
    row.append(avatar, left);
    friendRankingList.appendChild(row);
  });
}

function renderFriendList(state) {
  if (!friendList) {
    return;
  }

  const activeTags = collectActiveTags(state);
  const remoteMatches = Array.isArray(state.remoteData?.friends)
    ? state.remoteData.friends
    : [];
  const usingBackendSource = Boolean(state.connection?.backend);
  const hasBackendMatches = usingBackendSource && remoteMatches.length > 0;
  const actualMatches = usingBackendSource
    ? remoteMatches.map((friend) => ({
        ...friend,
        score:
          Number.isFinite(friend.score) && friend.score > 0
            ? friend.score
            : Array.isArray(friend.tags)
              ? friend.tags.length
              : 1
      }))
    : FRIEND_UNIVERSE.map((friend) => ({
        ...friend,
        score: scoreFriend(friend, activeTags)
      }))
        .filter((friend) => friend.score > 0)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const usingMockMatches =
    !usingBackendSource && !hasBackendMatches && actualMatches.length === 0;
  const matches = (usingMockMatches
    ? FRIEND_UNIVERSE.slice(0, 4).map((friend, index) => ({
        ...friend,
        score: 1,
        mock: true,
        id: `${friend.id}-mock-${index}`
      }))
    : actualMatches
  ).slice(0, 6);

  friendActiveTags.textContent = activeTags.length
    ? `${t("friend.tagsPrefix")}${activeTags.map(humanizeTodoTag).join(" / ")}`
    : t("friend.tagsMock");
  friendCount.textContent = usingMockMatches
    ? t("friend.mockMatches", { count: matches.length })
    : t("friend.matches", { count: matches.length });
  friendHeadline.textContent = matches.length
    ? t("friend.headlineMatches")
    : t("friend.headlineNeedTags");
  friendSummary.textContent =
    friendFeedback ||
    (usingMockMatches
      ? t("friend.summaryMock")
      : matches.length
      ? t("friend.summaryMatches")
      : t("friend.summaryNoMatches"));

  renderFriendCosmos(state, matches, activeTags);
  renderFriendRanking(state, matches);

  friendList.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "card-subtle";
    empty.textContent = t("friend.noMatches");
    friendList.appendChild(empty);
    return;
  }

  for (const friend of matches) {
    const friendStateId = getFriendStateId(friend.id);
    const isPending = friend.status === "pending";
    const isConnected = friend.status === "connected";
    const isAdded = isConnected || isPending || requestedFriendIds.has(friendStateId);

    const item = document.createElement("article");
    item.className = "friend-item";
    item.dataset.added = String(isAdded);
    if (isAdded) {
      item.classList.add("is-added");
    }

    const copy = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "friend-name";
    name.textContent = friend.name;

    const meta = document.createElement("div");
    meta.className = "friend-meta";

    const similarity = document.createElement("span");
    similarity.className = "friend-pill";
    similarity.textContent = currentLocale === "zh" ? `匹配 ${friend.score}` : `match ${friend.score}`;

    const tags = document.createElement("span");
    tags.className = "friend-pill";
    tags.textContent = friend.tags.map(humanizeTodoTag).join(" / ");

    meta.append(similarity, tags);
    if (isConnected) {
      const linked = document.createElement("span");
      linked.className = "friend-pill is-positive";
      linked.textContent = t("friend.connected");
      meta.appendChild(linked);
    } else if (isPending) {
      const linked = document.createElement("span");
      linked.className = "friend-pill";
      linked.textContent = currentLocale === "zh" ? "待通过" : "Pending";
      meta.appendChild(linked);
    }
    copy.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "friend-actions";

    const addButton = document.createElement("button");
    addButton.className = "mini-button";
    addButton.type = "button";
    addButton.textContent = isAdded ? t("friend.added") : t("friend.add");
    addButton.disabled = isAdded;
    if (isAdded) {
      addButton.classList.add("is-added");
    } else {
      addButton.addEventListener("click", async () => {
        if (window.rovia.requestFriend && currentState?.connection?.backend) {
          try {
            await window.rovia.requestFriend(friendStateId);
            if (currentState?.remoteData?.friends) {
              currentState.remoteData.friends = currentState.remoteData.friends.map((entry) =>
                getFriendStateId(entry.id) === friendStateId
                  ? { ...entry, status: "pending" }
                  : entry
              );
            }
          } catch (_error) {
            // fall through to local feedback so the UI stays responsive
          }
        }

        requestedFriendIds.add(friendStateId);
        persistFriendRequestIds();
        friendFeedback = t("friend.requestSent", { name: friend.name });
        if (currentState) {
          render(currentState);
        }
      });
    }

    const coFocusButton = document.createElement("button");
    coFocusButton.className = "secondary-button";
    coFocusButton.type = "button";
    coFocusButton.textContent = t("friend.coFocus");
    coFocusButton.addEventListener("click", () => {
      friendFeedback = t("friend.coFocusAccepted", { name: friend.name });
      window.rovia.startFocus("desktop");
    });

    actions.append(addButton, coFocusButton);
    item.append(copy, actions);
    friendList.appendChild(item);
  }
}

function isSameLocalDay(iso, baseDate = new Date()) {
  if (!iso) {
    return false;
  }

  const target = new Date(iso);
  return (
    target.getFullYear() === baseDate.getFullYear() &&
    target.getMonth() === baseDate.getMonth() &&
    target.getDate() === baseDate.getDate()
  );
}

function buildTodayFocusStats(state) {
  const sessions = [
    ...(state.remoteData?.recentFocusSessions || []),
    ...(state.lastCompletedSession ? [state.lastCompletedSession] : [])
  ];
  const uniqueSessions = Array.from(
    new Map(
      sessions
        .filter(Boolean)
        .map((session) => [session.id || `${session.taskTitle}-${session.startedAt}`, session])
    ).values()
  );
  const todaySessions = uniqueSessions.filter((session) =>
    isSameLocalDay(session.updatedAt || session.endedAt || session.startedAt)
  );
  const currentSessionStartedToday =
    state.focusSession && isSameLocalDay(state.focusSession.startedAt || new Date().toISOString());

  const totalSessions = todaySessions.length + (currentSessionStartedToday ? 1 : 0);
  const completedSessions = todaySessions.filter((session) => session.status === "completed").length;
  const interruptedSessions = todaySessions.filter(
    (session) => session.status === "interrupted" || session.status === "canceled"
  ).length;
  const totalDurationSec =
    todaySessions.reduce((sum, session) => sum + (session.durationSec || 0), 0) +
    (state.focusSession ? state.focusSession.durationSec - state.focusSession.remainingSec : 0);
  const totalMinutes = Math.max(0, Math.round(totalDurationSec / 60));
  const averageMinutes = totalSessions
    ? Math.round((totalDurationSec / 60 / totalSessions) * 10) / 10
    : 0;

  return {
    totalSessions,
    completedSessions,
    interruptedSessions,
    totalMinutes,
    averageMinutes
  };
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWeeklyFocusSeries(state) {
  const formatter = new Intl.DateTimeFormat(currentLocale === "zh" ? "zh-CN" : "en-US", {
    weekday: "narrow"
  });
  const series = [];
  const buckets = new Map();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    const key = getLocalDateKey(date);
    const item = {
      key,
      label: formatter.format(date),
      minutes: 0,
      isToday: offset === 0
    };
    series.push(item);
    buckets.set(key, item);
  }

  const seen = new Set();
  const sessions = [
    ...(state.remoteData?.recentFocusSessions || []),
    state.lastCompletedSession
  ].filter(Boolean);

  for (const session of sessions) {
    const uniqueKey =
      session.id ||
      `${session.startedAt || ""}-${session.endedAt || ""}-${session.taskTitle || ""}-${session.status || ""}`;
    if (seen.has(uniqueKey)) {
      continue;
    }
    seen.add(uniqueKey);

    const stamp = session.endedAt || session.updatedAt || session.startedAt;
    if (!stamp) {
      continue;
    }

    const bucket = buckets.get(getLocalDateKey(new Date(stamp)));
    if (!bucket) {
      continue;
    }

    bucket.minutes += Math.max(0, Math.round((session.durationSec || 0) / 60));
  }

  if (state.focusSession?.startedAt) {
    const activeBucket = buckets.get(getLocalDateKey(new Date(state.focusSession.startedAt)));
    if (activeBucket) {
      activeBucket.minutes += Math.max(
        0,
        Math.round((state.focusSession.durationSec - state.focusSession.remainingSec) / 60)
      );
    }
  }

  return series;
}

function renderFocusWeekChart(state) {
  if (!focusWeekChart) {
    return;
  }

  focusWeekChart.innerHTML = "";
  const series = buildWeeklyFocusSeries(state);
  const maxMinutes = Math.max(20, ...series.map((entry) => entry.minutes));

  for (const entry of series) {
    const col = document.createElement("div");
    col.className = "focus-week-col";
    if (entry.isToday) {
      col.classList.add("is-today");
    }

    const value = document.createElement("span");
    value.className = "focus-week-value";
    value.textContent = entry.minutes ? `${entry.minutes}m` : "";

    const track = document.createElement("div");
    track.className = "focus-week-track";
    track.setAttribute(
      "title",
      currentLocale === "zh" ? `${entry.minutes} 分钟` : `${entry.minutes} min`
    );

    const fill = document.createElement("div");
    fill.className = "focus-week-fill";
    fill.style.height = `${Math.max(entry.minutes ? 12 : 6, (entry.minutes / maxMinutes) * 100)}%`;

    const day = document.createElement("span");
    day.className = "focus-week-day";
    day.textContent = entry.label;

    track.appendChild(fill);
    col.append(value, track, day);
    focusWeekChart.appendChild(col);
  }
}

function humanizeDeviceConnectionState(state) {
  const labels = {
    unselected: currentLocale === "zh" ? "未选择" : "Unselected",
    discovered: currentLocale === "zh" ? "已发现" : "Discovered",
    connecting: currentLocale === "zh" ? "连接中" : "Connecting",
    connected: currentLocale === "zh" ? "已连接" : "Connected",
    offline: currentLocale === "zh" ? "离线" : "Offline",
    connection_failed: currentLocale === "zh" ? "连接失败" : "Failed"
  };

  return labels[state] || (currentLocale === "zh" ? "未选择" : "Unselected");
}

function renderDeviceScanList() {
  if (!deviceScanList) {
    return;
  }

  deviceScanList.innerHTML = "";

  if (!deviceModuleState.scanResults.length) {
    return;
  }

  deviceModuleState.scanResults.forEach((item) => {
    const row = document.createElement("div");
    row.className = "device-scan-item";

    const info = document.createElement("div");
    info.className = "device-scan-info";

    const name = document.createElement("strong");
    name.className = "device-scan-name";
    name.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "device-scan-rssi";
    meta.textContent =
      item.rssi !== null && item.rssi !== undefined
        ? `${item.rssi} dBm`
        : currentLocale === "zh"
          ? "RSSI --"
          : "RSSI --";

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "device-scan-actions";

    const wristbandButton = document.createElement("button");
    wristbandButton.type = "button";
    wristbandButton.className = "device-pick-button";
    wristbandButton.classList.toggle(
      "is-active",
      deviceModuleState.selected.wristband === item.name
    );
    wristbandButton.textContent =
      currentLocale === "zh" ? "设为手环" : "Use as wristband";
    wristbandButton.disabled = deviceModuleBusy;
    wristbandButton.addEventListener("click", () => {
      deviceModuleState.selected.wristband = item.name;
      persistDeviceSelections();
      renderDeviceConnector();
    });

    const squeezeButton = document.createElement("button");
    squeezeButton.type = "button";
    squeezeButton.className = "device-pick-button";
    squeezeButton.classList.toggle(
      "is-active",
      deviceModuleState.selected.squeeze === item.name
    );
    squeezeButton.textContent =
      currentLocale === "zh" ? "设为捏捏" : "Use as squeeze";
    squeezeButton.disabled = deviceModuleBusy;
    squeezeButton.addEventListener("click", () => {
      deviceModuleState.selected.squeeze = item.name;
      persistDeviceSelections();
      renderDeviceConnector();
    });

    actions.append(wristbandButton, squeezeButton);
    row.append(info, actions);
    deviceScanList.appendChild(row);
  });
}

function renderSingleDeviceConnection({
  status,
  selectedName,
  selectedNode,
  stateNode,
  copyNode,
  type
}) {
  if (!stateNode || !selectedNode || !copyNode) {
    return;
  }

  const resolvedSelectedName = resolveSelectedDeviceName(status, selectedName);
  const derivedState = status?.state
    || (status?.connected
      ? "connected"
      : resolvedSelectedName
        ? "discovered"
        : "unselected");
  selectedNode.textContent =
    resolvedSelectedName || (currentLocale === "zh" ? "未选择" : "None");
  stateNode.textContent = humanizeDeviceConnectionState(derivedState);

  const lastSeenCopy =
    status?.last_seen_s !== null && status?.last_seen_s !== undefined
      ? currentLocale === "zh"
        ? `${status.last_seen_s}s 前有活动`
        : `Seen ${status.last_seen_s}s ago`
      : currentLocale === "zh"
        ? "还没有收到实时数据"
        : "No live data yet";

  const errorCopy = status?.last_error
    ? currentLocale === "zh"
      ? `最近错误：${status.last_error}`
      : `Latest error: ${status.last_error}`
    : "";

  copyNode.textContent = [lastSeenCopy, errorCopy].filter(Boolean).join(" · ");

  if (type === "wristband") {
    wristbandRssi.textContent =
      status?.rssi !== null && status?.rssi !== undefined ? `${status.rssi} dBm` : "--";
    wristbandPresence.textContent =
      status?.is_at_desk === true
        ? currentLocale === "zh" ? "在位" : "At desk"
        : status?.is_at_desk === false
          ? currentLocale === "zh" ? "离位" : "Away"
          : "--";
    const liveHrv = Number(currentState?.metrics?.hrv);
    wristbandHrv.textContent =
      Number.isFinite(liveHrv) && liveHrv > 0
        ? `${Math.round(liveHrv)}`
        : status?.hrv !== null && status?.hrv !== undefined
          ? `${Math.round(status.hrv)}`
          : "--";
    return;
  }

  squeezeOnlineState.textContent =
    status?.connected
      ? currentLocale === "zh" ? "在线" : "Online"
      : currentLocale === "zh" ? "离线" : "Offline";
  const livePressureRaw = Number(currentState?.metrics?.pressureRaw);
  const hasLivePressure =
    Number.isFinite(livePressureRaw) &&
    (livePressureRaw > 0 || Boolean(status?.connected));
  const resolvedPressureRaw = hasLivePressure
    ? Math.round(clampNumber(livePressureRaw, 0, SQUEEZE_SENSOR_MAX))
    : status?.pressure_raw !== null && status?.pressure_raw !== undefined
      ? Math.round(status.pressure_raw)
      : null;
  squeezePressureRaw.textContent =
    resolvedPressureRaw !== null
      ? `${resolvedPressureRaw}`
      : "--";
}

function renderDeviceConnector() {
  if (!deviceScanList) {
    return;
  }

  renderDeviceScanList();

  if (deviceScanCopy) {
    deviceScanCopy.hidden = false;
    deviceScanCopy.textContent = buildDeviceConnectionSummary({
      locale: currentLocale,
      selected: deviceModuleState.selected,
      status: deviceModuleState.status || {}
    });
  }

  if (deviceScanFeedback) {
    const text = String(deviceModuleState.scanFeedback || "").trim();
    deviceScanFeedback.hidden = !text;
    deviceScanFeedback.textContent = text;
  }

  renderSingleDeviceConnection({
    status: deviceModuleState.status?.wristband,
    selectedName: deviceModuleState.selected.wristband,
    selectedNode: wristbandSelectedName,
    stateNode: wristbandConnectionState,
    copyNode: wristbandConnectionCopy,
    type: "wristband"
  });

  renderSingleDeviceConnection({
    status: deviceModuleState.status?.squeeze,
    selectedName: deviceModuleState.selected.squeeze,
    selectedNode: squeezeSelectedName,
    stateNode: squeezeConnectionState,
    copyNode: squeezeConnectionCopy,
    type: "squeeze"
  });

  if (deviceScanRefresh) {
    deviceScanRefresh.disabled = deviceModuleBusy;
    deviceScanRefresh.textContent = currentLocale === "zh" ? "刷新设备列表" : "Refresh device list";
  }

  if (deviceConnectSubmit) {
    const payload = buildDeviceConfigurePayload(deviceModuleState.selected);
    deviceConnectSubmit.disabled =
      deviceModuleBusy || (!payload.wristband && !payload.squeeze);
    deviceConnectSubmit.textContent = currentLocale === "zh" ? "连接" : "Connect";
  }

  if (deviceDisconnectAll) {
    const payload = buildDeviceConfigurePayload(deviceModuleState.selected);
    deviceDisconnectAll.disabled =
      deviceModuleBusy || (!payload.wristband && !payload.squeeze);
    deviceDisconnectAll.textContent =
      currentLocale === "zh" ? "断开连接" : "Disconnect";
  }
}

async function refreshDeviceStatus() {
  if (!window.rovia.getDevicesStatus) {
    return;
  }

  try {
    const [status, config] = await Promise.all([
      window.rovia.getDevicesStatus(),
      window.rovia.getDevicesConfig()
    ]);
    deviceModuleState.status = status;
    const backendSelection = buildDeviceConfigurePayload({
      wristband: config?.wristband || status?.wristband?.selected_name || "",
      squeeze: config?.squeeze || status?.squeeze?.selected_name || ""
    });
    deviceModuleState.selected = {
      wristband: deviceModuleState.selected.wristband || backendSelection.wristband,
      squeeze: deviceModuleState.selected.squeeze || backendSelection.squeeze
    };
    persistDeviceSelections();
  } catch (error) {
    deviceModuleState.scanFeedback =
      mapDeviceErrorMessage(error?.message, {
        locale: currentLocale,
        fallback:
          currentLocale === "zh" ? "获取设备状态失败。" : "Failed to load device status."
      });
  }
}

function withPromiseTimeout(promise, timeoutMs, errorFactory) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(errorFactory());
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function refreshDeviceScan({ timeout = 5 } = {}) {
  if (!window.rovia.scanDevices) {
    return;
  }

  deviceModuleBusy = true;
  renderDeviceConnector();

  try {
    const normalizedTimeout = Math.min(Math.max(Number(timeout) || 5, 2), 15);
    const scanTimeoutMs = Math.round((normalizedTimeout + 1) * 1000);
    const result = await withPromiseTimeout(
      window.rovia.scanDevices(normalizedTimeout),
      scanTimeoutMs,
      () =>
        new Error(
          currentLocale === "zh"
            ? "设备扫描超时，请检查蓝牙权限后重试。"
            : "Device scan timed out. Check Bluetooth permission and retry."
        )
    );
    deviceModuleState.scanResults = normalizeScanResults(result?.devices);
    deviceModuleState.scanLoaded = true;
    deviceModuleState.scanFeedback = "";
  } catch (error) {
    deviceModuleState.scanLoaded = true;
    deviceModuleState.scanFeedback = mapDeviceErrorMessage(error?.message, {
      locale: currentLocale,
      fallback: currentLocale === "zh" ? "扫描设备失败。" : "Failed to scan devices."
    });
  } finally {
    deviceModuleBusy = false;
    renderDeviceConnector();
  }
}

async function connectSelectedDevices() {
  if (!window.rovia.configureDevices) {
    return;
  }

  const payload = buildDeviceConfigurePayload(deviceModuleState.selected);
  if (!payload.wristband && !payload.squeeze) {
    deviceModuleState.scanFeedback =
      currentLocale === "zh"
        ? "未选择设备，当前不会主动连接蓝牙"
        : "No device selected, so Bluetooth connections will stay idle.";
    renderDeviceConnector();
    return;
  }

  deviceModuleBusy = true;
  deviceModuleState.scanFeedback =
    currentLocale === "zh" ? "已发送连接请求，正在同步设备状态..." : "Connection request sent, syncing device status...";
  renderDeviceConnector();

  try {
    deviceModuleState.selected = buildDeviceConfigurePayload(deviceModuleState.selected);
    persistDeviceSelections();
    await window.rovia.configureDevices(payload);
    await refreshDeviceStatus();
  } catch (error) {
    deviceModuleState.scanFeedback =
      error?.message || (currentLocale === "zh" ? "发送连接请求失败。" : "Failed to send connect request.");
  } finally {
    deviceModuleBusy = false;
    renderDeviceConnector();
  }
}

async function disconnectAllDevices() {
  if (!window.rovia.configureDevices) {
    return;
  }

  deviceModuleBusy = true;
  deviceModuleState.scanFeedback =
    currentLocale === "zh" ? "正在断开所有设备..." : "Disconnecting all devices...";
  renderDeviceConnector();
  try {
    await window.rovia.configureDevices({
      wristband: "",
      squeeze: ""
    });
    deviceModuleState.scanFeedback =
      currentLocale === "zh" ? "已断开所有设备连接。" : "All device connections are disconnected.";
    await refreshDeviceStatus();
  } catch (error) {
    deviceModuleState.scanFeedback =
      error?.message || (currentLocale === "zh" ? "断开设备失败。" : "Failed to disconnect devices.");
  } finally {
    deviceModuleBusy = false;
    renderDeviceConnector();
  }
}

function startDeviceStatusPolling() {
  clearInterval(deviceStatusPollTimer);
  if (activeTab !== "device") {
    return;
  }

  deviceStatusPollTimer = setInterval(() => {
    refreshDeviceStatus().then(() => {
      renderDeviceConnector();
    });
  }, DEVICE_STATUS_POLL_MS);
}

function renderDeviceMetrics(metrics) {
  if (!physioMetrics) {
    return;
  }

  const entries = buildDeviceMetricEntries(metrics, {
    locale: currentLocale
  });

  physioMetrics.innerHTML = "";
  entries.forEach((entry) => {
    const pill = document.createElement("span");
    pill.className = "device-metric-pill";

    const label = document.createElement("span");
    label.className = "device-metric-label";
    label.textContent = entry.label;

    const value = document.createElement("strong");
    value.className = "device-metric-value";
    value.textContent = entry.value;

    pill.append(label, value);
    physioMetrics.appendChild(pill);
  });
}

function renderKpiValue(node, value, unit = "") {
  if (!node) {
    return;
  }

  node.innerHTML = "";

  const number = document.createElement("span");
  number.className = "focus-kpi-number";
  number.textContent = String(value);
  node.appendChild(number);

  if (!unit) {
    return;
  }

  const unitNode = document.createElement("span");
  unitNode.className = "focus-kpi-unit";
  unitNode.textContent = unit;
  node.appendChild(unitNode);
}

function renderKpiMeta(node, items, { note = false } = {}) {
  if (!node) {
    return;
  }

  node.innerHTML = "";
  node.classList.toggle("is-note", Boolean(note));

  if (note) {
    node.textContent = items[0] || "";
    return;
  }

  items.filter(Boolean).forEach((text) => {
    const pill = document.createElement("span");
    pill.className = "focus-kpi-pill";
    pill.textContent = text;
    node.appendChild(pill);
  });
}

function renderProfile(state) {
  if (!profileRuntime || !profileMainTag || !profileBio) {
    return;
  }

  const tagStats = calculateTagStats(state.todos || []);
  const mainTagEntry =
    Object.entries(tagStats).sort((left, right) => right[1] - left[1])[0] || null;
  const mainTag = mainTagEntry ? normalizeTodoTag(mainTagEntry[0]) : "general";

  profileRuntime.textContent = humanizeRuntime(state.runtimeStatus, state.emotion);
  profileMainTag.textContent = humanizeTodoTag(mainTag);
  if (state.auth?.mode === "demo") {
    profileBio.textContent = t("account.profileBioDemo");
    return;
  }

  profileBio.textContent = state.connection.supabase || state.connection.backend
    ? t("account.profileBioConnected")
    : t("account.profileBioLocal");
}

function renderWristbandFocusTrigger() {
  if (!wristbandFocusTriggerToggle) {
    return;
  }
  const enabled = Boolean(currentState?.settings?.wristbandFocusTrigger);
  wristbandFocusTriggerToggle.textContent = enabled ? "已开启" : "已关闭";
  wristbandFocusTriggerToggle.dataset.active = String(enabled);
}

function renderCameraState() {
  if (!cameraStatus || !cameraStart || !cameraStop || !cameraCopy) {
    return;
  }

  const desiredEnabled = Boolean(currentState?.settings?.cameraEnabled);
  cameraState = desiredEnabled ? "live" : "idle";
  cameraStatus.textContent =
    currentLocale === "zh"
      ? desiredEnabled
        ? "已开启"
        : "已关闭"
      : desiredEnabled
        ? "live"
        : "off";
  cameraStart.disabled = cameraBusy || desiredEnabled;
  cameraStop.disabled = cameraBusy || !desiredEnabled;
  cameraStart.textContent = currentLocale === "zh" ? "打开摄像头" : "Start camera";
  cameraStop.textContent = currentLocale === "zh" ? "关闭摄像头" : "Stop camera";
  cameraCopy.textContent =
    currentLocale === "zh"
      ? desiredEnabled
        ? "摄像头画面会显示在 Rovia 上方的小窗口中，可在小窗右上角点击折叠。"
        : "打开摄像头后，会在 Rovia 上方的小窗口显示实时画面。"
      : desiredEnabled
        ? "The camera feed is shown in the small window above Rovia and can be collapsed there."
        : "Turn on the camera to show the feed in a small window above Rovia.";
}

function syncCameraPreference(state) {
  currentState = state;
  renderCameraState();
}

async function startCamera({ force = false } = {}) {
  if (cameraBusy || (!force && currentState?.settings?.cameraEnabled)) {
    return;
  }
  cameraBusy = true;

  try {
    await window.rovia.setCameraEnabled(true);
  } finally {
    cameraBusy = false;
    renderCameraState();
  }
}

function stopCamera() {
  cameraState = "idle";
  renderCameraState();
}

function renderRecentSessions(state) {
  recentSessionsList.innerHTML = "";

  const sessions = state.remoteData?.recentFocusSessions || [];
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "card-subtle";
    empty.textContent = state.connection.supabase || state.connection.backend
      ? t("focus.noRecentCloudSessions")
      : t("focus.noRecentSessions");
    recentSessionsList.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("article");
    item.className = "session-item";

    const titleRow = document.createElement("div");
    titleRow.className = "session-title-row";

    const title = document.createElement("div");
    title.className = "session-item-title";
    title.textContent = session.taskTitle || t("focus.noTask");

    const pill = document.createElement("span");
    pill.className = "session-item-pill";
    pill.textContent = humanizeFocusStatus(session.status);

    titleRow.append(title, pill);

    const metaRow = document.createElement("div");
    metaRow.className = "session-meta-row";

    const leftMeta = document.createElement("p");
    leftMeta.className = "session-item-copy";
    leftMeta.textContent = `${Math.round((session.durationSec || 0) / 60)} ${
      currentLocale === "zh" ? "分钟" : "min"
    } / ${humanizeTrigger(session.triggerSource)}`;

    const rightMeta = document.createElement("p");
    rightMeta.className = "session-item-copy";
    rightMeta.textContent = formatRelativeTime(
      session.updatedAt || session.endedAt || session.startedAt
    );

    metaRow.append(leftMeta, rightMeta);
    item.append(titleRow, metaRow);
    recentSessionsList.appendChild(item);
  }
}

function renderSqueeze(state) {
  const squeeze = state.squeeze || {};
  const timeline = squeeze.timeline || [];
  const currentPressure = getSqueezePressureRaw(state.metrics);
  const pressurePercent = getSqueezePressurePercent(state.metrics);
  const lastPulseAt = squeeze.lastPulseAt;
  const regulation = resolveSqueezeRegulationState(squeeze, pressurePercent);
  const regulationKey = resolveSqueezeRegulationKey(squeeze, pressurePercent);
  const frequencyRatio = clampNumber((squeeze.ratePerMinute || 0) / 10, 0, 1);

  if (squeezeHeroCard) {
    squeezeHeroCard.dataset.regulation = regulationKey;
  }
  if (squeezeVisualStage) {
    squeezeVisualStage.dataset.regulation = regulationKey;
    squeezeVisualStage.style.setProperty("--pressure-ratio", String(pressurePercent / 100));
    squeezeVisualStage.style.setProperty("--frequency-ratio", String(frequencyRatio));
  }
  if (squeezeRangeFill) {
    squeezeRangeFill.style.width = `${Math.max(0, pressurePercent)}%`;
  }

  squeezeRegulationPill.textContent = regulation;
  squeezeLiveLevel.textContent = humanizeSqueezeLevel(state.metrics?.pressureLevel || "idle");
  squeezeLivePressure.textContent = String(currentPressure);
  if (squeezeLivePressureMeta) {
    squeezeLivePressureMeta.textContent = `${currentPressure} / ${SQUEEZE_SENSOR_MAX}`;
  }
  if (squeezeLivePercent) {
    squeezeLivePercent.textContent = `${pressurePercent}%`;
  }
  if (squeezeLivePercentMeta) {
    squeezeLivePercentMeta.textContent =
      currentLocale === "zh" ? `映射后 ${pressurePercent}%` : `Mapped ${pressurePercent}%`;
  }
  if (squeezeLiveRate) {
    squeezeLiveRate.textContent = String(squeeze.ratePerMinute || 0);
  }
  squeezeGuidance.textContent = getSqueezeGuidance(state);

  squeezeCountMinute.textContent = String(squeeze.pulseCount1m || 0);
  squeezeCountMinuteMeta.textContent =
    currentLocale === "zh"
      ? `${squeeze.ratePerMinute || 0} 次 / 分钟 · ${pressurePercent}%`
      : `${squeeze.ratePerMinute || 0} / min`;

  squeezeCountFive.textContent = String(squeeze.pulseCount5m || 0);
  squeezeCountFiveMeta.textContent =
    squeeze.averageIntervalSec !== null && squeeze.averageIntervalSec !== undefined
      ? currentLocale === "zh"
        ? `平均间隔 ${squeeze.averageIntervalSec}s`
        : `Avg gap ${squeeze.averageIntervalSec}s`
      : currentLocale === "zh"
        ? "还在等待更多样本"
        : "Waiting for more samples";

  squeezeLastSeen.textContent = lastPulseAt ? formatRelativeTime(lastPulseAt) : "--";
  squeezeLastSeenMeta.textContent = lastPulseAt
    ? formatSensorTime(lastPulseAt)
    : currentLocale === "zh"
      ? "暂无脉冲"
      : "No pulse yet";

  squeezeTimelineChart.innerHTML = "";
  const maxCount = Math.max(1, ...timeline.map((bucket) => bucket.count || 0));
  timeline.forEach((bucket, index) => {
    const column = document.createElement("div");
    column.className = "squeeze-bar";

    const fill = document.createElement("div");
    fill.className = "squeeze-bar-fill";
    fill.style.height = `${Math.max(8, ((bucket.count || 0) / maxCount) * 108)}px`;
    fill.style.opacity = `${0.28 + ((bucket.count || 0) / maxCount) * 0.72}`;
    fill.style.filter = `saturate(${1 + frequencyRatio * 0.55})`;
    fill.title =
      currentLocale === "zh"
        ? `${bucket.count || 0} 次`
        : `${bucket.count || 0} pulses`;

    const label = document.createElement("div");
    label.className = "squeeze-bar-label";
    label.textContent =
      index === timeline.length - 1
        ? currentLocale === "zh"
          ? "现在"
          : "now"
        : `-${timeline.length - 1 - index}m`;

    column.append(fill, label);
    squeezeTimelineChart.appendChild(column);
  });

  squeezePatternCopy.textContent =
    regulationKey === "intense"
      ? currentLocale === "zh"
        ? "最近捏捏频率明显升高，比较符合 ADHD 产品里“先自我调节，再被桌宠温和接住”的使用场景。"
        : "Squeeze activity is rising, which fits the ADHD use case where self-regulation happens first and the desktop pet gently responds."
      : regulationKey === "active"
        ? currentLocale === "zh"
          ? "这段频率更像是在维持节奏，适合配合 Todo 和 20 分钟专注周期一起看。"
          : "This pattern looks more like rhythm maintenance, which pairs well with Todo and a 20-minute focus cycle."
        : currentLocale === "zh"
          ? "当前捏捏频率偏低，说明环境相对平静，适合继续保持轻压力状态。"
          : "Current squeeze frequency is low, suggesting a calmer environment that supports lower-pressure focus.";
}

function renderAuth(state) {
  const auth = state.auth || {};
  const syncActive = Boolean(state.connection?.supabase || state.connection?.backend);
  const view = buildAuthViewModel({
    auth,
    syncActive,
    authMode,
    authFeedback
  });

  authTitle.textContent =
    view.variant === "demo"
      ? auth.email || "Rovia Demo"
      : view.variant === "session"
        ? auth.email || t("account.signedIn")
        : view.titleKey
          ? t(view.titleKey)
          : t("account.authTitle");
  authMeta.textContent =
    authFeedback || view.metaText || (view.metaKey ? t(view.metaKey, view.metaValues || {}) : "");

  authForm.hidden = !view.showForm;
  authUserActions.hidden = !view.showUserActions;

  authModeLogin.classList.toggle("is-active", view.formMode === "login");
  authModeRegister.classList.toggle("is-active", view.formMode === "register");
  authModeLogin.disabled = authBusy;
  authModeRegister.disabled = authBusy;

  authConfirmField.hidden = !view.showConfirm;
  authEmail.disabled = authBusy;
  authPassword.disabled = authBusy;
  authPassword.setAttribute(
    "autocomplete",
    view.formMode === "register" ? "new-password" : "current-password"
  );
  authConfirmPassword.disabled = authBusy;
  authSubmit.disabled = authBusy;
  authDemo.disabled = authBusy;
  authSubmit.textContent =
    authBusyAction === view.submitAction
      ? t(view.submitAction === "sign-up" ? "auth.signingUp" : "auth.signingIn")
      : t(view.submitLabelKey);
  authDemo.textContent = authBusyAction === "demo" ? t("auth.loadingDemo") : t("account.demo");

  if (!view.showUserActions) {
    return;
  }

  authEmailPill.textContent = view.currentAccountEmail
    ? t("account.currentAccount", { email: view.currentAccountEmail })
    : view.userCopyKey
      ? t(view.userCopyKey)
      : t("account.signedIn");
  signOutButton.textContent =
    authBusyAction === view.signOutAction ? t("auth.signingOut") : t("account.signOut");
  signOutButton.disabled = authBusy;
}

function render(state) {
  currentState = state;

  const completedTodos = state.todos.filter((todo) => todo.status === "done").length;
  const totalTodos = state.todos.length;
  const openTodos = totalTodos - completedTodos;
  const activeTags = collectActiveTags(state);
  const now = new Date();
  const todayStats = buildTodayFocusStats(state);
  const primarySignal = buildPrimarySignal(state.metrics, {
    locale: currentLocale
  });
  const latestSyncedSession =
    state.lastCompletedSession || state.remoteData?.latestFocusSession || null;

  panelDate.textContent = formatPanelDate(now);
  panelGreeting.textContent = getGreeting(now);
  panelFrame.dataset.runtime = state.runtimeStatus.toLowerCase();

  runtimeStatus.textContent = t(`runtime.${state.runtimeStatus}`);
  currentTaskTitle.textContent =
    state.focusSession?.taskTitle || state.activeTodo?.title || t("focus.noTask");
  cueText.textContent = state.lastCue?.label || getFocusSummary(state);

  focusTime.textContent = state.focusSession ? formatTime(state.focusSession.remainingSec) : "--:--";
  focusTrigger.textContent = state.focusSession
    ? humanizeTrigger(state.focusSession.triggerSource)
    : latestSyncedSession
      ? humanizeTrigger(latestSyncedSession.triggerSource)
      : t("focus.waiting");
  focusSummary.textContent = getFocusSummary(state);

  physioState.textContent = humanizePhysio(state.metrics.physioState);
  renderDeviceMetrics(state.metrics);
  presenceState.textContent = humanizePresence(state.metrics.presenceState);
  sensorTime.textContent = formatSensorTime(state.metrics.lastSensorAt);

  syncMode.textContent = humanizeSyncMode(state.syncMode);
  deviceSyncMode.textContent = humanizeSyncMode(state.syncMode);
  renderKpiValue(focusSyncMode, primarySignal.value, primarySignal.unit);
  todoSyncModeCopy.textContent = humanizeSyncMode(state.syncMode);
  soundToggle.textContent =
    currentLocale === "zh"
      ? state.settings.soundEnabled
        ? "声音开"
        : "声音关"
      : state.settings.soundEnabled
        ? "Sound on"
        : "Sound off";

  latestSessionTitle.textContent = latestSyncedSession
    ? latestSyncedSession.taskTitle
    : t("focus.noSyncedRounds");
  latestSessionMeta.textContent = latestSyncedSession
    ? `${humanizeFocusStatus(latestSyncedSession.status)} · ${formatRelativeTime(
        latestSyncedSession.updatedAt ||
          latestSyncedSession.endedAt ||
          latestSyncedSession.startedAt
      )}`
    : t("focus.waiting");

  renderKpiValue(
    todoProgressTitle,
    todayStats.totalSessions,
    currentLocale === "zh" ? "轮" : "rds"
  );
  renderKpiMeta(
    todoProgressMeta,
    todayStats.totalSessions
      ? [
          currentLocale === "zh"
            ? `完成 ${todayStats.completedSessions}`
            : `Done ${todayStats.completedSessions}`,
          currentLocale === "zh"
            ? `中断 ${todayStats.interruptedSessions}`
            : `Paused ${todayStats.interruptedSessions}`
        ]
      : [t("focus.dailyRoundsMetaEmpty")],
    { note: !todayStats.totalSessions }
  );

  renderKpiValue(focusTotalMinutes, todayStats.totalMinutes, "m");
  renderKpiMeta(
    focusTotalMeta,
    todayStats.totalSessions
      ? [
          currentLocale === "zh"
            ? `平均 ${todayStats.averageMinutes} 分/轮`
            : `Avg ${todayStats.averageMinutes} min`
        ]
      : [t("focus.dailyMinutesMetaEmpty")],
    { note: true }
  );
  focusCompletedCount.textContent = humanizePhysio(state.metrics.physioState);
  focusInterruptedCount.textContent =
    state.metrics.presenceState === "near" ? t("states.atDesk") : t("states.awayDesk");

  renderKpiMeta(focusDataHint, primarySignal.meta, {
    note: false
  });

  todoOpenCount.textContent = String(openTodos);
  todoDoneCount.textContent = String(completedTodos);

  todoPageCurrentTitle.textContent = state.activeTodo?.title || t("focus.noTask");
  todoPageCurrentMeta.textContent = state.focusSession
    ? t("todo.currentMetaFocusing")
    : state.activeTodo
      ? t("todo.currentMetaActive")
      : t("todo.currentMetaIdle");
  todoCurrentEcho.textContent = totalTodos
    ? humanizeTodoTag(state.activeTodo?.tag || activeTags[0] || "general")
    : "--";

  todoSummaryNote.textContent = totalTodos
    ? t("todo.summaryTag", {
        tag: humanizeTodoTag(activeTags[0] || state.activeTodo?.tag || "general")
      })
    : t("todo.summaryNoteEmpty");

  startDesktop.disabled = Boolean(state.focusSession);
  startWearable.disabled = Boolean(state.focusSession);
  endFocus.disabled = !state.focusSession;

  renderAuth(state);
  renderFocusWeekChart(state);
  renderRecentSessions(state);
  renderSqueeze(state);
  renderTodos(state);
  renderFriendList(state);
  renderProfile(state);
  syncCameraPreference(state);
  renderCameraState();
  renderWristbandFocusTrigger();
  renderDeviceConnector();
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    openPanelTab(button.dataset.tab);
  });
});

if (localeToggle) {
  localeToggle.addEventListener("click", () => {});
}

if (profileButton) {
  profileButton.addEventListener("click", () => {
    openPanelTab("focus");
  });
}

document.querySelectorAll("[data-physio]").forEach((button) => {
  button.addEventListener("click", () => {
    const physio = button.dataset.physio;
    const presets = {
      ready: { physioState: "ready", hrv: 52, stressScore: 22 },
      strained: { physioState: "strained", hrv: 26, stressScore: 86 },
      unknown: { physioState: "unknown", hrv: 0, stressScore: 0 }
    };
    window.rovia.setPhysioState(presets[physio]);
  });
});

document.querySelectorAll("[data-presence]").forEach((button) => {
  button.addEventListener("click", () => {
    window.rovia.setPresenceState(button.dataset.presence);
  });
});

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const draft = validateAuthDraft({
      mode: authMode,
      email: authEmail.value,
      password: authPassword.value,
      confirmPassword: authConfirmPassword?.value || ""
    });

    if (!draft.ok) {
      authFeedback = getAuthValidationFeedback(draft.reason);
      if (currentState) {
        render(currentState);
      }
      return;
    }

    authBusy = true;
    authBusyAction = draft.mode === "register" ? "sign-up" : "sign-in";
    authFeedback = "";
    if (currentState) {
      render(currentState);
    }

    try {
      if (draft.mode === "register") {
        const result = await window.rovia.signUp(draft.email, draft.password);
        authPassword.value = "";
        authConfirmPassword.value = "";

        if (result?.alreadyRegistered) {
          authFeedback = t("auth.alreadyRegistered");
          setAuthMode("login");
        } else if (result?.needsEmailConfirmation) {
          authFeedback = t("auth.needsEmailConfirmation");
        } else {
          authFeedback = t("auth.signUpSuccess");
        }
      } else {
        await window.rovia.signIn(draft.email, draft.password);
        authFeedback = t("auth.signInSuccess");
      }

      authPassword.value = "";
      authConfirmPassword.value = "";
    } catch (error) {
      authFeedback = mapAuthErrorMessage(error?.message, {
        locale: currentLocale,
        fallback: t(draft.mode === "register" ? "auth.signUpFailed" : "auth.signInFailed")
      });
    } finally {
      authBusy = false;
      authBusyAction = null;
      if (currentState) {
        render(currentState);
      }
    }
  });
}

if (authModeLogin) {
  authModeLogin.addEventListener("click", () => {
    setAuthMode("login", { clearFeedback: true });
  });
}

if (authModeRegister) {
  authModeRegister.addEventListener("click", () => {
    setAuthMode("register", { clearFeedback: true });
  });
}

if (authDemo) {
  authDemo.addEventListener("click", async () => {
    authBusy = true;
    authBusyAction = "demo";
    authFeedback = "";
    if (currentState) {
      render(currentState);
    }

    try {
      await window.rovia.enterDemoMode();
      authPassword.value = "";
      authConfirmPassword.value = "";
      authFeedback = "";
    } catch (error) {
      authFeedback = mapAuthErrorMessage(error?.message, {
        locale: currentLocale,
        fallback: t("auth.demoFailed")
      });
    } finally {
      authBusy = false;
      authBusyAction = null;
      if (currentState) {
        render(currentState);
      }
    }
  });
}

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    authBusy = true;
    authBusyAction = currentState?.auth?.mode === "demo" ? "exit-demo" : "sign-out";
    authFeedback = "";
    if (currentState) {
      render(currentState);
    }

    try {
      if (currentState?.auth?.mode === "demo") {
        await window.rovia.exitDemoMode();
        authFeedback = t("auth.exitDemoSuccess");
      } else {
        await window.rovia.signOut();
        authFeedback = t("auth.signOutSuccess");
      }
      authPassword.value = "";
      authConfirmPassword.value = "";
    } catch (error) {
      authFeedback = mapAuthErrorMessage(error?.message, {
        locale: currentLocale,
        fallback:
          currentState?.auth?.mode === "demo"
            ? t("auth.exitDemoFailed")
            : t("auth.signOutFailed")
      });
    } finally {
      authBusy = false;
      authBusyAction = null;
      if (currentState) {
        render(currentState);
      }
    }
  });
}

startDesktop.addEventListener("click", () => {
  window.rovia.startFocus("desktop");
});

startWearable.addEventListener("click", () => {
  window.rovia.startFocus("wearable");
});

endFocus.addEventListener("click", () => {
  window.rovia.endFocus();
});

soundToggle.addEventListener("click", () => {
  window.rovia.toggleSound();
});

if (cameraStart) {
  cameraStart.addEventListener("click", async () => {
    await startCamera({ force: true });
  });
}

if (cameraStop) {
  cameraStop.addEventListener("click", async () => {
    await window.rovia.setCameraEnabled(false);
    stopCamera();
  });
}

if (wristbandFocusTriggerToggle) {
  wristbandFocusTriggerToggle.addEventListener("click", () => {
    const next = !Boolean(currentState?.settings?.wristbandFocusTrigger);
    window.rovia.setWristbandFocusTrigger(next);
  });
}

if (deviceScanRefresh) {
  deviceScanRefresh.addEventListener("click", async () => {
    await refreshDeviceScan({ timeout: 5 });
    await refreshDeviceStatus();
    renderDeviceConnector();
  });
}

if (deviceConnectSubmit) {
  deviceConnectSubmit.addEventListener("click", async () => {
    await connectSelectedDevices();
  });
}

if (deviceDisconnectAll) {
  deviceDisconnectAll.addEventListener("click", async () => {
    await disconnectAllDevices();
  });
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = todoInput.value.trim();
  if (!title) {
    return;
  }

  const scheduledAt = buildScheduledAt(todoDate?.value, todoTime?.value);

  window.rovia.createTodo({
    title,
    tag: todoTag?.value || "general",
    scheduledAt
  });
  todoInput.value = "";
  const nextSchedule = getDefaultTodoScheduleInput();
  if (todoDate) {
    todoDate.value = nextSchedule.date;
  }
  if (todoTime) {
    todoTime.value = nextSchedule.time;
  }
  if (todoTag) {
    todoTag.value = "general";
  }
});

quitButton.addEventListener("click", () => {
  window.rovia.togglePanel();
});

if (accountQuitButton) {
  accountQuitButton.addEventListener("click", () => {
    requestQuitFromPanel();
  });
}

window.rovia.getState().then((state) => {
  const nextSchedule = getDefaultTodoScheduleInput();
  if (todoDate && !todoDate.value) {
    todoDate.value = nextSchedule.date;
  }
  if (todoTime && !todoTime.value) {
    todoTime.value = nextSchedule.time;
  }
  applyStaticCopy();
  openPanelTab(activeTab);
  render(state);
  refreshDeviceStatus().then(() => {
    renderDeviceConnector();
  });
});

window.rovia.onLocaleChange((locale) => {
  currentLocale = locale === "en" ? "en" : "zh";
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale);
  } catch (error) {
    // ignore storage write failures in embedded webviews
  }
  applyStaticCopy();
  if (currentState) {
    render(currentState);
  }
});

window.rovia.onOpenPanelTab((tab) => {
  openPanelTab(tab);
});

window.rovia.onStateUpdate((state) => {
  render(state);
});

window.addEventListener("beforeunload", () => {
  clearInterval(deviceStatusPollTimer);
  stopCamera();
});
