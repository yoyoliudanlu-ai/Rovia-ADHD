"""Configuration models for dual-BLE backend gateway."""

from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(slots=True)
class BleDeviceConfig:
    name: str
    notify_char_uuid: str
    write_char_uuid: str | None = None


@dataclass(slots=True)
class GatewayConfig:
    wristband: BleDeviceConfig
    squeeze: BleDeviceConfig
    reminder_rssi_threshold: int = -60
    reminder_cooldown_s: float = 45.0
    rssi_scan_interval_s: float = 3.0
    reconnect_interval_s: float = 4.0
    device_discovery_timeout_s: float = 8.0
    at_desk_rssi_threshold: int = -63


def default_gateway_config() -> GatewayConfig:
    """Build config from env with practical defaults."""
    wristband = BleDeviceConfig(
        name=os.getenv("WRISTBAND_DEVICE_NAME", "ZhiYa-Wristband"),
        notify_char_uuid=os.getenv(
            "WRISTBAND_NOTIFY_CHAR_UUID",
            "beb5483e-36e1-4688-b7f5-ea07361b26a8",
        ),
        write_char_uuid=os.getenv("WRISTBAND_ALERT_CHAR_UUID"),
    )
    squeeze = BleDeviceConfig(
        name=os.getenv("SQUEEZE_DEVICE_NAME", "ZhiYa-NieNie"),
        notify_char_uuid=os.getenv(
            "SQUEEZE_NOTIFY_CHAR_UUID",
            "de80aa2a-7f77-4a2c-9f95-3dd9f6f7f0a1",
        ),
    )
    return GatewayConfig(
        wristband=wristband,
        squeeze=squeeze,
        reminder_rssi_threshold=int(os.getenv("REMINDER_RSSI_THRESHOLD", "-60")),
        reminder_cooldown_s=float(os.getenv("REMINDER_COOLDOWN_S", "45")),
        rssi_scan_interval_s=float(os.getenv("RSSI_SCAN_INTERVAL_S", "3")),
        reconnect_interval_s=float(os.getenv("RECONNECT_INTERVAL_S", "4")),
        device_discovery_timeout_s=float(os.getenv("DISCOVERY_TIMEOUT_S", "8")),
        at_desk_rssi_threshold=int(os.getenv("AT_DESK_RSSI_THRESHOLD", "-63")),
    )

