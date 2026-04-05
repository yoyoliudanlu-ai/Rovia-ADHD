"""内存遥测缓存：BLE gateway 写入，HTTP API 读取。"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from backend.gateway.algorithms import focus_from_hrv_window


@dataclass
class TelemetryStore:
    # 手环
    wristband_name: str | None = None
    wristband_connected: bool = False
    _wristband_ts: float = field(default=0.0, repr=False)
    hrv: float | None = None
    sdnn: float | None = None
    focus: int | None = None
    focus_active: bool | None = None
    hrv_stress: int | None = None
    metrics_status: str = "offline"

    # 捏捏
    squeeze_name: str | None = None
    squeeze_connected: bool = False
    _squeeze_ts: float = field(default=0.0, repr=False)
    pressure_raw: float | None = None
    pressure_norm: float | None = None
    squeeze_stress: int | None = None
    squeeze_count: int | None = None
    battery: int | None = None

    # 在位
    rssi: float | None = None
    distance_m: float | None = None
    is_at_desk: bool = False

    _updated_at: float = field(default_factory=time.time, repr=False)
    _hrv_recent: deque[float] = field(default_factory=lambda: deque(maxlen=12), repr=False)
    _hrv_baseline: deque[float] = field(default_factory=lambda: deque(maxlen=60), repr=False)

    # ── 写入 ──────────────────────────────────────────────────

    def update_wristband(self, parsed: dict[str, Any]):
        now = time.time()
        self._wristband_ts = now
        self._updated_at = now
        self.wristband_connected = True
        if parsed.get("metrics_status"):
            self.metrics_status = parsed["metrics_status"]
        if parsed.get("hrv") is not None:
            self.hrv = parsed["hrv"]
        if parsed.get("sdnn") is not None:
            self.sdnn = parsed["sdnn"]
        # SDNN 优先，没有则用 HRV/RMSSD，填充专注度计算窗口
        hrv_feed = parsed.get("sdnn") or parsed.get("hrv")
        if hrv_feed is not None:
            v = float(hrv_feed)
            if v > 0:
                self._hrv_recent.append(v)
                self._hrv_baseline.append(v)
        computed_focus = focus_from_hrv_window(
            list(self._hrv_recent),
            list(self._hrv_baseline),
        )
        if computed_focus is not None:
            self.focus = computed_focus
        elif parsed.get("focus") is not None and self.focus is None:
            self.focus = parsed["focus"]
        if parsed.get("focus_active") is not None:
            self.focus_active = bool(parsed["focus_active"])
        if parsed.get("stress_level") is not None:
            self.hrv_stress = parsed["stress_level"]

    def update_squeeze(self, parsed: dict[str, Any]):
        now = time.time()
        self._squeeze_ts = now
        self._updated_at = now
        self.squeeze_connected = True
        if parsed.get("pressure_raw") is not None:
            self.pressure_raw = parsed["pressure_raw"]
        if parsed.get("pressure_norm") is not None:
            self.pressure_norm = parsed["pressure_norm"]
        if parsed.get("stress_level") is not None:
            self.squeeze_stress = parsed["stress_level"]
        if parsed.get("squeeze_count") is not None:
            self.squeeze_count = parsed["squeeze_count"]
        if parsed.get("battery") is not None:
            self.battery = parsed["battery"]

    def update_presence(self, rssi: float | None, distance_m: float | None, is_at_desk: bool):
        self.rssi = rssi
        self.distance_m = distance_m
        self.is_at_desk = is_at_desk
        self._updated_at = time.time()

    def set_wristband_connected(self, name: str | None = None):
        self.wristband_connected = True
        if name:
            self.wristband_name = name
        self._updated_at = time.time()

    def set_squeeze_connected(self, name: str | None = None):
        self.squeeze_connected = True
        if name:
            self.squeeze_name = name
        self._updated_at = time.time()

    def set_wristband_disconnected(self):
        self.wristband_connected = False
        self.metrics_status = "offline"

    def set_squeeze_disconnected(self):
        self.squeeze_connected = False

    # ── 读取 ──────────────────────────────────────────────────

    def wristband_last_seen_s(self) -> float | None:
        if self._wristband_ts == 0.0:
            return None
        return round(time.time() - self._wristband_ts, 1)

    def squeeze_last_seen_s(self) -> float | None:
        if self._squeeze_ts == 0.0:
            return None
        return round(time.time() - self._squeeze_ts, 1)

    def fused_stress(self) -> int | None:
        """加权融合压力评分：65% HRV 压力 + 35% 捏捏用力程度。"""
        h = self.hrv_stress
        s = self.squeeze_stress
        if h is None and s is None:
            return None
        if h is None:
            return s
        if s is None:
            return h
        return max(0, min(100, int(round(h * 0.65 + s * 0.35))))

    def snapshot(self) -> dict:
        return {
            "wristband": {
                "sdnn":          self.sdnn,
                "hrv":           self.hrv,
                "focus":         self.focus,
                "focus_active":  self.focus_active,
                "stress_level":  self.fused_stress(),
                "metrics_status": self.metrics_status,
            },
            "squeeze": {
                "pressure_raw":  self.pressure_raw,
                "pressure_norm": self.pressure_norm,
                "stress_level":  self.squeeze_stress,
                "squeeze_count": self.squeeze_count,
                "battery":       self.battery,
            },
            "presence": {
                "rssi":       self.rssi,
                "distance_m": self.distance_m,
                "is_at_desk": self.is_at_desk,
            },
            "meta": {
                "updated_at": self._updated_at,
            },
        }


# 全局单例
telemetry_store = TelemetryStore()
