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

test("setPhysioState does not fabricate heart rate when bpm is missing", async () => {
  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend: {
      isConfigured() {
        return false;
      }
    }
  });

  await manager.setPhysioState({
    physioState: "ready",
    hrv: 44,
    stressScore: 31,
    pressurePercent: 28,
    skipTelemetrySync: true
  });

  const state = manager.getPublicState();
  assert.equal(state.metrics.heartRate, null);
  assert.equal(state.metrics.hrv, 44);
  assert.equal(state.metrics.stressScore, 31);
  assert.equal(state.metrics.pressurePercent, 28);
});
