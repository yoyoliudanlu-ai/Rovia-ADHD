const path = require("path");
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  session,
  Menu,
  Tray,
  nativeImage
} = require("electron");
const dotenv = require("dotenv");

const { JsonStorage } = require("./storage");
const { SupabaseService } = require("./supabase-service");
const { RoviaStateManager } = require("./state-manager");
const { SidecarClient } = require("./sidecar-client");
const { BackendEventAdapter } = require("./backend-adapter");
const { requestBackendShutdown } = require("./backend-shutdown");
const {
  BackendHttpClient,
  deriveBackendBaseUrl
} = require("./backend-http-client");

dotenv.config();
app.commandLine.appendSwitch("disable-http-cache");

let petWindow = null;
let panelWindow = null;
let stateManager = null;
let sidecarClient = null;
let statusTray = null;
let isQuitting = false;
let pendingPanelTab = null;
let currentLocale = "zh";
const backendEventAdapter = new BackendEventAdapter();
let quitIntercepted = false;
let cleanupCompleted = false;

const VISIBLE_PANEL_TABS = [
  { id: "focus", label: "专注" },
  { id: "todo", label: "任务" },
  { id: "friend", label: "好友" }
];
const HIDDEN_PANEL_TABS = [
  { id: "squeeze", label: "捏捏" },
  { id: "device", label: "设备" },
  { id: "account", label: "账号" }
];
const PANEL_TABS = [...VISIBLE_PANEL_TABS, ...HIDDEN_PANEL_TABS];

function createStatusBarIcon() {
  const svg = `
    <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="black"
        d="M11 2.8c2.1 0 3.67.37 4.83 1.03 1.15.65 1.96 1.65 2.49 2.7.54 1.06.8 2.3.8 3.72 0 1.74-.34 3.18-1.04 4.35a6.61 6.61 0 0 1-2.85 2.62c-1.2.57-2.62.86-4.23.86-1.61 0-3.03-.29-4.23-.86a6.61 6.61 0 0 1-2.85-2.62c-.7-1.17-1.04-2.61-1.04-4.35 0-1.41.26-2.66.8-3.72.53-1.05 1.34-2.05 2.49-2.7 1.16-.66 2.73-1.03 4.83-1.03Z"
      />
    </svg>
  `.trim();
  const icon = nativeImage
    .createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    )
    .resize({ width: 16, height: 16 });

  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  return icon;
}

function getRuntimeCopy(state) {
  const map = {
    Disconnected: "离线",
    Idle: "待机",
    Ready: "可开始",
    Support: "需要支持",
    Focusing: "专注中",
    Away: "暂时离开",
    Completed: "已完成"
  };

  return map[state?.runtimeStatus] || "Rovia";
}

function configureMediaPermissions() {
  const mediaSession = session.defaultSession;

  mediaSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media" || permission === "camera";
  });

  mediaSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      if (permission === "media" || permission === "camera") {
        const mediaTypes = details?.mediaTypes || [];
        callback(mediaTypes.length === 0 || mediaTypes.includes("video"));
        return;
      }

      callback(false);
    }
  );
}

function snapPetWindowToCorner() {
  if (!petWindow) {
    return;
  }

  const bounds = petWindow.getBounds();
  const display =
    petWindow && !petWindow.isDestroyed()
      ? screen.getDisplayMatching(bounds)
      : screen.getPrimaryDisplay();
  const area = display.workArea;

  const x = area.x + area.width - bounds.width - 22;
  const y = area.y + area.height - bounds.height - 22;
  petWindow.setPosition(Math.round(x), Math.round(y), false);

  if (panelWindow && panelWindow.isVisible()) {
    positionPanelWindow();
  }
}

function sendPanelTab(tab) {
  if (!panelWindow || panelWindow.isDestroyed() || !tab) {
    return;
  }

  const isKnownTab = PANEL_TABS.some((item) => item.id === tab);
  if (!isKnownTab) {
    return;
  }

  if (panelWindow.webContents.isLoadingMainFrame()) {
    pendingPanelTab = tab;
    return;
  }

  panelWindow.webContents.send("rovia:open-panel-tab", tab);
}

function broadcastLocale(locale) {
  currentLocale = locale === "en" ? "en" : "zh";

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("rovia:locale", currentLocale);
  }

  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send("rovia:locale", currentLocale);
  }
}

function updateStatusTray(state = null) {
  if (!statusTray) {
    return;
  }

  const snapshot = state || stateManager?.getPublicState?.();
  if (!snapshot) {
    return;
  }

  const taskTitle =
    snapshot.focusSession?.taskTitle || snapshot.activeTodo?.title || "暂无当前任务";
  const panelToggleLabel = snapshot.panelOpen ? "收起面板" : "打开面板";
  const focusActionLabel = snapshot.focusSession ? "结束当前专注" : "开始 20 分钟专注";
  const soundToggleLabel = snapshot.settings?.soundEnabled ? "关闭声音" : "打开声音";
  const cameraToggleLabel = snapshot.settings?.cameraEnabled ? "关闭摄像头" : "打开摄像头";
  const runtimeCopy = getRuntimeCopy(snapshot);

  statusTray.setToolTip(`Rovia · ${runtimeCopy}`);
  statusTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `状态：${runtimeCopy}`,
        enabled: false
      },
      {
        label: `任务：${taskTitle}`,
        enabled: false
      },
      { type: "separator" },
      {
        label: panelToggleLabel,
        click: () => {
          togglePanel();
        }
      },
      {
        label: "打开面板页",
        submenu: VISIBLE_PANEL_TABS.map((item) => ({
          label: item.label,
          click: () => {
            showPanel(item.id);
          }
        }))
      },
      {
        label: "更多查看",
        submenu: [
          {
            label: "语言",
            submenu: [
              {
                label: "中文",
                type: "radio",
                checked: currentLocale === "zh",
                click: () => {
                  broadcastLocale("zh");
                  updateStatusTray();
                }
              },
              {
                label: "English",
                type: "radio",
                checked: currentLocale === "en",
                click: () => {
                  broadcastLocale("en");
                  updateStatusTray();
                }
              }
            ]
          },
          ...HIDDEN_PANEL_TABS.map((item) => ({
            label: item.label,
            click: () => {
              showPanel(item.id);
            }
          }))
        ]
      },
      { type: "separator" },
      {
        label: focusActionLabel,
        click: async () => {
          if (stateManager.getPublicState().focusSession) {
            await stateManager.endFocusEarly();
            return;
          }

          await stateManager.startFocus({ triggerSource: "desktop" });
        }
      },
      {
        label: soundToggleLabel,
        click: async () => {
          await stateManager.toggleSound();
        }
      },
      {
        label: cameraToggleLabel,
        click: async () => {
          const nextEnabled = !stateManager.getPublicState().settings.cameraEnabled;
          await stateManager.setCameraEnabled(nextEnabled);
        }
      },
      {
        label: "桌宠归位",
        click: () => {
          snapPetWindowToCorner();
        }
      },
      { type: "separator" },
      {
        label: "退出 Rovia",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function cleanupRuntime() {
  if (cleanupCompleted) {
    return;
  }

  cleanupCompleted = true;
  if (stateManager) {
    stateManager.destroy();
  }
  if (sidecarClient) {
    sidecarClient.destroy();
  }
  if (statusTray) {
    statusTray.destroy();
    statusTray = null;
  }
}

function createStatusTray() {
  if (statusTray) {
    return;
  }

  const icon = createStatusBarIcon();
  statusTray = new Tray(icon);

  if (process.platform === "darwin") {
    statusTray.setIgnoreDoubleClickEvents(true);
    statusTray.setImage(icon);
    statusTray.setPressedImage(icon);
    statusTray.setTitle("R");
  }

  statusTray.on("click", () => {
    togglePanel();
  });
  updateStatusTray();
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 236,
    height: 338,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  petWindow.loadFile(path.join(__dirname, "..", "renderer", "pet.html"), {
    query: {
      v: "20260405-11"
    }
  });
  petWindow.webContents.on("did-finish-load", () => {
    petWindow.webContents.send("rovia:locale", currentLocale);
  });
  petWindow.once("ready-to-show", () => {
    snapPetWindowToCorner();
  });

  petWindow.on("move", () => {
    if (panelWindow && panelWindow.isVisible()) {
      positionPanelWindow();
    }
  });

  petWindow.on("closed", () => {
    petWindow = null;
  });
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 436,
    height: 760,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  panelWindow.setAlwaysOnTop(true, "floating");
  panelWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  panelWindow.loadFile(path.join(__dirname, "..", "renderer", "panel.html"), {
    query: {
      v: "20260405-20"
    }
  });

  panelWindow.webContents.on("did-finish-load", () => {
    panelWindow.webContents.send("rovia:locale", currentLocale);
    if (!pendingPanelTab) {
      return;
    }

    const nextTab = pendingPanelTab;
    pendingPanelTab = null;
    sendPanelTab(nextTab);
  });

  panelWindow.on("blur", () => {
    if (!isQuitting) {
      hidePanel();
    }
  });

  panelWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hidePanel();
    }
  });
}

function positionPanelWindow() {
  if (!petWindow || !panelWindow) {
    return;
  }

  const petBounds = petWindow.getBounds();
  const panelBounds = panelWindow.getBounds();
  const display = screen.getDisplayMatching(petBounds);
  const area = display.workArea;

  let x = petBounds.x + petBounds.width + 16;
  const y = Math.min(
    Math.max(area.y + 20, petBounds.y - 24),
    area.y + area.height - panelBounds.height - 20
  );

  if (x + panelBounds.width > area.x + area.width - 20) {
    x = petBounds.x - panelBounds.width - 16;
  }

  x = Math.max(area.x + 20, x);
  panelWindow.setPosition(Math.round(x), Math.round(y), false);
}

function showPanel(targetTab = null) {
  if (!panelWindow) {
    return;
  }

  positionPanelWindow();
  panelWindow.show();
  if (targetTab) {
    sendPanelTab(targetTab);
  }
  panelWindow.focus();
  stateManager.setPanelOpen(true);
}

function hidePanel() {
  if (!panelWindow) {
    return;
  }

  panelWindow.hide();
  stateManager.setPanelOpen(false);
}

function togglePanel(targetTab = null) {
  if (!panelWindow) {
    return;
  }

  if (targetTab) {
    showPanel(targetTab);
    return;
  }

  if (panelWindow.isVisible()) {
    hidePanel();
  } else {
    showPanel();
  }
}

function bindStateUpdates() {
  stateManager.on("state", (state) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send("rovia:state", state);
    }

    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send("rovia:state", state);
    }

    updateStatusTray(state);
  });
}

function registerIpc() {
  ipcMain.handle("rovia:get-state", async () => stateManager.getPublicState());
  ipcMain.handle("rovia:get-pet-bounds", async () =>
    petWindow ? petWindow.getBounds() : null
  );

  ipcMain.handle("rovia:toggle-panel", async () => {
    togglePanel();
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:open-panel-tab", async (_event, tab) => {
    showPanel(tab);
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:backend", async (_event, action, payload = {}) => {
    if (!stateManager?.backend?.isConfigured?.()) {
      return { error: "backend_not_configured" };
    }

    try {
      switch (action) {
        case "devices-status":
          return stateManager.backend.fetchDevicesStatus();
        case "devices-config":
          return stateManager.backend.fetchDevicesConfig();
        case "devices-scan":
          return stateManager.backend.scanDevices(payload.timeout);
        case "devices-configure":
          return stateManager.backend.configureDevices(payload);
        case "devices-disconnect":
          return stateManager.backend.disconnectDevice(payload.deviceType);
        case "devices-reconnect":
          return stateManager.backend.reconnectDevice(payload.deviceType);
        case "friends-request":
          return stateManager.backend.requestFriend(payload.friendId);
        case "friends-accept":
          return stateManager.backend.acceptFriend(payload.friendId);
        case "telemetry-latest":
          return stateManager.backend.fetchLatestTelemetry();
        default:
          return { error: "unsupported_action", action };
      }
    } catch (err) {
      // 后端未启动或网络不通时静默返回，不向 renderer 抛异常
      const isNetworkError =
        err?.cause?.code === "ECONNREFUSED" ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("ECONNREFUSED");
      const isBluetoothPoweredOff =
        err?.message?.includes("Bluetooth device is turned off") ||
        err?.message?.includes("POWERED_OFF");
      if (isNetworkError) {
        return { error: "backend_unreachable" };
      }
      if (isBluetoothPoweredOff) {
        return { error: "bluetooth_powered_off" };
      }
      return { error: err?.message || "unknown_error" };
    }
  });

  ipcMain.handle("rovia:sign-in", async (_event, payload = {}) => {
    await stateManager.signInWithPassword(payload);
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:sign-up", async (_event, payload = {}) => {
    return stateManager.signUpWithPassword(payload);
  });

  ipcMain.handle("rovia:enter-demo", async () => {
    await stateManager.enterDemoMode();
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:exit-demo", async () => {
    await stateManager.exitDemoMode();
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:sign-out", async () => {
    await stateManager.signOut();
    return stateManager.getPublicState();
  });

  ipcMain.handle("rovia:action", async (_event, action, payload = {}) => {
    switch (action) {
      case "start-focus":
        await stateManager.startFocus(payload);
        break;
      case "end-focus":
        await stateManager.endFocusEarly();
        break;
      case "restart-focus":
        await stateManager.restartFocus();
        break;
      case "acknowledge-completed":
        await stateManager.acknowledgeCompleted();
        break;
      case "set-physio":
        await stateManager.setPhysioState(payload);
        break;
      case "set-presence":
        await stateManager.setPresenceState(payload.presenceState);
        break;
      case "toggle-sound":
        await stateManager.toggleSound();
        break;
      case "set-camera-enabled":
        await stateManager.setCameraEnabled(payload.cameraEnabled);
        break;
      case "create-todo":
        await stateManager.createTodo({
          title: payload.title,
          tag: payload.tag,
          scheduledAt: payload.scheduledAt
        });
        break;
      case "update-todo":
        await stateManager.updateTodoTitle(payload.todoId, payload.title);
        break;
      case "update-todo-tag":
        await stateManager.updateTodoTag(payload.todoId, payload.tag);
        break;
      case "set-active-todo":
        await stateManager.setActiveTodo(payload.todoId);
        break;
      case "mark-todo-done":
        await stateManager.markTodoDone(payload.todoId);
        break;
      case "quit-app":
        isQuitting = true;
        app.quit();
        break;
      case "recenter-pet":
        snapPetWindowToCorner();
        break;
      case "move-pet":
        if (petWindow && typeof payload.x === "number" && typeof payload.y === "number") {
          petWindow.setPosition(Math.round(payload.x), Math.round(payload.y), false);
        }
        break;
      default:
        break;
    }

    return stateManager.getPublicState();
  });
}

async function bootstrap() {
  await session.defaultSession.clearCache();
  configureMediaPermissions();
  const fallbackUserId =
    process.env.ROVIA_USER_ID && process.env.ROVIA_USER_ID !== "demo-user"
      ? process.env.ROVIA_USER_ID
      : null;
  const storage = new JsonStorage(
    path.join(app.getPath("userData"), "rovia-state.json")
  );
  const authStorage = new JsonStorage(
    path.join(app.getPath("userData"), "rovia-auth.json")
  );
  const backendAuthStorage = new JsonStorage(
    path.join(app.getPath("userData"), "rovia-backend-auth.json")
  );
  const supabase = new SupabaseService({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    defaultUserId: fallbackUserId,
    authStorage
  });
  await supabase.init();
  const backendBaseUrl = deriveBackendBaseUrl({
    explicitBaseUrl: process.env.ROVIA_BACKEND_URL || process.env.ADHD_API_URL,
    fallbackWsUrl: process.env.ROVIA_SIDECAR_URL
  });
  const backend = new BackendHttpClient({
    baseUrl: backendBaseUrl,
    authStorage: backendAuthStorage
  });
  await backend.init();
  let sidecarUrl = process.env.ROVIA_SIDECAR_URL;

  if (!sidecarUrl && backendBaseUrl) {
    try {
      const parsed = new URL(backendBaseUrl);
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      parsed.pathname = "/ws/telemetry";
      parsed.search = "";
      parsed.hash = "";
      sidecarUrl = parsed.toString();
    } catch (_error) {
      sidecarUrl = null;
    }
  }

  stateManager = new RoviaStateManager({
    storage,
    supabase,
    backend
  });

  await stateManager.init();
  createPetWindow();
  createPanelWindow();
  createStatusTray();
  bindStateUpdates();
  registerIpc();
  sidecarClient = new SidecarClient({
    url: sidecarUrl || "ws://127.0.0.1:8765",
    onEvent: (event) => {
      const events = backendEventAdapter.adapt(event);
      events.forEach((nextEvent) => {
        stateManager.ingestSidecarEvent(nextEvent);
      });
    },
    onConnectionChange: (isConnected) => {
      stateManager.setWearableConnection(isConnected);
    }
  });
  sidecarClient.connect();
  stateManager.emitState();
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  await bootstrap();
});

app.on("before-quit", (event) => {
  isQuitting = true;

  if (!quitIntercepted) {
    quitIntercepted = true;
    event.preventDefault();
    Promise.resolve()
      .then(() =>
        requestBackendShutdown({
          baseUrl: stateManager?.backend?.baseUrl
        })
      )
      .catch((error) => {
        console.warn("[backend] shutdown on quit failed", error);
      })
      .finally(() => {
        cleanupRuntime();
        app.quit();
      });
    return;
  }

  cleanupRuntime();
});

app.on("activate", () => {
  if (petWindow) {
    petWindow.show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
