function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeScanResults(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const deduped = new Map();

  for (const item of items) {
    const normalized =
      typeof item === "string"
        ? {
            name: item.trim(),
            rssi: null
          }
        : item && typeof item === "object"
          ? {
              name: String(item.name || "").trim(),
              rssi: toFiniteNumber(item.rssi)
            }
          : null;

    if (!normalized?.name) {
      continue;
    }

    const existing = deduped.get(normalized.name);
    if (!existing) {
      deduped.set(normalized.name, normalized);
      continue;
    }

    if (existing.rssi === null && normalized.rssi !== null) {
      deduped.set(normalized.name, normalized);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function resolveSelectedDeviceName(status, selectedName = "") {
  const preferred = String(status?.selected_name || "").trim();
  if (preferred) {
    return preferred;
  }

  const local = String(selectedName || "").trim();
  if (local) {
    return local;
  }

  return String(status?.device_name || "").trim();
}

export function buildDeviceConfigurePayload(selected = {}) {
  return {
    wristband: String(selected?.wristband || "").trim(),
    squeeze: String(selected?.squeeze || "").trim()
  };
}

export function buildDeviceConnectionSummary({
  status = {},
  selected = {},
  locale = "zh"
} = {}) {
  const isZh = locale !== "en";
  const wristband = String(selected?.wristband || "").trim();
  const squeeze = String(selected?.squeeze || "").trim();
  const parts = [];

  if (wristband) {
    if (status?.wristband?.connected) {
      parts.push(isZh ? "手环已连接" : "Wristband connected");
    } else if (status?.wristband?.rssi !== null && status?.wristband?.rssi !== undefined) {
      parts.push(isZh ? "手环已广播，可测距" : "Wristband discovered and available for distance sensing");
    } else {
      parts.push(isZh ? "手环未发现" : "Wristband not discovered");
    }
  }

  if (squeeze) {
    parts.push(
      status?.squeeze?.connected
        ? isZh
          ? "捏捏已连接"
          : "Squeeze connected"
        : isZh
          ? "捏捏未连接"
          : "Squeeze not connected"
    );
  }

  if (!parts.length) {
    return isZh
      ? "未选择设备，当前不会主动连接蓝牙"
      : "No device selected, so Bluetooth connections will stay idle.";
  }

  return parts.join(isZh ? "，" : ", ");
}
