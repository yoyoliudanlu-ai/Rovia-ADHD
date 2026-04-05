import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PET_SCALE,
  MAX_PET_SCALE,
  SQUEEZE_RAW_IDLE_THRESHOLD,
  SQUEEZE_SCALE_RETURN_MS,
  mapSqueezeRawToScale,
  resolveSqueezeScaleTarget
} from "./squeeze-scale.mjs";

test("mapSqueezeRawToScale keeps 100% below threshold and maps active range to max scale", () => {
  assert.equal(mapSqueezeRawToScale(0), DEFAULT_PET_SCALE);
  assert.equal(mapSqueezeRawToScale(SQUEEZE_RAW_IDLE_THRESHOLD - 1), DEFAULT_PET_SCALE);
  assert.equal(mapSqueezeRawToScale(SQUEEZE_RAW_IDLE_THRESHOLD), DEFAULT_PET_SCALE);
  assert.equal(mapSqueezeRawToScale(4095), MAX_PET_SCALE);
  assert.equal(Math.round(mapSqueezeRawToScale(2048) * 1000) / 1000, 1.151);
});

test("resolveSqueezeScaleTarget follows live pressure but returns to default when stale", () => {
  const nowMs = 10_000;

  // 压力值刚变化，保持按当前压力映射尺寸
  assert.equal(
    resolveSqueezeScaleTarget({
      pressureRaw: 3200,
      lastChangedAt: nowMs - 50,
      nowMs
    }),
    mapSqueezeRawToScale(3200)
  );
  assert.equal(
    resolveSqueezeScaleTarget({
      pressureRaw: 4095,
      lastChangedAt: nowMs - 50,
      nowMs
    }),
    MAX_PET_SCALE
  );

  // 压力值长时间不变化，恢复默认尺寸
  assert.equal(
    resolveSqueezeScaleTarget({
      pressureRaw: 3200,
      lastChangedAt: nowMs - SQUEEZE_SCALE_RETURN_MS - 1,
      nowMs
    }),
    DEFAULT_PET_SCALE
  );

  // 压力低于阈值或无数据时，统一保持默认尺寸（100%）
  assert.equal(resolveSqueezeScaleTarget({ pressureRaw: 0, nowMs }), DEFAULT_PET_SCALE);
  assert.equal(resolveSqueezeScaleTarget({ pressureRaw: 450, nowMs }), DEFAULT_PET_SCALE);
  assert.equal(resolveSqueezeScaleTarget({ nowMs }), DEFAULT_PET_SCALE);
});
