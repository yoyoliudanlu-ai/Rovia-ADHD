import test from "node:test";
import assert from "node:assert/strict";

import { mapDeviceErrorMessage } from "./device-errors.mjs";

test("mapDeviceErrorMessage translates powered-off bluetooth errors", () => {
  assert.equal(
    mapDeviceErrorMessage(
      "[backend] GET /api/devices/scan?timeout=5 failed: 503 BLE scan failed: ('Bluetooth device is turned off', <BleakBluetoothNotAvailableReason.POWERED_OFF: 3>)",
      { locale: "zh", fallback: "扫描设备失败。" }
    ),
    "系统蓝牙已关闭，请先打开蓝牙后再扫描设备。"
  );
});
