const test = require("node:test");
const assert = require("node:assert/strict");

const { RoviaStateManager } = require("./state-manager");

function createStorage() {
  return {
    async load() {
      return null;
    },
    async save() {}
  };
}

function createSupabaseStub() {
  return {
    isConfigured() {
      return false;
    },
    canSync() {
      return false;
    },
    getAuthState() {
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
  };
}

test("tick sends one reminder when todo reaches scheduled time", async () => {
  const reminderCalls = [];
  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend: {
      isConfigured() {
        return true;
      },
      async sendReminderSignal(payload) {
        reminderCalls.push(payload);
      }
    }
  });

  manager.state.connection.backend = true;
  manager.state.todos = [
    {
      id: "todo-1",
      title: "到点任务",
      status: "pending",
      isActive: true,
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      startReminderSentAt: null,
      updatedAt: new Date().toISOString()
    }
  ];

  manager.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(reminderCalls.length, 1);
  assert.equal(reminderCalls[0].reason, "todo_start");
  assert.equal(reminderCalls[0].signalHex, "02");
  assert.ok(manager.state.todos[0].startReminderSentAt);
  assert.equal(manager.state.lastCue?.type, "reminder");
  manager.destroy();
});

test("enter_task requires both wristband switch enabled and focusActive true", async () => {
  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend: {
      isConfigured() {
        return false;
      }
    }
  });

  // 默认关闭：即便手环发了 focusActive=true，也不自动进入专注
  await manager.ingestSidecarEvent({ type: "enter_task", focusActive: true });
  assert.equal(manager.state.focusSession, null);

  // 手环事件明确表示关闭，也不触发
  await manager.ingestSidecarEvent({ type: "enter_task", focusActive: false });
  assert.equal(manager.state.focusSession, null);

  // 只有用户手动开启后，focusActive=true 才触发
  manager.state.settings.wristbandFocusTrigger = true;
  await manager.ingestSidecarEvent({ type: "enter_task", focusActive: true });
  assert.ok(manager.state.focusSession);
  assert.equal(manager.state.focusSession.triggerSource, "wearable");
  manager.destroy();
});
