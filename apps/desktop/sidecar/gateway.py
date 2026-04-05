#!/usr/bin/env python3
import argparse
import asyncio
import json
import math
import os
import random
import statistics
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Deque, Optional, Set

from bleak import BleakClient, BleakScanner
from dotenv import load_dotenv
from supabase import create_client
import websockets


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def parse_bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_environment() -> None:
    root_dir = Path(__file__).resolve().parents[1]
    candidates = [
        Path(__file__).resolve().with_name(".env"),
        root_dir / ".env",
        root_dir / "backend" / "supabase" / ".env",
    ]
    for candidate in candidates:
        if candidate.exists():
            load_dotenv(candidate, override=False)


def parse_hex_payload(payload: str) -> bytes:
    clean = payload.replace(" ", "").strip()
    if not clean:
        return b""
    return bytes.fromhex(clean)


def estimate_distance_meters(rssi: Optional[int], tx_power: int = -59, factor: float = 2.2):
    if rssi is None:
        return None
    return round(10 ** ((tx_power - rssi) / (10 * factor)), 2)


def derive_presence_state(distance_meters: Optional[float]) -> str:
    if distance_meters is None:
        return "far"
    return "near" if distance_meters <= 1.5 else "far"


def derive_pressure_level(pressure_value: float) -> str:
    if pressure_value >= 80:
        return "squeeze"
    if pressure_value >= 55:
        return "firm"
    if pressure_value >= 25:
        return "light"
    return "idle"


def derive_physio_state(hrv: float, stress_score: int) -> str:
    if stress_score >= 75 or hrv <= 28:
        return "strained"
    if stress_score <= 45 and hrv >= 35:
        return "ready"
    return "unknown"


def parse_json_payload(payload: bytes) -> dict:
    try:
        return json.loads(payload.decode("utf-8"))
    except Exception:
        return {}


def first_present(data: dict, keys) -> Optional[object]:
    for key in keys:
        if key in data and data.get(key) is not None:
            return data.get(key)
    return None


def to_float(value: object) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def to_int(value: object) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(round(float(value)))
    except Exception:
        return None


def normalize_rr_values(value: object) -> list[float]:
    if isinstance(value, list):
        normalized = []
        for item in value:
            rr_value = to_float(item)
            if rr_value is not None:
                normalized.append(rr_value)
        return normalized
    return []


def parse_band_json_payload(payload: bytes) -> dict:
    data = parse_json_payload(payload)
    if not data:
        return {}

    heart_rate = to_float(
        first_present(data, ["heartRate", "heart_rate", "bpm"])
    )
    hrv = to_float(first_present(data, ["hrv", "rmssd"]))
    sdnn = to_float(first_present(data, ["sdnn"]))
    focus_score = to_int(first_present(data, ["focus", "focusScore", "focus_score"]))
    stress_score = to_int(
        first_present(data, ["stress", "stressLevel", "stress_level"])
    )

    if stress_score is None and focus_score is not None:
        stress_score = max(0, min(100, 100 - focus_score))

    return {
        "timestamp": first_present(
            data,
            ["timestamp", "time", "sampleAt", "sample_at", "recordedAt", "recorded_at"],
        ),
        "value": to_float(first_present(data, ["value"])),
        "heart_rate": heart_rate,
        "rr_intervals_ms": normalize_rr_values(
            first_present(data, ["rrIntervalsMs", "rr_intervals_ms", "rr_ms", "ibi_ms", "ibi"])
        ),
        "hrv": hrv,
        "sdnn": sdnn,
        "focus_score": focus_score,
        "stress_score": stress_score,
        "metrics_status": first_present(data, ["status"]),
    }


def parse_heart_rate_measurement(payload: bytes) -> dict:
    if not payload:
        return {}

    flags = payload[0]
    offset = 1
    is_heart_rate_uint16 = bool(flags & 0x01)

    if is_heart_rate_uint16:
        if len(payload) < 3:
            return {}
        heart_rate = int.from_bytes(payload[offset : offset + 2], "little")
        offset += 2
    else:
        if len(payload) < 2:
            return {}
        heart_rate = payload[offset]
        offset += 1

    if flags & 0x08:
        offset += 2

    rr_intervals_ms = []
    if flags & 0x10:
        while offset + 1 < len(payload):
            raw_rr = int.from_bytes(payload[offset : offset + 2], "little")
            rr_intervals_ms.append(round(raw_rr / 1024 * 1000, 2))
            offset += 2

    return {
        "heart_rate": heart_rate,
        "rr_intervals_ms": rr_intervals_ms,
    }


def parse_band_measurement(payload: bytes, data_format: str) -> dict:
    if data_format == "json-timestamp-value":
        return parse_band_json_payload(payload)

    if data_format == "json":
        return parse_band_json_payload(payload)

    if data_format == "rr-ms-u16":
        if len(payload) < 2:
            return {}
        rr_ms = int.from_bytes(payload[:2], "little")
        return {
            "timestamp": None,
            "value": rr_ms,
            "heart_rate": round(60000 / rr_ms) if rr_ms else None,
            "rr_intervals_ms": [rr_ms],
        }

    if data_format == "ascii-timestamp-value":
        try:
            raw = payload.decode("utf-8").strip()
            timestamp, value = raw.split(",", 1)
            return {
                "timestamp": timestamp.strip(),
                "value": float(value.strip()),
                "heart_rate": None,
                "rr_intervals_ms": [],
                "hrv": None,
                "sdnn": None,
                "focus_score": None,
                "stress_score": None,
            }
        except Exception:
            return {}

    return parse_heart_rate_measurement(payload)


def parse_pressure_measurement(payload: bytes, data_format: str) -> Optional[float]:
    if not payload:
        return None

    if data_format == "json":
        data = parse_json_payload(payload)
        value = first_present(
            data,
            ["pressure", "squeeze_pressure", "value", "raw", "adc"],
        )
        return float(value) if value is not None else None

    if data_format == "float32-le":
        if len(payload) < 4:
            return None
        import struct

        return float(struct.unpack("<f", payload[:4])[0])

    if data_format == "ascii-number":
        try:
            return float(payload.decode("utf-8").strip())
        except Exception:
            return None

    if len(payload) >= 2:
        return float(int.from_bytes(payload[:2], "little"))

    return float(payload[0])


@dataclass
class DeviceConfig:
    address: Optional[str]
    name: Optional[str]
    measurement_char_uuid: Optional[str]
    trigger_char_uuid: Optional[str] = None
    write_char_uuid: Optional[str] = None
    data_format: str = "json"
    value_kind: str = "raw"


@dataclass
class RssiConfig:
    threshold: int = -60
    poll_interval_sec: float = 4.0
    alert_cooldown_sec: float = 25.0
    tx_power: int = -59
    path_loss_factor: float = 2.2
    reminder_payload_hex: str = "01"


@dataclass
class PressureConfig:
    raw_min: float = 0.0
    raw_max: float = 4095.0
    smoothing_alpha: float = 0.35
    trigger_percent: float = 78.0
    trigger_cooldown_sec: float = 20.0


@dataclass
class SupabaseConfig:
    enabled: bool
    url: Optional[str]
    key: Optional[str]
    user_id: Optional[str]
    email: Optional[str]
    password: Optional[str]


@dataclass
class TelemetrySnapshot:
    heart_rate: Optional[float]
    hrv: float
    sdnn: Optional[float]
    focus_score: Optional[int]
    stress_score: int
    pressure_value: float
    pressure_raw: Optional[int]
    pressure_level: str
    wearable_rssi: Optional[int]
    distance_meters: Optional[float]
    presence_state: str
    physio_state: str
    recorded_at: str
    source_device: str = "sidecar_hub"

    def to_event(self, synced_by_sidecar: bool = False) -> dict:
        return {
            "type": "telemetry",
            "deviceId": self.source_device,
            "sourceDevice": self.source_device,
            "heartRate": self.heart_rate,
            "hrv": self.hrv,
            "sdnn": self.sdnn,
            "focusScore": self.focus_score,
            "stressScore": self.stress_score,
            "pressureValue": self.pressure_value,
            "pressurePercent": self.pressure_value,
            "pressureRaw": self.pressure_raw,
            "pressureLevel": self.pressure_level,
            "wearableRssi": self.wearable_rssi,
            "distanceMeters": self.distance_meters,
            "presenceState": self.presence_state,
            "physioState": self.physio_state,
            "recordedAt": self.recorded_at,
            "timestamp": self.recorded_at,
            "syncedBySidecar": synced_by_sidecar,
        }

    def to_supabase_row(self, user_id: str) -> dict:
        return {
            "user_id": user_id,
            "heart_rate": self.heart_rate,
            "hrv": self.hrv,
            "sdnn": self.sdnn,
            "focus_score": self.focus_score,
            "stress_level": self.stress_score,
            "distance_meters": self.distance_meters,
            "wearable_rssi": self.wearable_rssi,
            "squeeze_pressure": self.pressure_raw
            if self.pressure_raw is not None
            else self.pressure_value,
            "squeeze_level": self.pressure_level,
            "source_device": self.source_device,
            "physio_state": self.physio_state,
            "is_at_desk": self.presence_state == "near",
            "recorded_at": self.recorded_at,
        }


class HRVProcessor:
    def __init__(self, max_samples: int = 90):
        self.rr_intervals_ms: Deque[float] = deque(maxlen=max_samples)
        self.last_hr: Optional[float] = None

    def ingest_heart_rate(self, heart_rate: Optional[float]) -> None:
        if heart_rate and heart_rate > 0:
            self.last_hr = float(heart_rate)
            self.ingest_rr_ms(60000.0 / float(heart_rate))

    def ingest_rr_ms(self, rr_ms: float) -> None:
        if rr_ms and 250 <= rr_ms <= 2000:
            self.rr_intervals_ms.append(float(rr_ms))

    def ingest_rr_batch(self, rr_values_ms) -> None:
        for rr_ms in rr_values_ms or []:
            self.ingest_rr_ms(float(rr_ms))

    def compute_rmssd(self) -> float:
        if len(self.rr_intervals_ms) < 3:
            return 0.0
        diffs = [
            self.rr_intervals_ms[index + 1] - self.rr_intervals_ms[index]
            for index in range(len(self.rr_intervals_ms) - 1)
        ]
        if not diffs:
            return 0.0
        return round(math.sqrt(sum(diff * diff for diff in diffs) / len(diffs)), 2)

    def compute_sdnn(self) -> float:
        if len(self.rr_intervals_ms) < 2:
            return 0.0
        return round(statistics.pstdev(self.rr_intervals_ms), 2)


class PressureProcessor:
    def __init__(self, config: PressureConfig):
        self.config = config
        self.smoothed_percent = 0.0

    def ingest(self, raw_value: float) -> tuple[float, str]:
        normalized = clamp(
            (raw_value - self.config.raw_min)
            / max(1.0, self.config.raw_max - self.config.raw_min),
            0.0,
            1.0,
        )
        normalized_percent = round(normalized * 100, 2)
        if self.smoothed_percent == 0:
            self.smoothed_percent = normalized_percent
        else:
            self.smoothed_percent = round(
                self.config.smoothing_alpha * normalized_percent
                + (1 - self.config.smoothing_alpha) * self.smoothed_percent,
                2,
            )
        return self.smoothed_percent, derive_pressure_level(self.smoothed_percent)


class SupabaseSyncer:
    def __init__(self, config: SupabaseConfig):
        self.config = config
        self.client = None

    async def init(self) -> None:
        if not self.config.enabled or not self.config.url or not self.config.key:
            return

        self.client = create_client(self.config.url, self.config.key)

        if self.config.email and self.config.password:
            await asyncio.to_thread(
                self.client.auth.sign_in_with_password,
                {
                    "email": self.config.email,
                    "password": self.config.password,
                },
            )

    def is_enabled(self) -> bool:
        return bool(self.client and self.config.user_id)

    async def insert_telemetry(self, snapshot: TelemetrySnapshot) -> bool:
        if not self.is_enabled():
            return False

        payload = snapshot.to_supabase_row(self.config.user_id)
        try:
            await asyncio.to_thread(
                self.client.table("telemetry_data").insert(payload).execute
            )
            return True
        except Exception as error:
            print(f"[rovia-sidecar] supabase telemetry insert failed: {error}", flush=True)
            return False

    async def insert_app_event(self, event_type: str, payload: dict) -> bool:
        if not self.is_enabled():
            return False

        try:
            await asyncio.to_thread(
                self.client.table("app_events")
                .insert(
                    {
                        "user_id": self.config.user_id,
                        "event_type": event_type,
                        "payload": payload,
                        "created_at": now_iso(),
                    }
                )
                .execute
            )
            return True
        except Exception as error:
            print(f"[rovia-sidecar] supabase event insert failed: {error}", flush=True)
            return False


class RoviaGateway:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()

    async def handler(self, websocket):
        self.clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            self.clients.discard(websocket)

    async def broadcast(self, event: dict) -> None:
        if not self.clients:
            return

        payload = json.dumps(event, ensure_ascii=True)
        stale_clients = set()
        for client in self.clients:
            try:
                await client.send(payload)
            except Exception:
                stale_clients.add(client)

        for client in stale_clients:
            self.clients.discard(client)

    async def run(self) -> None:
        async with websockets.serve(self.handler, self.host, self.port):
            print(
                f"[rovia-sidecar] websocket ready on ws://{self.host}:{self.port}",
                flush=True,
            )
            await asyncio.Future()


class DualBleOrchestrator:
    def __init__(
        self,
        gateway: RoviaGateway,
        band: DeviceConfig,
        squeeze: DeviceConfig,
        rssi: RssiConfig,
        pressure: PressureConfig,
        supabase_syncer: SupabaseSyncer,
        telemetry_interval_sec: float,
        simulate: bool,
    ):
        self.gateway = gateway
        self.band = band
        self.squeeze = squeeze
        self.rssi = rssi
        self.pressure = pressure
        self.supabase_syncer = supabase_syncer
        self.telemetry_interval_sec = telemetry_interval_sec
        self.simulate = simulate

        self.band_client: Optional[BleakClient] = None
        self.squeeze_client: Optional[BleakClient] = None

        self.hrv_processor = HRVProcessor()
        self.pressure_processor = PressureProcessor(pressure)

        self.last_pressure_raw: Optional[float] = None
        self.last_pressure_percent = 0.0
        self.last_pressure_level = "idle"
        self.last_rssi: Optional[int] = None
        self.last_distance_meters: Optional[float] = None
        self.last_band_sample_at: Optional[str] = None
        self.last_band_raw_value: Optional[float] = None
        self.last_band_heart_rate: Optional[float] = None
        self.last_band_hrv: Optional[float] = None
        self.last_band_sdnn: Optional[float] = None
        self.last_band_focus_score: Optional[int] = None
        self.last_band_stress_score: Optional[int] = None
        self.last_telemetry_at = 0.0
        self.last_band_alert_at = 0.0
        self.last_squeeze_trigger_at = 0.0
        self.last_squeeze_pulse_at = 0.0
        self.squeeze_active = False

    async def run(self) -> None:
        tasks = [asyncio.create_task(self.telemetry_publish_loop())]

        if self.simulate:
            tasks.append(asyncio.create_task(self.simulated_loop()))
        else:
            tasks.extend(
                [
                    asyncio.create_task(self.band_connection_loop()),
                    asyncio.create_task(self.squeeze_connection_loop()),
                    asyncio.create_task(self.rssi_monitor_loop()),
                ]
            )

        await asyncio.gather(*tasks)

    async def simulated_loop(self) -> None:
        while True:
            self.last_rssi = random.randint(-74, -48)
            self.last_distance_meters = estimate_distance_meters(
                self.last_rssi,
                tx_power=self.rssi.tx_power,
                factor=self.rssi.path_loss_factor,
            )

            heart_rate = random.randint(58, 94)
            self.hrv_processor.ingest_heart_rate(heart_rate)
            self.hrv_processor.ingest_rr_batch(
                [
                    random.randint(620, 980),
                    random.randint(630, 990),
                    random.randint(640, 1000),
                ]
            )

            raw_pressure = random.uniform(
                self.pressure.raw_min,
                self.pressure.raw_max,
            )
            self.last_pressure_raw = raw_pressure
            self.last_pressure_percent, self.last_pressure_level = self.pressure_processor.ingest(
                raw_pressure
            )
            await self.maybe_emit_squeeze_pulse()

            if random.random() > 0.86:
                await self.emit_enter_task("squeeze_sim")

            await self.maybe_send_band_alert()
            await asyncio.sleep(4)

    async def find_device(self, config: DeviceConfig):
        if not config.address and not config.name:
            return None

        def matches(device, advertisement) -> bool:
            if config.address and device.address.lower() == config.address.lower():
                return True
            if config.name and device.name == config.name:
                return True
            local_name = getattr(advertisement, "local_name", None)
            return bool(config.name and local_name == config.name)

        return await BleakScanner.find_device_by_filter(matches, timeout=10.0)

    async def band_connection_loop(self) -> None:
        while True:
            if not self.band.measurement_char_uuid:
                print(
                    "[rovia-sidecar] BAND measurement UUID is missing, skip band loop.",
                    flush=True,
                )
                await asyncio.sleep(30)
                continue

            device = await self.find_device(self.band)
            if not device:
                print("[rovia-sidecar] band not found, retrying...", flush=True)
                await asyncio.sleep(4)
                continue

            try:
                async with BleakClient(device) as client:
                    self.band_client = client
                    print(
                        f"[rovia-sidecar] band connected: {device.name or device.address}",
                        flush=True,
                    )

                    await client.start_notify(
                        self.band.measurement_char_uuid,
                        self._handle_band_measurement_notification,
                    )

                    if self.band.trigger_char_uuid:
                        await client.start_notify(
                            self.band.trigger_char_uuid,
                            self._handle_band_trigger_notification,
                        )

                    while client.is_connected:
                        await asyncio.sleep(1)
            except Exception as error:
                print(f"[rovia-sidecar] band loop error: {error}", flush=True)
            finally:
                self.band_client = None
                await asyncio.sleep(2)

    async def squeeze_connection_loop(self) -> None:
        while True:
            if not self.squeeze.measurement_char_uuid:
                print(
                    "[rovia-sidecar] SQUEEZE measurement UUID is missing, skip squeeze loop.",
                    flush=True,
                )
                await asyncio.sleep(30)
                continue

            device = await self.find_device(self.squeeze)
            if not device:
                print("[rovia-sidecar] squeeze device not found, retrying...", flush=True)
                await asyncio.sleep(4)
                continue

            try:
                async with BleakClient(device) as client:
                    self.squeeze_client = client
                    print(
                        f"[rovia-sidecar] squeeze connected: {device.name or device.address}",
                        flush=True,
                    )

                    await client.start_notify(
                        self.squeeze.measurement_char_uuid,
                        self._handle_squeeze_measurement_notification,
                    )

                    if self.squeeze.trigger_char_uuid:
                        await client.start_notify(
                            self.squeeze.trigger_char_uuid,
                            self._handle_squeeze_trigger_notification,
                        )

                    while client.is_connected:
                        await asyncio.sleep(1)
            except Exception as error:
                print(f"[rovia-sidecar] squeeze loop error: {error}", flush=True)
            finally:
                self.squeeze_client = None
                await asyncio.sleep(2)

    async def rssi_monitor_loop(self) -> None:
        while True:
            try:
                discoveries = await BleakScanner.discover(timeout=3.0, return_adv=True)
                for address, (device, advertisement) in discoveries.items():
                    if self.band.address and address.lower() == self.band.address.lower():
                        self.last_rssi = advertisement.rssi
                        break
                    if self.band.name and (
                        device.name == self.band.name
                        or getattr(advertisement, "local_name", None) == self.band.name
                    ):
                        self.last_rssi = advertisement.rssi
                        break

                self.last_distance_meters = estimate_distance_meters(
                    self.last_rssi,
                    tx_power=self.rssi.tx_power,
                    factor=self.rssi.path_loss_factor,
                )
                await self.maybe_send_band_alert()
            except Exception as error:
                print(f"[rovia-sidecar] rssi monitor error: {error}", flush=True)

            await asyncio.sleep(self.rssi.poll_interval_sec)

    def _handle_band_measurement_notification(self, _sender, payload: bytearray) -> None:
        asyncio.create_task(self.handle_band_measurement(bytes(payload)))

    def _handle_band_trigger_notification(self, _sender, payload: bytearray) -> None:
        asyncio.create_task(self.handle_band_trigger(bytes(payload)))

    def _handle_squeeze_measurement_notification(self, _sender, payload: bytearray) -> None:
        asyncio.create_task(self.handle_squeeze_measurement(bytes(payload)))

    def _handle_squeeze_trigger_notification(self, _sender, payload: bytearray) -> None:
        asyncio.create_task(self.handle_squeeze_trigger(bytes(payload)))

    async def handle_band_measurement(self, payload: bytes) -> None:
        measurement = parse_band_measurement(payload, self.band.data_format)
        if not measurement:
            return

        metrics_status = measurement.get("metrics_status")
        if metrics_status and str(metrics_status) != "ready":
            self.last_band_sample_at = now_iso()
            self.last_telemetry_at = time.monotonic()
            return

        timestamp = measurement.get("timestamp")
        value = measurement.get("value")
        heart_rate = measurement.get("heart_rate")
        rr_intervals_ms = measurement.get("rr_intervals_ms") or []
        hrv = measurement.get("hrv")
        sdnn = measurement.get("sdnn")
        focus_score = measurement.get("focus_score")
        stress_score = measurement.get("stress_score")

        if timestamp:
            self.last_band_sample_at = str(timestamp)

        if value is not None:
            self.last_band_raw_value = float(value)
            if self.band.value_kind == "heart_rate":
                self.hrv_processor.ingest_heart_rate(float(value))
            elif self.band.value_kind in {"rr_ms", "rr-interval"}:
                self.hrv_processor.ingest_rr_ms(float(value))

        if heart_rate is not None:
            self.last_band_heart_rate = float(heart_rate)
        if hrv is not None:
            self.last_band_hrv = float(hrv)
        if sdnn is not None:
            self.last_band_sdnn = float(sdnn)
        if focus_score is not None:
            self.last_band_focus_score = int(focus_score)
        if stress_score is not None:
            self.last_band_stress_score = int(stress_score)

        self.hrv_processor.ingest_heart_rate(heart_rate)
        self.hrv_processor.ingest_rr_batch(rr_intervals_ms)
        self.last_telemetry_at = time.monotonic()

    async def handle_band_trigger(self, payload: bytes) -> None:
        data = parse_json_payload(payload)
        action = data.get("action") if data else None

        if action == "enter_task" or payload:
            await self.emit_enter_task("band_button")

    async def handle_squeeze_measurement(self, payload: bytes) -> None:
        raw_pressure = parse_pressure_measurement(payload, self.squeeze.data_format)
        if raw_pressure is None:
            return

        self.last_pressure_raw = raw_pressure
        self.last_pressure_percent, self.last_pressure_level = self.pressure_processor.ingest(
            raw_pressure
        )
        self.last_telemetry_at = time.monotonic()
        await self.maybe_emit_squeeze_pulse()

        if (
            self.last_pressure_percent >= self.pressure.trigger_percent
            and time.monotonic() - self.last_squeeze_trigger_at
            >= self.pressure.trigger_cooldown_sec
        ):
            self.last_squeeze_trigger_at = time.monotonic()
            await self.emit_enter_task("squeeze_pressure")

    async def maybe_emit_squeeze_pulse(self) -> None:
        is_active = self.last_pressure_level != "idle" or self.last_pressure_percent >= 25
        now_mono = time.monotonic()

        if is_active and not self.squeeze_active and now_mono - self.last_squeeze_pulse_at >= 0.45:
            self.last_squeeze_pulse_at = now_mono
            event = {
                "type": "squeeze_pulse",
                "deviceId": self.squeeze.name or self.squeeze.address or "squeeze_01",
                "sourceDevice": self.squeeze.name or self.squeeze.address or "squeeze_01",
                "pressureValue": self.last_pressure_percent,
                "pressurePercent": self.last_pressure_percent,
                "pressureRaw": round(self.last_pressure_raw)
                if self.last_pressure_raw is not None
                else None,
                "pressureLevel": self.last_pressure_level,
                "timestamp": now_iso(),
            }
            await self.gateway.broadcast(event)

        self.squeeze_active = is_active

    async def handle_squeeze_trigger(self, payload: bytes) -> None:
        if payload:
            await self.emit_enter_task("squeeze_trigger")

    async def emit_enter_task(self, source: str) -> None:
        event = {
            "type": "enter_task",
            "deviceId": self.squeeze.name or self.squeeze.address or "squeeze_01",
            "source": source,
            "pressureValue": self.last_pressure_percent,
            "pressurePercent": self.last_pressure_percent,
            "pressureRaw": round(self.last_pressure_raw)
            if self.last_pressure_raw is not None
            else None,
            "pressureLevel": self.last_pressure_level,
            "timestamp": now_iso(),
        }
        await self.gateway.broadcast(event)
        await self.supabase_syncer.insert_app_event("enter_task", event)

    def build_snapshot(self) -> TelemetrySnapshot:
        hrv = round(self.last_band_hrv, 2) if self.last_band_hrv is not None else self.hrv_processor.compute_rmssd()
        sdnn = (
            round(self.last_band_sdnn, 2)
            if self.last_band_sdnn is not None
            else self.hrv_processor.compute_sdnn()
        )
        heart_rate = (
            round(self.last_band_heart_rate, 1)
            if self.last_band_heart_rate is not None
            else round(self.hrv_processor.last_hr, 1)
            if self.hrv_processor.last_hr is not None
            else None
        )
        focus_score = self.last_band_focus_score
        pressure_value = round(self.last_pressure_percent, 2)
        pressure_raw = (
            int(round(clamp(self.last_pressure_raw, 0, self.pressure.raw_max)))
            if self.last_pressure_raw is not None
            else None
        )
        if self.last_band_stress_score is not None:
            stress_score = int(
                round(
                    clamp(
                        self.last_band_stress_score * 0.78 + pressure_value * 0.22,
                        0,
                        100,
                    )
                )
            )
        else:
            stress_score = int(
                round(
                    clamp(
                        100 - hrv * 1.45 + pressure_value * 0.22,
                        0,
                        100,
                    )
                )
            )
        presence_state = derive_presence_state(self.last_distance_meters)

        return TelemetrySnapshot(
            heart_rate=heart_rate,
            hrv=hrv,
            sdnn=sdnn,
            focus_score=focus_score,
            stress_score=stress_score,
            pressure_value=pressure_value,
            pressure_raw=pressure_raw,
            pressure_level=self.last_pressure_level,
            wearable_rssi=self.last_rssi,
            distance_meters=self.last_distance_meters,
            presence_state=presence_state,
            physio_state=derive_physio_state(hrv, stress_score),
            recorded_at=now_iso(),
            source_device="band+squeeze",
        )

    async def maybe_send_band_alert(self) -> None:
        if self.last_rssi is None or self.last_rssi > self.rssi.threshold:
            return

        if time.monotonic() - self.last_band_alert_at < self.rssi.alert_cooldown_sec:
            return

        self.last_band_alert_at = time.monotonic()
        payload = parse_hex_payload(self.rssi.reminder_payload_hex)
        write_sent = False

        if self.band_client and self.band.write_char_uuid and payload:
            try:
                await self.band_client.write_gatt_char(
                    self.band.write_char_uuid,
                    payload,
                    response=False,
                )
                write_sent = True
            except Exception as error:
                print(f"[rovia-sidecar] band reminder write failed: {error}", flush=True)

        event = {
            "type": "band_alert",
            "message": f"手环距离提醒已触发，当前 RSSI {self.last_rssi}",
            "wearableRssi": self.last_rssi,
            "distanceMeters": self.last_distance_meters,
            "delivered": write_sent,
            "timestamp": now_iso(),
        }
        await self.gateway.broadcast(event)
        await self.supabase_syncer.insert_app_event("band_alert", event)

    async def telemetry_publish_loop(self) -> None:
        while True:
            snapshot = self.build_snapshot()
            synced = await self.supabase_syncer.insert_telemetry(snapshot)
            await self.gateway.broadcast(snapshot.to_event(synced_by_sidecar=synced))
            await asyncio.sleep(self.telemetry_interval_sec)


def build_device_config(prefix: str, default_name: str, default_format: str) -> DeviceConfig:
    return DeviceConfig(
        address=os.getenv(f"{prefix}_ADDRESS"),
        name=os.getenv(f"{prefix}_NAME", default_name),
        measurement_char_uuid=os.getenv(
            f"{prefix}_MEASUREMENT_CHAR_UUID",
            "beb5483e-36e1-4688-b7f5-ea07361b26a8"
            if prefix == "ROVIA_BAND"
            else "de80aa2a-7f77-4a2c-9f95-3dd9f6f7f0a1",
        ),
        trigger_char_uuid=os.getenv(f"{prefix}_TRIGGER_CHAR_UUID"),
        write_char_uuid=os.getenv(f"{prefix}_WRITE_CHAR_UUID"),
        data_format=os.getenv(f"{prefix}_DATA_FORMAT", default_format),
        value_kind=os.getenv(f"{prefix}_VALUE_KIND", "raw"),
    )


def build_supabase_config() -> SupabaseConfig:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    user_id = os.getenv("TEST_USER_ID") or os.getenv("ROVIA_USER_ID")
    enabled = parse_bool(os.getenv("ROVIA_SIDECAR_SYNC_TO_SUPABASE"), True)

    return SupabaseConfig(
        enabled=enabled,
        url=os.getenv("SUPABASE_URL"),
        key=key,
        user_id=user_id,
        email=os.getenv("TEST_USER_EMAIL"),
        password=os.getenv("TEST_USER_PASSWORD"),
    )


async def main() -> None:
    load_environment()

    parser = argparse.ArgumentParser(description="Rovia BLE/WebSocket sidecar")
    parser.add_argument("--host", default=os.getenv("ROVIA_SIDECAR_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("ROVIA_SIDECAR_PORT", "8765")),
    )
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument(
        "--telemetry-interval",
        type=float,
        default=float(os.getenv("ROVIA_TELEMETRY_INTERVAL_SEC", "8")),
    )
    args = parser.parse_args()

    gateway = RoviaGateway(args.host, args.port)
    band = build_device_config("ROVIA_BAND", "", "json")
    squeeze = build_device_config("ROVIA_SQUEEZE", "", "ascii-number")
    rssi = RssiConfig(
        threshold=int(os.getenv("ROVIA_BAND_RSSI_THRESHOLD", "-60")),
        poll_interval_sec=float(os.getenv("ROVIA_BAND_RSSI_POLL_SEC", "4")),
        alert_cooldown_sec=float(
            os.getenv("ROVIA_BAND_ALERT_COOLDOWN_SEC", "25")
        ),
        tx_power=int(os.getenv("ROVIA_BAND_TX_POWER", "-59")),
        path_loss_factor=float(os.getenv("ROVIA_BAND_PATH_LOSS_FACTOR", "2.2")),
        reminder_payload_hex=os.getenv("ROVIA_BAND_REMINDER_HEX", "01"),
    )
    pressure = PressureConfig(
        raw_min=float(os.getenv("ROVIA_SQUEEZE_RAW_MIN", "0")),
        raw_max=float(os.getenv("ROVIA_SQUEEZE_RAW_MAX", "4095")),
        smoothing_alpha=float(os.getenv("ROVIA_SQUEEZE_SMOOTHING_ALPHA", "0.35")),
        trigger_percent=float(os.getenv("ROVIA_SQUEEZE_TRIGGER_PERCENT", "78")),
        trigger_cooldown_sec=float(
            os.getenv("ROVIA_SQUEEZE_TRIGGER_COOLDOWN_SEC", "20")
        ),
    )
    supabase_syncer = SupabaseSyncer(build_supabase_config())
    await supabase_syncer.init()

    orchestrator = DualBleOrchestrator(
        gateway=gateway,
        band=band,
        squeeze=squeeze,
        rssi=rssi,
        pressure=pressure,
        supabase_syncer=supabase_syncer,
        telemetry_interval_sec=args.telemetry_interval,
        simulate=args.simulate,
    )

    await asyncio.gather(gateway.run(), orchestrator.run())


if __name__ == "__main__":
    asyncio.run(main())
