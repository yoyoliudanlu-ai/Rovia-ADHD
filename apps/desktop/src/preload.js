const { contextBridge, ipcRenderer } = require("electron");

// 统一 backend IPC 调用：main 返回 {error} 时转为 throw，避免"Error invoking remote method"弹出
async function _backendCall(action, payload = {}) {
  const result = await ipcRenderer.invoke("rovia:backend", action, payload);
  if (result && typeof result === "object" && result.error) {
    const msgs = {
      backend_not_configured: "后端未配置",
      backend_unreachable: "后端未启动",
      bluetooth_powered_off: "系统蓝牙已关闭，请先打开蓝牙后再试",
    };
    throw new Error(msgs[result.error] || result.error);
  }
  return result;
}

contextBridge.exposeInMainWorld("rovia", {
  getState: () => ipcRenderer.invoke("rovia:get-state"),
  getPetBounds: () => ipcRenderer.invoke("rovia:get-pet-bounds"),
  togglePanel: () => ipcRenderer.invoke("rovia:toggle-panel"),
  signIn: (email, password) =>
    ipcRenderer.invoke("rovia:sign-in", {
      email,
      password
    }),
  signUp: (email, password) =>
    ipcRenderer.invoke("rovia:sign-up", {
      email,
      password
    }),
  enterDemoMode: () => ipcRenderer.invoke("rovia:enter-demo"),
  exitDemoMode: () => ipcRenderer.invoke("rovia:exit-demo"),
  signOut: () => ipcRenderer.invoke("rovia:sign-out"),
  startFocus: (triggerSource = "desktop") =>
    ipcRenderer.invoke("rovia:action", "start-focus", {
      triggerSource
    }),
  endFocus: () => ipcRenderer.invoke("rovia:action", "end-focus"),
  restartFocus: () => ipcRenderer.invoke("rovia:action", "restart-focus"),
  acknowledgeCompleted: () =>
    ipcRenderer.invoke("rovia:action", "acknowledge-completed"),
  setPhysioState: (payload) =>
    ipcRenderer.invoke("rovia:action", "set-physio", payload),
  setPresenceState: (presenceState) =>
    ipcRenderer.invoke("rovia:action", "set-presence", {
      presenceState
    }),
  toggleSound: () => ipcRenderer.invoke("rovia:action", "toggle-sound"),
  setCameraEnabled: (cameraEnabled) =>
    ipcRenderer.invoke("rovia:action", "set-camera-enabled", {
      cameraEnabled
    }),
  createTodo: (payload, tag = "general") =>
    ipcRenderer.invoke(
      "rovia:action",
      "create-todo",
      typeof payload === "object" && payload !== null
        ? payload
        : {
            title: payload,
            tag
          }
    ),
  updateTodoTitle: (todoId, title) =>
    ipcRenderer.invoke("rovia:action", "update-todo", {
      todoId,
      title
    }),
  updateTodoTag: (todoId, tag) =>
    ipcRenderer.invoke("rovia:action", "update-todo-tag", {
      todoId,
      tag
    }),
  setActiveTodo: (todoId) =>
    ipcRenderer.invoke("rovia:action", "set-active-todo", {
      todoId
    }),
  markTodoDone: (todoId) =>
    ipcRenderer.invoke("rovia:action", "mark-todo-done", {
      todoId
    }),
  movePetWindow: (x, y) =>
    ipcRenderer.invoke("rovia:action", "move-pet", {
      x,
      y
    }),
  recenterPet: () => ipcRenderer.invoke("rovia:action", "recenter-pet"),
  quitApp: () => ipcRenderer.invoke("rovia:action", "quit-app"),
  openPanelTab: (tab) => ipcRenderer.invoke("rovia:open-panel-tab", tab),
  getDevicesStatus: () => _backendCall("devices-status"),
  getDevicesConfig: () => _backendCall("devices-config"),
  scanDevices: (timeout = 5) => _backendCall("devices-scan", { timeout }),
  configureDevices: (payload) => _backendCall("devices-configure", payload),
  disconnectDevice: (deviceType = "all") => _backendCall("devices-disconnect", { deviceType }),
  reconnectDevice: (deviceType = "all") => _backendCall("devices-reconnect", { deviceType }),
  requestFriend: (friendId) => _backendCall("friends-request", { friendId }),
  acceptFriend: (friendId) => _backendCall("friends-accept", { friendId }),
  getBackendTelemetry: () => _backendCall("telemetry-latest"),
  onLocaleChange: (callback) => {
    const listener = (_event, locale) => callback(locale);
    ipcRenderer.on("rovia:locale", listener);
    return () => ipcRenderer.removeListener("rovia:locale", listener);
  },
  onOpenPanelTab: (callback) => {
    const listener = (_event, tab) => callback(tab);
    ipcRenderer.on("rovia:open-panel-tab", listener);
    return () => ipcRenderer.removeListener("rovia:open-panel-tab", listener);
  },
  onStateUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("rovia:state", listener);
    return () => ipcRenderer.removeListener("rovia:state", listener);
  }
});
