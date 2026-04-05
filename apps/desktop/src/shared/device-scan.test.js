import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeviceConnectionSummary,
  buildDeviceConfigurePayload,
  normalizeScanResults,
  resolveSelectedDeviceName
} from "./device-scan.mjs";

test("normalizeScanResults accepts backend string arrays and object arrays", () => {
  assert.deepEqual(
    normalizeScanResults([
      "Band-001",
      { name: "NieNie-001", rssi: -61 },
      { name: "Band-001", rssi: -52 },
      "",
      null
    ]),
    [
      { name: "Band-001", rssi: -52 },
      { name: "NieNie-001", rssi: -61 }
    ]
  );
});

test("resolveSelectedDeviceName falls back to locally selected name when status has no selected_name", () => {
  assert.equal(
    resolveSelectedDeviceName(
      {
        connected: false,
        device_name: null
      },
      "Band-001"
    ),
    "Band-001"
  );
});

test("buildDeviceConnectionSummary follows the legacy desktop_pet wording", () => {
  assert.equal(
    buildDeviceConnectionSummary({
      locale: "zh",
      selected: {
        wristband: "Band-001",
        squeeze: "NieNie-001"
      },
      status: {
        wristband: {
          connected: false,
          rssi: -58
        },
        squeeze: {
          connected: true
        }
      }
    }),
    "手环已广播，可测距，捏捏已连接"
  );
});

test("buildDeviceConnectionSummary returns the legacy empty-state copy when nothing is selected", () => {
  assert.equal(
    buildDeviceConnectionSummary({
      locale: "zh",
      selected: {
        wristband: "",
        squeeze: ""
      },
      status: {}
    }),
    "未选择设备，当前不会主动连接蓝牙"
  );
});

test("buildDeviceConfigurePayload trims both selected device names", () => {
  assert.deepEqual(
    buildDeviceConfigurePayload({
      wristband: "  Band-001  ",
      squeeze: " NieNie-001 "
    }),
    {
      wristband: "Band-001",
      squeeze: "NieNie-001"
    }
  );
});
