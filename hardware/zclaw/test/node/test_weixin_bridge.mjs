import test from "node:test";
import assert from "node:assert/strict";

import {
  loadBridgeConfig,
  relayChat,
} from "../../scripts/lib/weixin_bridge_lib.mjs";

test("loadBridgeConfig selects relay mode when requested", () => {
  const config = loadBridgeConfig({
    WEIXIN_BRIDGE_MODE: "relay",
    ZCLAW_WEB_RELAY_URL: "http://127.0.0.1:8787/api/chat",
    ZCLAW_WEB_API_KEY: "relay-key",
  });

  assert.equal(config.mode, "relay");
  assert.equal(config.relayUrl, "http://127.0.0.1:8787/api/chat");
  assert.equal(config.relayApiKey, "relay-key");
  assert.equal(config.mqttUri, "");
  assert.equal(config.mqttTopic, "zclaw");
});

test("relayChat posts the user message to the local relay and returns reply text", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reply: "todo summary" }),
    };
  };

  const reply = await relayChat({
    relayUrl: "http://127.0.0.1:8787/api/chat",
    relayApiKey: "relay-key",
    message: "查一下我的 todos",
    fetchImpl,
    timeoutMs: 4321,
  });

  assert.equal(reply, "todo summary");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8787/api/chat");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["X-Zclaw-Key"], "relay-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), { message: "查一下我的 todos" });
});

test("relayChat throws a readable error when the relay rejects the request", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 502,
    text: async () => JSON.stringify({ error: "Bridge error: serial offline" }),
  });

  await assert.rejects(
    () => relayChat({
      relayUrl: "http://127.0.0.1:8787/api/chat",
      relayApiKey: "",
      message: "ping",
      fetchImpl,
      timeoutMs: 1000,
    }),
    /502.*serial offline/,
  );
});
