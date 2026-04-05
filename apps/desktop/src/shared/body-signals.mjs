function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMetric(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : Math.round(numeric);
}

function formatMetricLabel(kind, locale = "en") {
  const labels = {
    hrv: locale === "zh" ? "HRV" : "HRV",
    focus: locale === "zh" ? "专注" : "Focus",
    stress: locale === "zh" ? "压力" : "Stress",
    touch: locale === "zh" ? "按压" : "Touch",
    distance: locale === "zh" ? "距离" : "Distance"
  };
  return labels[kind];
}

export function buildPrimarySignal(metrics = {}, { locale = "en" } = {}) {
  const heartRate = roundMetric(metrics.heartRate);
  const hrv = roundMetric(metrics.hrv);
  const focusScore = roundMetric(metrics.focusScore);
  const stressScore = roundMetric(metrics.stressScore);
  const pressurePercent = roundMetric(metrics.pressurePercent ?? metrics.pressureValue);

  if (heartRate !== null && heartRate > 0) {
    return {
      label: locale === "zh" ? "心率" : "Heart",
      value: heartRate,
      unit: "bpm",
      meta: [
        `${formatMetricLabel("focus", locale)} ${focusScore ?? "--"}`,
        `${formatMetricLabel("stress", locale)} ${stressScore ?? "--"}`,
        `${formatMetricLabel("touch", locale)} ${pressurePercent ?? 0}%`
      ]
    };
  }

  if (hrv !== null && hrv > 0) {
    return {
      label: "HRV",
      value: hrv,
      unit: "",
      meta: [
        `${formatMetricLabel("focus", locale)} ${focusScore ?? "--"}`,
        `${formatMetricLabel("stress", locale)} ${stressScore ?? "--"}`,
        `${formatMetricLabel("touch", locale)} ${pressurePercent ?? 0}%`
      ]
    };
  }

  return {
    label: formatMetricLabel("touch", locale),
    value: pressurePercent ?? 0,
    unit: "%",
    meta: [
      `${formatMetricLabel("focus", locale)} ${focusScore ?? "--"}`,
      `${formatMetricLabel("stress", locale)} ${stressScore ?? "--"}`
    ]
  };
}

export function buildDeviceMetricEntries(metrics = {}, { locale = "en" } = {}) {
  const entries = [];
  const heartRate = roundMetric(metrics.heartRate);
  const hrv = roundMetric(metrics.hrv);
  const focusScore = roundMetric(metrics.focusScore);
  const stressScore = roundMetric(metrics.stressScore);
  const pressurePercent = roundMetric(metrics.pressurePercent ?? metrics.pressureValue);
  const distanceMeters = toFiniteNumber(metrics.distanceMeters);

  if (heartRate !== null && heartRate > 0) {
    entries.push({
      label: formatMetricLabel("heart", locale) || (locale === "zh" ? "心率" : "Heart"),
      value: `${heartRate} bpm`
    });
  }

  if (hrv !== null && hrv > 0) {
    entries.push({
      label: "HRV",
      value: String(hrv)
    });
  }

  if (focusScore !== null) {
    entries.push({
      label: formatMetricLabel("focus", locale),
      value: String(focusScore)
    });
  }

  if (stressScore !== null) {
    entries.push({
      label: formatMetricLabel("stress", locale),
      value: String(stressScore)
    });
  }

  if (pressurePercent !== null) {
    entries.push({
      label: formatMetricLabel("touch", locale),
      value: `${pressurePercent}%`
    });
  }

  if (distanceMeters !== null) {
    const roundedDistance = Math.round(distanceMeters * 10) / 10;
    entries.push({
      label: formatMetricLabel("distance", locale),
      value: `${roundedDistance.toFixed(1)}m`
    });
  }

  return entries;
}
