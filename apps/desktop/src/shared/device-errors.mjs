export function mapDeviceErrorMessage(message, { locale = "zh", fallback = "" } = {}) {
  const text = String(message || "").trim();
  const isZh = locale !== "en";

  if (!text) {
    return fallback;
  }

  if (
    text.includes("bluetooth_powered_off") ||
    text.includes("Bluetooth device is turned off") ||
    text.includes("POWERED_OFF")
  ) {
    return isZh
      ? "系统蓝牙已关闭，请先打开蓝牙后再扫描设备。"
      : "Bluetooth is turned off. Turn it on first, then scan again.";
  }

  return text || fallback;
}
