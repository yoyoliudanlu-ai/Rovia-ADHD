"""Dual BLE gateway: wristband + squeeze device ingestion and reminder feedback."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from bleak import BleakClient, BleakScanner

from .algorithms import (
    compute_rmssd,
    compute_sdnn,
    fuse_stress,
    normalize_pressure,
    smooth_ema,
    stress_from_pressure,
    stress_from_rmssd,
)
from .config import BleDeviceConfig, GatewayConfig

log = logging.getLogger(__name__)


@dataclass(slots=True)
class PresenceState:
    rssi: float | None = None
    is_at_desk: bool = False
    distance_meters: float | None = None


class DualBleGateway:
    """Connect two BLE devices and emit unified metrics."""

    def __init__(
        self,
        config: GatewayConfig,
        on_wristband_metrics: Callable[[dict[str, Any]], None] | None = None,
        on_squeeze_metrics: Callable[[dict[str, Any]], None] | None = None,
        on_presence: Callable[[PresenceState], None] | None = None,
        on_reminder_sent: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.config = config
        self.on_wristband_metrics = on_wristband_metrics
        self.on_squeeze_metrics = on_squeeze_metrics
        self.on_presence = on_presence
        self.on_reminder_sent = on_reminder_sent

        self._running = False
        self._wristband_client: BleakClient | None = None
        self._squeeze_client: BleakClient | None = None
        self._presence = PresenceState()
        self._last_reminder_ts = 0.0
        self._pressure_smooth: float | None = None
        self._latest_pressure_stress: int | None = None
        self._latest_hrv_stress: int | None = None

    async def run_forever(self):
        self._running = True
        while self._running:
            try:
                await self._ensure_connections()
                await self._refresh_rssi_and_presence()
                await self._maybe_send_distance_reminder()
                await asyncio.sleep(self.config.rssi_scan_interval_s)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - runtime safeguard
                log.warning("Gateway loop error: %s", exc)
                await asyncio.sleep(self.config.reconnect_interval_s)

    async def stop(self):
        self._running = False
        await self._disconnect_client("wristband")
        await self._disconnect_client("squeeze")

    async def _ensure_connections(self):
        if self._wristband_client is None or not self._wristband_client.is_connected:
            self._wristband_client = await self._connect_and_subscribe(
                self.config.wristband,
                self._handle_wristband_notify,
            )
        if self._squeeze_client is None or not self._squeeze_client.is_connected:
            self._squeeze_client = await self._connect_and_subscribe(
                self.config.squeeze,
                self._handle_squeeze_notify,
            )

    async def _connect_and_subscribe(self, dev_cfg: BleDeviceConfig, cb):
        device = await BleakScanner.find_device_by_filter(
            lambda d, _ad: (d.name or "") == dev_cfg.name,
            timeout=self.config.device_discovery_timeout_s,
        )
        if device is None:
            raise RuntimeError(f"BLE device not found: {dev_cfg.name}")

        client = BleakClient(device)
        await client.connect()
        await client.start_notify(dev_cfg.notify_char_uuid, cb)
        log.info("Connected BLE device: %s", dev_cfg.name)
        return client

    async def _disconnect_client(self, which: str):
        client = self._wristband_client if which == "wristband" else self._squeeze_client
        if client is None:
            return
        with contextlib.suppress(Exception):
            if client.is_connected:
                await client.disconnect()
        if which == "wristband":
            self._wristband_client = None
        else:
            self._squeeze_client = None

    async def _refresh_rssi_and_presence(self):
        devices = await BleakScanner.discover(timeout=1.2)
        target = next((d for d in devices if (d.name or "") == self.config.wristband.name), None)
        if target is None or target.rssi is None:
            self._presence.rssi = None
            self._presence.is_at_desk = False
            self._presence.distance_meters = None
            self._emit_presence()
            return

        rssi = float(target.rssi)
        self._presence.rssi = rssi
        self._presence.is_at_desk = rssi >= self.config.at_desk_rssi_threshold
        # Simple free-space approximation at TxPower=-59dBm, n=2.4.
        self._presence.distance_meters = round(10 ** ((-59.0 - rssi) / (10 * 2.4)), 3)
        self._emit_presence()

    async def _maybe_send_distance_reminder(self):
        if self._presence.rssi is None:
            return
        if self._presence.rssi > self.config.reminder_rssi_threshold:
            return
        if self._wristband_client is None or not self._wristband_client.is_connected:
            return
        write_uuid = self.config.wristband.write_char_uuid
        if not write_uuid:
            return

        now = time.monotonic()
        if now - self._last_reminder_ts < self.config.reminder_cooldown_s:
            return

        payload = {
            "type": "distance_alert",
            "rssi": round(self._presence.rssi, 1),
            "threshold": self.config.reminder_rssi_threshold,
            "message": "你离桌面有点远了，先回来继续当前任务吧",
        }
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        await self._wristband_client.write_gatt_char(write_uuid, raw, response=False)
        self._last_reminder_ts = now
        if self.on_reminder_sent:
            self.on_reminder_sent(payload)

    def _handle_wristband_notify(self, _handle: int, data: bytearray):
        payload = self._decode_payload(bytes(data))
        if not payload:
            return

        rr = self._extract_rr_intervals(payload)
        rmssd = self._to_float(payload.get("rmssd")) or compute_rmssd(rr)
        sdnn = self._to_float(payload.get("sdnn")) or compute_sdnn(rr)
        bpm = self._to_float(payload.get("bpm"))
        focus = self._to_int(payload.get("focus"))
        hrv_stress = self._to_int(payload.get("stress"))
        if hrv_stress is None:
            hrv_stress = stress_from_rmssd(rmssd)

        self._latest_hrv_stress = hrv_stress
        stress_level = fuse_stress(self._latest_hrv_stress, self._latest_pressure_stress)
        metrics = {
            "metrics_status": payload.get("status", "ready"),
            "bpm": bpm,
            "hrv": rmssd,
            "sdnn": sdnn,
            "focus": focus,
            "stress_level": stress_level,
            "hrv_stress_level": hrv_stress,
            "pressure_stress_level": self._latest_pressure_stress,
        }
        if self.on_wristband_metrics:
            self.on_wristband_metrics(metrics)

    def _handle_squeeze_notify(self, _handle: int, data: bytearray):
        payload = self._decode_payload(bytes(data))
        if payload and "pressure" in payload:
            raw_pressure = self._to_float(payload.get("pressure"))
        else:
            raw_pressure = self._decode_binary_pressure(bytes(data))
        if raw_pressure is None:
            return

        normalized = normalize_pressure(raw_pressure)
        self._pressure_smooth = smooth_ema(self._pressure_smooth, normalized)
        pressure_stress = stress_from_pressure(self._pressure_smooth)
        self._latest_pressure_stress = pressure_stress
        stress_level = fuse_stress(self._latest_hrv_stress, pressure_stress)
        metrics = {
            "raw_pressure": raw_pressure,
            "normalized_pressure": round(self._pressure_smooth, 4),
            "pressure_stress_level": pressure_stress,
            "stress_level": stress_level,
        }
        if self.on_squeeze_metrics:
            self.on_squeeze_metrics(metrics)

    def _emit_presence(self):
        if self.on_presence:
            self.on_presence(
                PresenceState(
                    rssi=self._presence.rssi,
                    is_at_desk=self._presence.is_at_desk,
                    distance_meters=self._presence.distance_meters,
                )
            )

    @staticmethod
    def _extract_rr_intervals(payload: dict[str, Any]) -> list[float]:
        for key in ("rr_intervals", "rr_ms", "ibi_ms", "ibi"):
            v = payload.get(key)
            if isinstance(v, list):
                out: list[float] = []
                for item in v:
                    x = DualBleGateway._to_float(item)
                    if x is not None:
                        out.append(x)
                return out
        return []

    @staticmethod
    def _decode_payload(raw: bytes) -> dict[str, Any]:
        try:
            txt = raw.decode("utf-8", errors="ignore").strip()
            if not txt:
                return {}
            return json.loads(txt)
        except Exception:
            return {}

    @staticmethod
    def _decode_binary_pressure(raw: bytes) -> float | None:
        # Common simple payloads:
        # - uint16 little-endian
        # - uint32 little-endian
        if len(raw) >= 2:
            return float(int.from_bytes(raw[:2], "little", signed=False))
        return None

    @staticmethod
    def _to_float(v: Any) -> float | None:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    @staticmethod
    def _to_int(v: Any) -> int | None:
        try:
            if v is None:
                return None
            return int(v)
        except Exception:
            return None

