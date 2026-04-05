function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  return text.replace(/\/+$/, "");
}

function isLoopbackBackendUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch (_error) {
    return false;
  }
}

async function requestBackendShutdown({
  baseUrl,
  fetchImpl = global.fetch,
  timeoutMs = 1200
} = {}) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized || !isLoopbackBackendUrl(normalized) || typeof fetchImpl !== "function") {
    return { ok: false, skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${normalized}/api/system/shutdown`, {
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `[backend] shutdown failed: ${response.status} ${text}`.trim()
      );
    }

    return { ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  isLoopbackBackendUrl,
  requestBackendShutdown
};
