const test = require("node:test");
const assert = require("node:assert/strict");

const { BackendHttpClient } = require("./backend-http-client");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("signInWithPassword stores backend auth state and sends bearer token on later requests", async () => {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/api/auth/sign-in")) {
      return jsonResponse({
        session: {
          access_token: "token-user-1",
          user: {
            id: "user-1",
            email: "buddy@example.com"
          },
          mode: "session"
        },
        auth: {
          configured: true,
          mode: "session",
          isLoggedIn: true,
          hasIdentity: true,
          needsLogin: false,
          email: "buddy@example.com",
          userId: "user-1"
        },
        profile: {}
      });
    }

    if (String(url).endsWith("/api/todos")) {
      return jsonResponse([]);
    }

    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010"
    });

    const auth = await client.signInWithPassword({
      email: "buddy@example.com",
      password: "pw"
    });
    const todos = await client.fetchTodos();

    assert.equal(auth.auth.userId, "user-1");
    assert.deepEqual(todos, []);
    assert.equal(
      calls[1].options.headers.authorization,
      "Bearer token-user-1"
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("signInDemo stores demo auth mode from backend", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).endsWith("/api/auth/demo-sign-in")) {
      return jsonResponse({
        session: {
          access_token: "token-showcase-user",
          user: {
            id: "showcase-user",
            email: "showcase@rovia.local"
          },
          mode: "demo"
        },
        auth: {
          configured: true,
          mode: "demo",
          isLoggedIn: true,
          hasIdentity: true,
          needsLogin: false,
          email: "showcase@rovia.local",
          userId: "showcase-user"
        },
        profile: {
          display_name: "Rovia Showcase"
        }
      });
    }

    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010"
    });

    const result = await client.signInDemo();

    assert.equal(result.auth.mode, "demo");
    assert.equal(client.getAuthState().mode, "demo");
    assert.equal(client.getSession().access_token, "token-showcase-user");
  } finally {
    global.fetch = originalFetch;
  }
});

test("init restores a persisted backend session token and validates it with the backend", async () => {
  const originalFetch = global.fetch;
  const authStorage = {
    saved: null,
    async load() {
      return {
        session: {
          access_token: "token-restored"
        }
      };
    },
    async save(value) {
      this.saved = value;
    }
  };

  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/auth/session")) {
      assert.equal(options.headers.authorization, "Bearer token-restored");
      return jsonResponse({
        session: {
          access_token: "token-restored",
          user: {
            id: "user-restored",
            email: "restored@example.com"
          },
          mode: "session"
        },
        auth: {
          configured: true,
          mode: "session",
          isLoggedIn: true,
          hasIdentity: true,
          needsLogin: false,
          email: "restored@example.com",
          userId: "user-restored"
        },
        profile: {
          display_name: "Restored User"
        }
      });
    }

    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010",
      authStorage
    });

    await client.init();

    assert.equal(client.getAuthState().userId, "user-restored");
    assert.equal(client.getSession().access_token, "token-restored");
    assert.deepEqual(authStorage.saved, {
      session: {
        access_token: "token-restored"
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchDashboardSnapshot includes backend friends and ranking", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (String(url).endsWith("/api/telemetry/latest")) {
      return jsonResponse({
        wristband: {},
        squeeze: {},
        presence: {},
        meta: { updated_at: Date.now() / 1000 }
      });
    }

    if (String(url).endsWith("/api/todos")) {
      return jsonResponse([]);
    }

    if (String(url).includes("/api/focus/sessions")) {
      return jsonResponse({ data: [] });
    }

    if (String(url).endsWith("/api/friends/recommendations")) {
      return jsonResponse({
        data: [
          {
            id: "friend-luna",
            name: "Luna",
            tags: ["study", "health"],
            score: 2,
            status: "connected"
          }
        ]
      });
    }

    if (String(url).includes("/api/friends/ranking")) {
      return jsonResponse({
        data: [
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
    }

    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010"
    });

    const snapshot = await client.fetchDashboardSnapshot();

    assert.deepEqual(snapshot.friends, [
      {
        id: "friend-luna",
        name: "Luna",
        tags: ["study", "health"],
        score: 2,
        status: "connected"
      }
    ]);
    assert.deepEqual(snapshot.friendRanking, [
      {
        id: "showcase-user",
        name: "Rovia Showcase",
        rounds: 5,
        minutes: 120,
        streak: 6,
        is_self: true
      }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("sendReminderSignal posts to devices remind endpoint", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/api/devices/remind")) {
      return jsonResponse({ ok: true, sent: true });
    }
    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010"
    });

    const result = await client.sendReminderSignal({
      reason: "todo_start",
      requireFocusActive: false,
      signalHex: "02"
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.endsWith("/api/devices/remind"), true);
    assert.equal(
      JSON.parse(calls[0].options.body).reason,
      "todo_start"
    );
    assert.equal(
      JSON.parse(calls[0].options.body).signal_hex,
      "02"
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("requestFriend and acceptFriend call backend friend actions", async () => {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (String(url).endsWith("/api/friends/request")) {
      return jsonResponse({
        ok: true,
        status: "pending",
        friend_id: "friend-luna"
      });
    }

    if (String(url).endsWith("/api/friends/accept")) {
      return jsonResponse({
        ok: true,
        status: "connected",
        friend_id: "friend-luna"
      });
    }

    throw new Error(`unexpected request ${url}`);
  };

  try {
    const client = new BackendHttpClient({
      baseUrl: "http://127.0.0.1:8010"
    });

    const requested = await client.requestFriend("friend-luna");
    const accepted = await client.acceptFriend("friend-luna");

    assert.equal(requested.status, "pending");
    assert.equal(accepted.status, "connected");
    assert.equal(
      JSON.parse(calls[0].options.body).friend_id,
      "friend-luna"
    );
    assert.equal(
      JSON.parse(calls[1].options.body).friend_id,
      "friend-luna"
    );
  } finally {
    global.fetch = originalFetch;
  }
});
