const test = require("node:test");
const assert = require("node:assert/strict");

test("buildPrimarySignal prefers HRV when heart rate is unavailable", async () => {
  const { buildPrimarySignal } = await import("./body-signals.mjs");
  const result = buildPrimarySignal({
    hrv: 41.6,
    stressScore: 33,
    focusScore: 72,
    pressurePercent: 28
  });

  assert.deepEqual(result, {
    label: "HRV",
    value: 42,
    unit: "",
    meta: ["Focus 72", "Stress 33", "Touch 28%"]
  });
});

test("buildDeviceMetricEntries omits heart rate when backend does not provide bpm", async () => {
  const { buildDeviceMetricEntries } = await import("./body-signals.mjs");
  const entries = buildDeviceMetricEntries({
    hrv: 39.4,
    focusScore: 66,
    stressScore: 31,
    pressurePercent: 47,
    distanceMeters: 1.8
  });

  assert.deepEqual(entries, [
    { label: "HRV", value: "39" },
    { label: "Focus", value: "66" },
    { label: "Stress", value: "31" },
    { label: "Touch", value: "47%" },
    { label: "Distance", value: "1.8m" }
  ]);
});
