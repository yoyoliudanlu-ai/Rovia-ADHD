import { SQUEEZE_RAW_MAX } from "../shared/squeeze-scale.mjs";

const statusCopy = {
  Disconnected: "离线中",
  Idle: "陪你待机",
  Ready: "可以开始了",
  Support: "先轻一点也没关系",
  Focusing: "正在专注",
  Away: "等你回来",
  Completed: "这轮做得很好"
};

const shell = document.getElementById("pet-shell");
const petCameraBox = document.getElementById("pet-camera-box");
const petCameraCollapse = document.getElementById("pet-camera-collapse");
const petCameraPreview = document.getElementById("pet-camera-preview");
const petCameraEmpty = document.getElementById("pet-camera-empty");
const petCameraCopy = document.getElementById("pet-camera-copy");
const petDock = document.getElementById("pet-dock");
const timerRing = document.getElementById("timer-ring");
const timerText = document.getElementById("timer-text");
const progress = document.getElementById("timer-progress");
const primaryAction = document.getElementById("primary-action");
const locateAction = document.getElementById("locate-action");
const secondaryAction = document.getElementById("secondary-action");
const quitAction = document.getElementById("quit-action");
const primaryIcon = document.getElementById("primary-icon");
const locateIcon = document.getElementById("locate-icon");
const secondaryIcon = document.getElementById("secondary-icon");
const quitIcon = document.getElementById("quit-icon");
const quitPrompt = document.getElementById("quit-prompt");
const quitPromptCopy = document.getElementById("quit-prompt-copy");
const quitCancel = document.getElementById("quit-cancel");
const quitConfirm = document.getElementById("quit-confirm");
const petLive = document.getElementById("pet-live");

const circumference = 2 * Math.PI * 52;
progress.style.strokeDasharray = String(circumference);

let latestState = null;
let locateDrag = null;
let quitPromptOpen = false;
let actionMenuOpen = false;
let petCameraStream = null;
let petCameraBusy = false;
let petCameraState = "idle";
let petCameraRequestSeq = 0;
let petCameraRequestTimer = null;
let petCameraDismissed = false;

const icons = {
  play: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6.5c0-.82.9-1.33 1.62-.92l8.26 4.74a1.06 1.06 0 0 1 0 1.85l-8.26 4.74A1.06 1.06 0 0 1 8.5 16V6.5Z"/>
    </svg>
  `,
  stop: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7.5A1.5 1.5 0 0 1 9.5 6h5A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 16.5v-9Z"/>
    </svg>
  `,
  replay: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5a7 7 0 1 1-6.52 9.55 1 1 0 1 1 1.87-.71A5 5 0 1 0 8 8.35V11a1 1 0 1 1-2 0V6.5A1.5 1.5 0 0 1 7.5 5H12Z"/>
    </svg>
  `,
  panel: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.75A1.75 1.75 0 0 1 6.75 5h10.5A1.75 1.75 0 0 1 19 6.75v2.5A1.75 1.75 0 0 1 17.25 11H6.75A1.75 1.75 0 0 1 5 9.25v-2.5Zm0 8A1.75 1.75 0 0 1 6.75 13h4.5A1.75 1.75 0 0 1 13 14.75v2.5A1.75 1.75 0 0 1 11.25 19h-4.5A1.75 1.75 0 0 1 5 17.25v-2.5Zm10 0A1.75 1.75 0 0 1 16.75 13h.5A1.75 1.75 0 0 1 19 14.75v2.5A1.75 1.75 0 0 1 17.25 19h-.5A1.75 1.75 0 0 1 15 17.25v-2.5Z"/>
    </svg>
  `,
  locate: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 3a1 1 0 1 1 2 0v1.08a8 8 0 0 1 6.92 6.92H21a1 1 0 1 1 0 2h-1.08A8 8 0 0 1 13 19.92V21a1 1 0 1 1-2 0v-1.08A8 8 0 0 1 4.08 13H3a1 1 0 1 1 0-2h1.08A8 8 0 0 1 11 4.08V3Zm1 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>
    </svg>
  `,
  power: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z"/>
      <path d="M8.03 5.72a1 1 0 0 1 .18 1.4A6 6 0 1 0 15.8 7.1a1 1 0 0 1 1.58-1.22 8 8 0 1 1-12.76 0 1 1 0 0 1 1.41-.16Z"/>
    </svg>
  `
};

function setQuitPrompt(open) {
  quitPromptOpen = open;
  quitPrompt.hidden = !open;
}

function setActionMenu(open) {
  actionMenuOpen = open;
  shell.dataset.menuOpen = String(open);
  petDock.setAttribute("aria-hidden", String(!open));
}

function closeActionMenu() {
  if (!actionMenuOpen) {
    return;
  }

  setActionMenu(false);
}

function renderPetCameraState({ state, message }) {
  petCameraState = state;
  const enabled = Boolean(latestState?.settings?.cameraEnabled);
  petCameraBox.hidden = petCameraDismissed || (!enabled && state === "idle");
  petCameraBox.dataset.enabled = String(enabled);
  petCameraBox.dataset.cameraState = state;

  if (state === "live") {
    petCameraEmpty.hidden = true;
    petCameraCopy.textContent = message;
    return;
  }

  petCameraEmpty.hidden = false;
  petCameraCopy.textContent = message;
}

function clearPetCameraRequestTimer() {
  if (!petCameraRequestTimer) {
    return;
  }

  window.clearTimeout(petCameraRequestTimer);
  petCameraRequestTimer = null;
}

function syncPetCameraPreference(state) {
  const desiredEnabled = Boolean(state?.settings?.cameraEnabled);

  if (desiredEnabled) {
    petCameraDismissed = false;
  }

  if (!desiredEnabled) {
    if (petCameraStream || petCameraState !== "idle") {
      stopPetCamera();
    } else {
      petCameraBox.hidden = true;
    }
    return;
  }

  petCameraBox.hidden = false;
  if (!petCameraStream && !petCameraBusy && petCameraState === "idle") {
    void startPetCamera();
  }
}

async function startPetCamera({ force = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    renderPetCameraState({
      state: "error",
      message: "当前环境不支持摄像头预览"
    });
    return;
  }

  if (petCameraBusy || (!force && petCameraStream)) {
    return;
  }

  if (force && petCameraState === "error") {
    petCameraState = "idle";
  }

  petCameraDismissed = false;
  const requestId = ++petCameraRequestSeq;
  petCameraBusy = true;
  clearPetCameraRequestTimer();
  petCameraRequestTimer = window.setTimeout(() => {
    if (requestId !== petCameraRequestSeq || petCameraState !== "loading") {
      return;
    }

    petCameraRequestSeq += 1;
    petCameraBusy = false;
    renderPetCameraState({
      state: "error",
      message: "摄像头连接超时，点击折叠后可关闭"
    });
  }, 10000);

  renderPetCameraState({
    state: "loading",
    message: "正在连接摄像头..."
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 360 }
      }
    });

    if (requestId !== petCameraRequestSeq || !latestState?.settings?.cameraEnabled) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    clearPetCameraRequestTimer();
    petCameraStream = stream;
    petCameraPreview.srcObject = stream;
    try {
      await petCameraPreview.play();
    } catch (error) {
      // autoplay may briefly race with srcObject assignment in Electron webviews
    }
    renderPetCameraState({
      state: "live",
      message: "摄像头已连接"
    });
  } catch (error) {
    if (requestId !== petCameraRequestSeq) {
      return;
    }

    clearPetCameraRequestTimer();
    renderPetCameraState({
      state: "error",
      message:
        error?.name === "NotAllowedError"
          ? "请在系统设置里允许 Rovia 使用摄像头"
          : "摄像头暂时不可用，点击折叠关闭"
    });
  } finally {
    if (requestId === petCameraRequestSeq) {
      petCameraBusy = false;
    }
  }
}

function stopPetCamera() {
  petCameraRequestSeq += 1;
  clearPetCameraRequestTimer();
  if (petCameraStream) {
    petCameraStream.getTracks().forEach((track) => track.stop());
  }
  petCameraStream = null;
  if (petCameraPreview) {
    petCameraPreview.srcObject = null;
  }
  renderPetCameraState({
    state: "idle",
    message: "点击开启摄像头"
  });
  petCameraBox.hidden = true;
}

function markPetCameraLive() {
  if (!petCameraStream || petCameraDismissed) {
    return;
  }

  renderPetCameraState({
    state: "live",
    message: "摄像头已连接"
  });
}

function getPetPressurePercent(metrics = {}) {
  if (Number.isFinite(Number(metrics.pressurePercent))) {
    return Number(metrics.pressurePercent);
  }

  if (Number.isFinite(Number(metrics.pressureRaw))) {
    return Math.min(100, Math.max(0, (Number(metrics.pressureRaw) / 4095) * 100));
  }

  return Math.min(100, Math.max(0, Number(metrics.pressureValue) || 0));
}

function getPetPressureRaw(metrics = {}) {
  if (Number.isFinite(Number(metrics.pressureRaw))) {
    return Math.min(SQUEEZE_RAW_MAX, Math.max(0, Math.round(Number(metrics.pressureRaw))));
  }

  if (Number.isFinite(Number(metrics.pressurePercent))) {
    return Math.round(
      (Math.min(100, Math.max(0, Number(metrics.pressurePercent))) / 100) *
        SQUEEZE_RAW_MAX
    );
  }

  if (Number.isFinite(Number(metrics.pressureValue))) {
    const rawValue = Number(metrics.pressureValue);
    if (rawValue > 100) {
      return Math.min(SQUEEZE_RAW_MAX, Math.max(0, Math.round(rawValue)));
    }

    return Math.round((Math.min(100, Math.max(0, rawValue)) / 100) * SQUEEZE_RAW_MAX);
  }

  return 0;
}

async function requestQuit() {
  if (latestState?.focusSession) {
    const taskTitle = latestState.focusSession.taskTitle || "当前专注";
    quitPromptCopy.textContent = `“${taskTitle}” 还在进行中。退出后这轮会结束，但本地状态会自动保存。`;
    setQuitPrompt(true);
    closeActionMenu();
    petLive.textContent = "当前正在专注，退出前需要确认";
    return;
  }

  closeActionMenu();
  await window.rovia.quitApp();
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

function updateProgress(remainingSec, durationSec) {
  const ratio =
    durationSec > 0 ? Math.max(0, Math.min(1, remainingSec / durationSec)) : 0;
  progress.style.strokeDashoffset = String(circumference * (1 - ratio));
}

function renderActions(state) {
  locateIcon.innerHTML = icons.locate;
  locateAction.dataset.kind = "locate";
  quitIcon.innerHTML = icons.power;
  quitAction.setAttribute("aria-label", "退出 Rovia");
  quitAction.setAttribute("title", "退出 Rovia");
  quitAction.onclick = () => {
    requestQuit();
  };

  if (state.focusSession) {
    primaryIcon.innerHTML = icons.stop;
    primaryAction.setAttribute("aria-label", "结束专注");
    primaryAction.setAttribute("title", "结束专注");
    primaryAction.onclick = () => {
      closeActionMenu();
      window.rovia.endFocus();
    };
    secondaryIcon.innerHTML = icons.panel;
    secondaryAction.setAttribute("aria-label", "打开面板");
    secondaryAction.setAttribute("title", "打开面板");
    secondaryAction.onclick = () => {
      closeActionMenu();
      window.rovia.togglePanel();
    };
    return;
  }

  if (state.runtimeStatus === "Completed") {
    primaryIcon.innerHTML = icons.replay;
    primaryAction.setAttribute("aria-label", "再来一轮");
    primaryAction.setAttribute("title", "再来一轮");
    primaryAction.onclick = () => {
      closeActionMenu();
      window.rovia.restartFocus();
    };
    secondaryIcon.innerHTML = icons.panel;
    secondaryAction.setAttribute("aria-label", "打开面板");
    secondaryAction.setAttribute("title", "打开面板");
    secondaryAction.onclick = () => {
      closeActionMenu();
      window.rovia.acknowledgeCompleted();
      window.rovia.togglePanel();
    };
    return;
  }

  primaryIcon.innerHTML = icons.play;
  primaryAction.setAttribute("aria-label", "开始专注");
  primaryAction.setAttribute("title", "开始专注");
  primaryAction.onclick = () => {
    closeActionMenu();
    window.rovia.startFocus("desktop");
  };
  secondaryIcon.innerHTML = icons.panel;
  secondaryAction.setAttribute("aria-label", "打开面板");
  secondaryAction.setAttribute("title", "打开面板");
  secondaryAction.onclick = () => {
    closeActionMenu();
    window.rovia.togglePanel();
  };
}

function render(state) {
  latestState = state;
  shell.dataset.status = state.runtimeStatus;
  shell.dataset.hasSession = String(Boolean(state.focusSession));
  secondaryAction.dataset.active = String(Boolean(state.panelOpen));
  window.roviaBlob?.setStatus(state.runtimeStatus);
  window.roviaBlob?.setSqueezeActivity({
    ratePerMinute: state.squeeze?.ratePerMinute || 0,
    pressurePercent: getPetPressurePercent(state.metrics),
    pressureRaw: getPetPressureRaw(state.metrics)
  });

  if (state.focusSession) {
    timerText.textContent = formatTime(state.focusSession.remainingSec);
    updateProgress(state.focusSession.remainingSec, state.focusSession.durationSec);
  } else if (state.runtimeStatus === "Completed" && state.lastCompletedSession) {
    timerText.textContent = "20:00";
    updateProgress(0, 20 * 60);
  } else {
    timerText.textContent = "";
    updateProgress(0, 1);
  }

  timerRing.setAttribute(
    "aria-label",
    state.focusSession
      ? `本轮剩余 ${timerText.textContent}`
      : state.runtimeStatus === "Completed"
        ? "本轮已完成"
        : "当前未开始专注"
  );

  renderActions(state);
  syncPetCameraPreference(state);
  if (!state.focusSession && quitPromptOpen) {
    setQuitPrompt(false);
  }
  petLive.textContent = state.lastCue?.label || statusCopy[state.runtimeStatus];
}

locateAction.addEventListener("pointerdown", async (event) => {
  event.preventDefault();
  event.stopPropagation();

  const bounds = await window.rovia.getPetBounds();
  if (!bounds) {
    return;
  }

  locateDrag = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startWindowX: bounds.x,
    startWindowY: bounds.y,
    moved: false
  };

  locateAction.classList.add("is-dragging");
  locateAction.setPointerCapture(event.pointerId);
});

locateAction.addEventListener("pointermove", (event) => {
  if (!locateDrag || event.pointerId !== locateDrag.pointerId) {
    return;
  }

  const deltaX = event.screenX - locateDrag.startScreenX;
  const deltaY = event.screenY - locateDrag.startScreenY;

  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    locateDrag.moved = true;
  }

  if (!locateDrag.moved) {
    return;
  }

  window.rovia.movePetWindow(
    locateDrag.startWindowX + deltaX,
    locateDrag.startWindowY + deltaY
  );
});

async function finishLocateDrag(event) {
  if (!locateDrag || event.pointerId !== locateDrag.pointerId) {
    return;
  }

  const didMove = locateDrag.moved;
  locateAction.classList.remove("is-dragging");
  locateAction.releasePointerCapture(event.pointerId);
  locateDrag = null;

  if (!didMove) {
    await window.rovia.recenterPet();
    closeActionMenu();
    petLive.textContent = "桌宠已归位到屏幕右下角";
  } else {
    closeActionMenu();
    petLive.textContent = "桌宠位置已更新";
  }
}

locateAction.addEventListener("pointerup", finishLocateDrag);
locateAction.addEventListener("pointercancel", finishLocateDrag);

quitCancel.addEventListener("click", () => {
  setQuitPrompt(false);
  petLive.textContent = "继续保持当前状态";
});

quitConfirm.addEventListener("click", async () => {
  setQuitPrompt(false);
  await window.rovia.quitApp();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && actionMenuOpen && !quitPromptOpen) {
    closeActionMenu();
    petLive.textContent = "已收起桌宠菜单";
    return;
  }

  if (event.key === "Escape" && quitPromptOpen) {
    setQuitPrompt(false);
    petLive.textContent = "已取消退出";
  }
});

shell.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".pet-dock") || event.target.closest(".quit-prompt")) {
    return;
  }

  if (!event.target.closest(".pet-stage") && !event.target.closest(".pet-blob-shell")) {
    return;
  }

  event.preventDefault();
  setActionMenu(true);
  petLive.textContent = "已展开桌宠菜单";
});

document.addEventListener("pointerdown", (event) => {
  if (!actionMenuOpen) {
    return;
  }

  if (event.target.closest(".pet-dock") || event.target.closest(".quit-prompt")) {
    return;
  }

  closeActionMenu();
});

petCameraPreview?.addEventListener("loadeddata", () => {
  markPetCameraLive();
});

petCameraPreview?.addEventListener("playing", () => {
  markPetCameraLive();
});

petCameraCollapse?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  petCameraDismissed = true;
  stopPetCamera();
  await window.rovia.setCameraEnabled(false);
  petLive.textContent = "摄像头小窗已折叠";
});

window.addEventListener("beforeunload", () => {
  clearPetCameraRequestTimer();
  stopPetCamera();
});

window.rovia.getState().then(render);
window.rovia.onStateUpdate(render);
