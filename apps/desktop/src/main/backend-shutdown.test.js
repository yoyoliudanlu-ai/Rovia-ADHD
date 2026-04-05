const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isLoopbackBackendUrl,
  requestBackendShutdown
} = require("./backend-shutdown");

test("isLoopbackBackendUrl only allows localhost backends", () => {
  assert.equal(isLoopbackBackendUrl("http://127.0.0.1:8000"), true);
  assert.equal(isLoopbackBackendUrl("http://localhost:8000"), true);
  assert.equal(isLoopbackBackendUrl("http://192.168.1.9:8000"), false);
  assert.equal(isLoopbackBackendUrl("https://api.example.com"), false);
});

test("requestBackendShutdown posts to the integrated local shutdown route", async () => {
  const calls = [];

  await requestBackendShutdown({
    baseUrl: "http://127.0.0.1:8000",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return '{"ok":true}';
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/system/shutdown");
  assert.equal(calls[0].options.method, "POST");
});
