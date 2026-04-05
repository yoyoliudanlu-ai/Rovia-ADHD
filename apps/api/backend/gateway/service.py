"""End-to-end backend service: dual BLE gateway + Supabase synchronization."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from .config import GatewayConfig
from .dual_ble_gateway import DualBleGateway, PresenceState

log = logging.getLogger(__name__)


@dataclass(slots=True)
class TelemetryCache:
    hrv: float | None = None
    bpm: float | None = None
    focus: int | None = None
    stress_level: int | None = None
    pressure: float | None = None
    pressure_stress_level: int | None = None
    rssi: float | None = None
    distance_meters: float | None = None
    is_at_desk: bool = False
    updated_at: float = field(default_factory=time.time)


class BackendSyncService:
    """Coordinates BLE ingestion and persistence to Supabase."""

    def __init__(
        self,
        user_id: str,
        repository: Any,
        gateway_config: GatewayConfig,
        upload_interval_s: float = 12.0,
    ):
        self.user_id = user_id
        self.repository = repository
        self.upload_interval_s = upload_interval_s
        self._cache = TelemetryCache()

        self.gateway = DualBleGateway(
            config=gateway_config,
            on_wristband_metrics=self._on_wristband_metrics,
            on_squeeze_metrics=self._on_squeeze_metrics,
            on_presence=self._on_presence,
            on_reminder_sent=self._on_reminder,
        )
        self._running = False

    async def run_forever(self):
        self._running = True
        async with asyncio.TaskGroup() as tg:
            tg.create_task(self.gateway.run_forever())
            tg.create_task(self._telemetry_upload_loop())

    async def stop(self):
        self._running = False
        await self.gateway.stop()

    async def _telemetry_upload_loop(self):
        while self._running:
            await asyncio.sleep(self.upload_interval_s)
            try:
                self.repository.insert_telemetry(
                    user_id=self.user_id,
                    hrv=self._cache.hrv,
                    stress_level=self._cache.stress_level,
                    distance_meters=self._cache.distance_meters,
                    is_at_desk=self._cache.is_at_desk,
                    squeeze_pressure=self._cache.pressure,
                    bpm=self._cache.bpm,
                    focus_score=self._cache.focus,
                    source="dual_ble_gateway",
                )
            except Exception as exc:  # pragma: no cover - network/runtime boundary
                log.warning("Supabase telemetry sync failed: %s", exc)

    def _on_wristband_metrics(self, metrics: dict[str, Any]):
        self._cache.hrv = metrics.get("hrv")
        self._cache.bpm = metrics.get("bpm")
        self._cache.focus = metrics.get("focus")
        self._cache.stress_level = metrics.get("stress_level")
        self._cache.updated_at = time.time()

    def _on_squeeze_metrics(self, metrics: dict[str, Any]):
        self._cache.pressure = metrics.get("raw_pressure")
        self._cache.pressure_stress_level = metrics.get("pressure_stress_level")
        if metrics.get("stress_level") is not None:
            self._cache.stress_level = metrics.get("stress_level")
        self._cache.updated_at = time.time()

    def _on_presence(self, state: PresenceState):
        self._cache.rssi = state.rssi
        self._cache.distance_meters = state.distance_meters
        self._cache.is_at_desk = state.is_at_desk
        self._cache.updated_at = time.time()

    def _on_reminder(self, payload: dict[str, Any]):
        log.info("Reminder sent to wristband: %s", payload)

    # Todo sync APIs
    def add_todo(
        self,
        content: str,
        start_time: str | None = None,
        end_time: str | None = None,
        status: str = "pending",
    ) -> dict:
        return self.repository.upsert_todo(
            user_id=self.user_id,
            content=content,
            start_time=start_time,
            end_time=end_time,
            status=status,
        )

    def set_todo_completed(self, todo_id: str, is_completed: bool) -> dict:
        return self.repository.update_todo(
            user_id=self.user_id,
            todo_id=todo_id,
            status="completed" if is_completed else "pending",
        )

    def list_todos(self) -> list[dict]:
        return self.repository.list_todos(user_id=self.user_id)

    # Focus session + ranking APIs
    def start_focus_session(self, duration: int = 25, trigger_source: str = "wristband_button") -> dict:
        return self.repository.start_focus_session(
            user_id=self.user_id,
            duration=duration,
            trigger_source=trigger_source,
        )

    def finish_focus_session(self, session_id: str, status: str = "completed") -> dict:
        return self.repository.finish_focus_session(
            user_id=self.user_id,
            session_id=session_id,
            status=status,
        )

    def get_focus_ranking(self, day: str | None = None, limit: int = 20) -> list[dict]:
        return self.repository.get_focus_ranking(day=day, limit=limit)
