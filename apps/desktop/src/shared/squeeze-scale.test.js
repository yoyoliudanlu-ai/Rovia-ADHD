import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PET_SCALE,
  MAX_PET_SCALE,
  mapSqueezeRawToScale,
  resolveSqueezeScaleTarget
} from "./squeeze-scale.mjs";

test("mapSqueezeRawToScale maps 0-4095 to the default-to-max pet scale range", () => {
  assert.equal(mapSqueezeRawToScale(0), DEFAULT_PET_SCALE);
  assert.equal(mapSqueezeRawToScale(4095), MAX_PET_SCALE);
  assert.equal(Math.round(mapSqueezeRawToScale(2048) * 1000) / 1000, 1.175);
});

test("resolveSqueezeScaleTarget returns to default when raw data stops changing", () => {
  assert.equal(
    resolveSqueezeScaleTarget({
      pressureRaw: 3200,
      lastChangedAt: 1000,
      nowMs: 1200
    }),
    mapSqueezeRawToScale(3200)
  );

  assert.equal(
    resolveSqueezeScaleTarget({
      pressureRaw: 3200,
      lastChangedAt: 1000,
      nowMs: 1500
    }),
    DEFAULT_PET_SCALE
  );
});
