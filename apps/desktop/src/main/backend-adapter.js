function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function toNumberOrUndefined(value) {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  return Number(value);
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizePressurePercent(squeeze = {}) {
  const normalized = toNumberOrUndefined(squeeze.pressure_norm);
  if (normalized !== undefined) {
    return Math.round(clampNumber(normalized * 100, 0, 100) * 100) / 100;
  }

  const raw = toNumberOrUndefined(squeeze.pressure_raw);
  if (raw !== undefined) {
    return Math.round(clampNumber((raw / 4095) * 100, 0, 100) * 100) / 100;
  }

  return 0;
}

function derivePresenceState(isAtDesk) {
  if (isAtDesk === true) {
    return "near";
  }

  if (isAtDesk === false) {
    return "far";
  }

  return undefined;
}

function derivePressureLevel(pressurePercent) {
  if (!isFiniteNumber(pressurePercent) || pressurePercent <= 0) {
    return "idle";
  }

  if (pressurePercent >= 78) {
    return "squeeze";
  }

  if (pressurePercent >= 34) {
    return "engaged";
  }

  return "light";
}

function derivePhysioState({
  metricsStatus,
  stressScore,
  focusScore,
  hrv,
  sdnn
}) {
  if (metricsStatus === "offline") {
    return "unknown";
  }

  if (isFiniteNumber(stressScore) && Number(stressScore) >= 70) {
    return "strained";
  }

  if (
    (isFiniteNumber(focusScore) && Number(focusScore) >= 60) ||
    (isFiniteNumber(sdnn) && Number(sdnn) >= 55) ||
    (isFiniteNumber(hrv) && Number(hrv) >= 42)
  ) {
    return "ready";
  }

  return "unknown";
}

function toIsoTimestamp(value) {
  const numericValue = toNumberOrUndefined(value);
  if (numericValue !== undefined) {
    const epochMs = numericValue > 1e12 ? numericValue : numericValue * 1000;
    return new Date(epochMs).toISOString();
  }

  const parsedMs = Date.parse(String(value || ""));
  if (!Number.isNaN(parsedMs)) {
    return new Date(parsedMs).toISOString();
  }

  return new Date().toISOString();
}

class BackendEventAdapter {
  constructor() {
    this.snapshot = {
      wristband: {},
      squeeze: {},
      presence: {},
      meta: {}
    };
    this.squeezeActive = false;
    this.lastSqueezePulseAtMs = 0;
  }

  adapt(message) {
    if (!message || typeof message !== "object") {
      return [];
    }

    if (typeof message.type === "string") {
      return [message];
    }

    if (typeof message.event !== "string" || !message.data || typeof message.data !== "object") {
      return [];
    }

    switch (message.event) {
      case "snapshot":
        return this.handleSnapshot(message.data);
      case "wristband":
        return this.handleWristband(message.data);
      case "squeeze":
        return this.handleSqueeze(message.data);
      case "presence":
        return this.handlePresence(message.data);
      default:
        return [];
    }
  }

  handleSnapshot(data) {
    this.snapshot = {
      wristband: { ...(data.wristband || {}) },
      squeeze: { ...(data.squeeze || {}) },
      presence: { ...(data.presence || {}) },
      meta: { ...(data.meta || {}) }
    };

    return [this.buildTelemetryEvent("backend_snapshot")];
  }

  handleWristband(data) {
    this.snapshot.wristband = {
      ...this.snapshot.wristband,
      ...data
    };
    this.snapshot.meta.updated_at = Date.now() / 1000;

    return [this.buildTelemetryEvent("backend_wristband")];
  }

  handleSqueeze(data) {
    this.snapshot.squeeze = {
      ...this.snapshot.squeeze,
      ...data
    };
    this.snapshot.meta.updated_at = Date.now() / 1000;

    const telemetryEvent = this.buildTelemetryEvent("backend_squeeze");
    const events = [telemetryEvent];
    const squeezePulseEvent = this.buildSqueezePulseEvent();

    if (squeezePulseEvent) {
      events.push(squeezePulseEvent);
    }

    return events;
  }

  handlePresence(data) {
    this.snapshot.presence = {
      ...this.snapshot.presence,
      ...data
    };
    this.snapshot.meta.updated_at = Date.now() / 1000;

    return [this.buildTelemetryEvent("backend_presence")];
  }

  buildTelemetryEvent(sourceDevice) {
    const wristband = this.snapshot.wristband || {};
    const squeeze = this.snapshot.squeeze || {};
    const presence = this.snapshot.presence || {};
    const pressurePercent = normalizePressurePercent(squeeze);
    const pressureRaw = toNumberOrUndefined(squeeze.pressure_raw);
    const stressScore =
      toNumberOrUndefined(wristband.stress_level) ??
      toNumberOrUndefined(squeeze.stress_level);
    const focusScore = toNumberOrUndefined(wristband.focus);
    const hrv = toNumberOrUndefined(wristband.hrv);
    const sdnn = toNumberOrUndefined(wristband.sdnn);

    return {
      type: "telemetry",
      physioState: derivePhysioState({
        metricsStatus: wristband.metrics_status,
        stressScore,
        focusScore,
        hrv,
        sdnn
      }),
      heartRate: toNumberOrUndefined(wristband.bpm),
      hrv,
      sdnn,
      focusScore,
      stressScore,
      distanceMeters: toNumberOrUndefined(presence.distance_m),
      wearableRssi: toNumberOrUndefined(presence.rssi),
      pressureValue: pressurePercent,
      pressurePercent,
      pressureRaw,
      pressureLevel: derivePressureLevel(pressurePercent),
      presenceState: derivePresenceState(presence.is_at_desk),
      sourceDevice,
      recordedAt: toIsoTimestamp(this.snapshot.meta.updated_at),
      syncedBySidecar: true
    };
  }

  buildSqueezePulseEvent() {
    const squeeze = this.snapshot.squeeze || {};
    const pressurePercent = normalizePressurePercent(squeeze);
    const pressureLevel = derivePressureLevel(pressurePercent);
    const isActive = pressureLevel !== "idle" || pressurePercent >= 25;
    const nowMs = Date.now();

    if (
      !isActive ||
      this.squeezeActive ||
      nowMs - this.lastSqueezePulseAtMs < 450
    ) {
      this.squeezeActive = isActive;
      return null;
    }

    this.squeezeActive = true;
    this.lastSqueezePulseAtMs = nowMs;

    return {
      type: "squeeze_pulse",
      timestamp: toIsoTimestamp(this.snapshot.meta.updated_at),
      pressureValue: pressurePercent,
      pressurePercent,
      pressureRaw: toNumberOrUndefined(squeeze.pressure_raw),
      pressureLevel,
      sourceDevice: "backend_squeeze"
    };
  }
}

module.exports = {
  BackendEventAdapter
};
