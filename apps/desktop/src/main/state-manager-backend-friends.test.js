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

test("applyRemoteSnapshot keeps backend friend recommendations and ranking in remoteData", () => {
  const manager = new RoviaStateManager({
    storage: createStorage(),
    supabase: createSupabaseStub(),
    backend: null
  });

  manager.applyRemoteSnapshot({
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
  });

  assert.deepEqual(manager.getPublicState().remoteData.friends, [
    {
      id: "friend-luna",
      name: "Luna",
      tags: ["study", "health"],
      score: 2,
      status: "connected"
    }
  ]);
  assert.deepEqual(manager.getPublicState().remoteData.friendRanking, [
    {
      id: "showcase-user",
      name: "Rovia Showcase",
      rounds: 5,
      minutes: 120,
      streak: 6,
      is_self: true
    }
  ]);
});
