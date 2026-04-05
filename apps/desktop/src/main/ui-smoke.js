function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 100, label = "condition" } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (_error) {
      // Ignore transient predicate failures while waiting.
    }
    await sleep(intervalMs);
  }
  throw new Error(`[ui-smoke] timeout waiting for ${label}`);
}

async function ensurePanelReady(panelWindow) {
  if (!panelWindow || panelWindow.isDestroyed()) {
    throw new Error("[ui-smoke] panel window is unavailable");
  }

  if (!panelWindow.webContents.isLoadingMainFrame()) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onClosed = () => {
      cleanup();
      reject(new Error("[ui-smoke] panel window closed before loading"));
    };
    const cleanup = () => {
      panelWindow.webContents.removeListener("did-finish-load", onLoad);
      panelWindow.removeListener("closed", onClosed);
    };
    panelWindow.webContents.once("did-finish-load", onLoad);
    panelWindow.once("closed", onClosed);
  });
}

async function evalInPanel(panelWindow, script) {
  if (!panelWindow || panelWindow.isDestroyed()) {
    throw new Error("[ui-smoke] panel window is unavailable");
  }
  return panelWindow.webContents.executeJavaScript(script, true);
}

async function runUiSmoke({ panelWindow, showPanel, stateManager }) {
  await ensurePanelReady(panelWindow);

  const results = {
    ok: true,
    steps: {}
  };

  showPanel("account");
  await sleep(500);

  const demoClick = await evalInPanel(
    panelWindow,
    `(() => {
      const button = document.getElementById("auth-demo");
      if (!button) {
        return { ok: false, reason: "auth-demo-button-missing" };
      }
      button.click();
      return { ok: true, label: button.textContent?.trim() || "" };
    })()`
  );
  if (!demoClick?.ok) {
    throw new Error(`[ui-smoke] failed to click demo sign-in: ${JSON.stringify(demoClick)}`);
  }

  await waitFor(
    () => {
      const auth = stateManager.getPublicState()?.auth || {};
      return Boolean(auth.isLoggedIn) || auth.mode === "demo";
    },
    { timeoutMs: 15000, label: "demo auth state" }
  );

  const accountSnapshot = await evalInPanel(
    panelWindow,
    `(() => ({
      title: document.getElementById("auth-title")?.textContent?.trim() || "",
      email: document.getElementById("auth-email-pill")?.textContent?.trim() || "",
      mode: document.getElementById("sync-mode")?.textContent?.trim() || ""
    }))()`
  );
  results.steps.account = accountSnapshot;

  const beforeTodoCount = (stateManager.getPublicState()?.todos || []).length;
  showPanel("todo");
  await sleep(350);

  const todoSubmit = await evalInPanel(
    panelWindow,
    `(() => {
      const input = document.getElementById("todo-input");
      const form = document.getElementById("todo-form");
      if (!input || !form) {
        return { ok: false, reason: "todo-form-elements-missing" };
      }
      input.value = "ui-smoke-todo-" + Date.now();
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return { ok: true, value: input.value };
    })()`
  );
  if (!todoSubmit?.ok) {
    throw new Error(`[ui-smoke] failed to submit todo form: ${JSON.stringify(todoSubmit)}`);
  }

  await waitFor(
    () => (stateManager.getPublicState()?.todos || []).length > beforeTodoCount,
    { timeoutMs: 12000, label: "todo created" }
  );

  const todoSnapshot = await evalInPanel(
    panelWindow,
    `(() => ({
      listCount: document.querySelectorAll("#todo-list .todo-item").length,
      currentTitle: document.getElementById("todo-page-current-title")?.textContent?.trim() || ""
    }))()`
  );
  results.steps.todo = todoSnapshot;

  showPanel("focus");
  await sleep(350);

  await evalInPanel(
    panelWindow,
    `(() => {
      const button = document.getElementById("start-desktop");
      if (!button) {
        return { ok: false, reason: "start-desktop-button-missing" };
      }
      button.click();
      return { ok: true };
    })()`
  );

  await waitFor(
    () => Boolean(stateManager.getPublicState()?.focusSession),
    { timeoutMs: 12000, label: "focus started" }
  );

  await evalInPanel(
    panelWindow,
    `(() => {
      const button = document.getElementById("end-focus");
      if (!button) {
        return { ok: false, reason: "end-focus-button-missing" };
      }
      button.click();
      return { ok: true };
    })()`
  );

  await waitFor(
    () => !stateManager.getPublicState()?.focusSession,
    { timeoutMs: 12000, label: "focus ended" }
  );

  const focusSnapshot = await evalInPanel(
    panelWindow,
    `(() => ({
      status: document.getElementById("runtime-status")?.textContent?.trim() || "",
      latestSession: document.getElementById("latest-session-title")?.textContent?.trim() || ""
    }))()`
  );
  results.steps.focus = focusSnapshot;

  showPanel("device");
  await sleep(600);

  const deviceRefresh = await evalInPanel(
    panelWindow,
    `(() => {
      const refresh = document.getElementById("device-scan-refresh");
      if (!refresh) {
        return { ok: false, reason: "device-scan-refresh-missing" };
      }
      const wasDisabledBefore = Boolean(refresh.disabled);
      if (!wasDisabledBefore) {
        refresh.click();
      }
      return {
        ok: true,
        wasDisabledBefore,
        clicked: !wasDisabledBefore,
        disabledAfterClick: Boolean(refresh.disabled)
      };
    })()`
  );
  results.steps.deviceRefresh = deviceRefresh;

  await sleep(6500);

  const deviceSnapshot = await evalInPanel(
    panelWindow,
    `(() => ({
      syncMode: document.getElementById("device-sync-mode")?.textContent?.trim() || "",
      scanCopy: document.getElementById("device-scan-copy")?.textContent?.trim() || "",
      scanFeedback: document.getElementById("device-scan-feedback")?.textContent?.trim() || "",
      scanItemCount: document.querySelectorAll("#device-scan-list .device-scan-item").length,
      wristbandState: document.getElementById("wristband-connection-state")?.textContent?.trim() || "",
      squeezeState: document.getElementById("squeeze-connection-state")?.textContent?.trim() || "",
      refreshDisabled: Boolean(document.getElementById("device-scan-refresh")?.disabled),
      connectDisabled: Boolean(document.getElementById("device-connect-submit")?.disabled),
      disconnectDisabled: Boolean(document.getElementById("device-disconnect-all")?.disabled)
    }))()`
  );
  results.steps.device = deviceSnapshot;

  showPanel("friend");
  await sleep(800);
  const friendSnapshot = await evalInPanel(
    panelWindow,
    `(() => ({
      countText: document.getElementById("friend-count")?.textContent?.trim() || "",
      listCount: document.querySelectorAll("#friend-list .friend-item").length,
      rankingRows: document.querySelectorAll("#friend-ranking-list .friend-rank-row").length
    }))()`
  );
  results.steps.friend = friendSnapshot;

  const publicState = stateManager.getPublicState();
  results.summary = {
    authMode: publicState?.auth?.mode || "",
    isLoggedIn: Boolean(publicState?.auth?.isLoggedIn),
    todoCount: (publicState?.todos || []).length,
    focusSessionActive: Boolean(publicState?.focusSession),
    friendRecommendations: (publicState?.remoteData?.friends || []).length
  };

  return results;
}

module.exports = {
  runUiSmoke
};
