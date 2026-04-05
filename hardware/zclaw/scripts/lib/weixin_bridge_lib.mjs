const DEFAULT_RELAY_URL = "http://127.0.0.1:8787/api/chat";
const DEFAULT_RELAY_TIMEOUT_MS = 60_000;

function envString(env, key, fallback = "") {
  const value = env?.[key];
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function loadBridgeConfig(env = process.env) {
  const explicitMode = envString(env, "WEIXIN_BRIDGE_MODE", "").toLowerCase();
  let mode = explicitMode;

  if (!mode) {
    mode = envString(env, "ZCLAW_WEB_RELAY_URL", "") ? "relay" : "mqtt";
  }

  if (mode !== "mqtt" && mode !== "relay") {
    throw new Error(`Unsupported WEIXIN_BRIDGE_MODE: ${mode}`);
  }

  return {
    mode,
    mqttUri: envString(env, "MQTT_URI", ""),
    mqttUser: envString(env, "MQTT_USER", ""),
    mqttPass: envString(env, "MQTT_PASS", ""),
    mqttTopic: envString(env, "MQTT_TOPIC", "zclaw"),
    relayUrl: envString(env, "ZCLAW_WEB_RELAY_URL", DEFAULT_RELAY_URL),
    relayApiKey: envString(env, "ZCLAW_WEB_API_KEY", ""),
    relayTimeoutMs: Number.parseInt(envString(env, "ZCLAW_WEB_RELAY_TIMEOUT_MS", ""), 10) || DEFAULT_RELAY_TIMEOUT_MS,
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function relayChat({
  relayUrl,
  relayApiKey = "",
  message,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_RELAY_TIMEOUT_MS,
}) {
  const targetUrl = typeof relayUrl === "string" ? relayUrl.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!targetUrl) {
    throw new Error("relay URL is empty");
  }
  if (!trimmedMessage) {
    throw new Error("relay message is empty");
  }

  const body = JSON.stringify({ message: trimmedMessage });
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body, "utf-8")),
  };
  if (relayApiKey?.trim()) {
    headers["X-Zclaw-Key"] = relayApiKey.trim();
  }

  let response;
  try {
    response = await fetchImpl(targetUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new Error(`relay chat timed out after ${timeoutMs}ms`);
    }
    throw error;
  }

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    const detail = payload?.error || text || `HTTP ${response.status}`;
    throw new Error(`relay chat HTTP ${response.status}: ${detail}`);
  }

  if (typeof payload?.reply !== "string" || !payload.reply.trim()) {
    throw new Error("relay response missing reply text");
  }

  return payload.reply.trim();
}
