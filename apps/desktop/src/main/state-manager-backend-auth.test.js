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
      return true;
    },
    canSync() {
      return false;
    },
    getAuthState() {
      return {
        configured: true,
        mode: "anonymous",
        isLoggedIn: false,
        hasIdentity: false,
        needsLogin: true,
        email: null,
        userId: null
      };
    },
    async signInWithPassword() {
      throw new Error("supabase sign-in should not be called");
    },
    async signUpWithPassword() {
      throw new Error("supabase sign-up should not be called");
    },
    async signOut() {
      throw new Error("supabase sign-out should not be called");
    }
  };
}

test("refreshAuthState prefers backend auth when backend is configured", () => {
  const backend = {
    isConfigured() {
      return true;
    },
    getAuthState() {
      return {
        configured: true,
        mode: "demo",
        isLoggedIn: true,
        hasIdentity: true,
        needsLogin: false,
        email: "showcase@rovia.local",
        userId: "showcase-user"
      };
    }
  };

  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend
  });

  manager.refreshAuthState();

  assert.equal(manager.getPublicState().auth.mode, "demo");
  assert.equal(manager.getPublicState().auth.userId, "showcase-user");
});

test("signInWithPassword uses backend auth flow when backend is configured", async () => {
  let backendSignInCalls = 0;
  const backendAuthState = {
    configured: true,
    mode: "session",
    isLoggedIn: true,
    hasIdentity: true,
    needsLogin: false,
    email: "buddy@example.com",
    userId: "user-1"
  };
  const backend = {
    isConfigured() {
      return true;
    },
    getAuthState() {
      return backendAuthState;
    },
    async signInWithPassword(payload) {
      backendSignInCalls += 1;
      assert.equal(payload.email, "buddy@example.com");
      return { auth: backendAuthState };
    },
    async fetchDashboardSnapshot() {
      return {
        latestTelemetry: null,
        todos: [],
        focusSessions: []
      };
    }
  };

  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend
  });

  await manager.signInWithPassword({
    email: "buddy@example.com",
    password: "pw"
  });

  assert.equal(backendSignInCalls, 1);
  assert.equal(manager.getPublicState().auth.mode, "session");
  assert.equal(manager.getPublicState().auth.userId, "user-1");
});

test("enterDemoMode uses backend showcase account when backend is configured", async () => {
  let demoCalls = 0;
  const backendAuthState = {
    configured: true,
    mode: "demo",
    isLoggedIn: true,
    hasIdentity: true,
    needsLogin: false,
    email: "showcase@rovia.local",
    userId: "showcase-user"
  };
  const backend = {
    isConfigured() {
      return true;
    },
    getAuthState() {
      return backendAuthState;
    },
    async signInDemo() {
      demoCalls += 1;
      return { auth: backendAuthState };
    },
    async fetchDashboardSnapshot() {
      return {
        latestTelemetry: null,
        todos: [],
        focusSessions: [],
        friends: [
          {
            id: "friend-luna",
            name: "Luna",
            tags: ["study", "health"],
            score: 2,
            status: "connected"
          }
        ],
        friendRanking: [
          {
            id: "showcase-user",
            name: "Rovia Showcase",
            rounds: 5,
            minutes: 120,
            streak: 6,
            is_self: true
          }
        ]
      };
    }
  };

  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend
  });

  await manager.enterDemoMode();

  assert.equal(demoCalls, 1);
  assert.equal(manager.getPublicState().auth.mode, "demo");
  assert.equal(manager.getPublicState().remoteData.friends.length, 1);
});

test("init stays in backend/local mode instead of falling back to supabase when backend is configured", async () => {
  let supabaseConnectCalls = 0;
  const backend = {
    isConfigured() {
      return true;
    },
    getAuthState() {
      return {
        configured: true,
        mode: "anonymous",
        isLoggedIn: false,
        hasIdentity: false,
        needsLogin: true,
        email: null,
        userId: null
      };
    },
    async fetchDashboardSnapshot() {
      throw new Error("backend unavailable");
    }
  };
  const supabase = {
    ...createSupabaseStub(),
    isConfigured() {
      return true;
    },
    canSync() {
      return true;
    },
    async fetchDashboardSnapshot() {
      supabaseConnectCalls += 1;
      return {
        latestTelemetry: null,
        todos: [],
        focusSessions: []
      };
    }
  };

  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase,
    backend
  });

  await manager.init();

  assert.equal(supabaseConnectCalls, 0);
  assert.equal(manager.getPublicState().connection.supabase, false);
  assert.equal(manager.getPublicState().auth.mode, "anonymous");
  manager.destroy();
});
