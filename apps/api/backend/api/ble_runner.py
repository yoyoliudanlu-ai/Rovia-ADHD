"""BLE gateway 与 API server 的桥接层。

在独立线程里跑 asyncio BLE 循环，把数据写入 telemetry_store 并广播 WebSocket。
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from backend.gateway.parsers import parse_wristband, parse_squeeze
from .store import telemetry_store
from .ws import broadcaster

log = logging.getLogger(__name__)


def _env_enabled(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except Exception:
        return default


BLE_RUNNER_ENABLED = _env_enabled("ENABLE_BLE_RUNNER", default=True)

try:
    from bleak import BleakClient, BleakScanner
    BLEAK_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - exercised via startup import tests
    BleakClient = None
    BleakScanner = None
    BLEAK_IMPORT_ERROR = exc

# ── 配置（从环境变量读，方便替换） ──────────────────────────────
WRISTBAND_NAME = os.getenv("WRISTBAND_DEVICE_NAME", "")
# 兼容旧变量名；这里表示“优先使用的数据输入特征”，不再局限于 notify。
WRISTBAND_INPUT_UUID = os.getenv(
    "WRISTBAND_INPUT_CHAR_UUID",
    os.getenv("WRISTBAND_NOTIFY_CHAR_UUID", ""),
)
WRISTBAND_WRITE_UUID = os.getenv(
    "WRISTBAND_WRITE_CHAR_UUID",
    os.getenv("WRISTBAND_ALERT_CHAR_UUID", ""),
)

SQUEEZE_NAME = os.getenv("SQUEEZE_DEVICE_NAME", "")
SQUEEZE_INPUT_UUID = os.getenv(
    "SQUEEZE_INPUT_CHAR_UUID",
    os.getenv("SQUEEZE_NOTIFY_CHAR_UUID", ""),
)
SQUEEZE_WRITE_UUID = os.getenv("SQUEEZE_WRITE_CHAR_UUID", "")

# 主循环节奏：默认 0.25s，确保 read-fallback 场景也能平滑刷新压力值。
SCAN_INTERVAL_S          = max(0.08, _env_float("BLE_SCAN_INTERVAL_S", 0.25))
RECONNECT_INTERVAL_S     = max(0.5, _env_float("BLE_RECONNECT_INTERVAL_S", 5.0))
DEVICE_TIMEOUT_S         = max(1.0, _env_float("BLE_DEVICE_TIMEOUT_S", 15.0))
READ_FALLBACK_AFTER_S    = max(0.2, _env_float("BLE_READ_FALLBACK_AFTER_S", 6.0))
SUPABASE_SYNC_INTERVAL_S = max(2.0, _env_float("SUPABASE_SYNC_INTERVAL_S", 12.0))
GATT_RSSI_INTERVAL_S     = max(2.0, _env_float("BLE_GATT_RSSI_INTERVAL_S", 60.0))

# RSSI 在位判定（迟滞）
RSSI_ENTER_DESK = int(os.getenv("RSSI_ENTER_DESK", "-58"))
RSSI_LEAVE_DESK = int(os.getenv("RSSI_LEAVE_DESK", "-63"))


@dataclass(slots=True)
class IoCharacteristics:
    read_uuid: str | None = None
    notify_uuid: str | None = None
    write_uuid: str | None = None

    @property
    def input_uuid(self) -> str | None:
        return self.notify_uuid or self.read_uuid


class BleRunner:
    def __init__(self):
        self._wb_client: BleakClient | None = None
        self._sq_client: BleakClient | None = None
        self._wb_connecting = False
        self._sq_connecting = False
        self._wb_device = None
        self._sq_device = None
        self._wb_ts = 0.0
        self._wb_gatt_rssi_ts = 0.0
        self._sq_ts = 0.0
        self._wb_rssi: float | None = None
        self._is_at_desk = False
        self._wb_data_ts = 0.0
        self._sq_data_ts = 0.0
        self._loop: asyncio.AbstractEventLoop | None = None
        self._running = False
        self._diag_lock = threading.Lock()
        self._scan_observations: dict[str, dict[str, Any]] = {}
        self._wb_last_error: str | None = None
        self._sq_last_error: str | None = None
        self._wb_last_error_at: float | None = None
        self._sq_last_error_at: float | None = None
        self._wb_last_connect_attempt_at: float | None = None
        self._sq_last_connect_attempt_at: float | None = None
        self._wb_available_chars: list[dict[str, Any]] = []
        self._sq_available_chars: list[dict[str, Any]] = []

        # 可运行时修改的设备名和 UUID（初始为空，通过 API /configure 设置）
        self.wristband_name: str         = WRISTBAND_NAME
        self.wristband_notify_uuid: str  = WRISTBAND_INPUT_UUID
        self.squeeze_name: str           = SQUEEZE_NAME
        self.squeeze_notify_uuid: str    = SQUEEZE_INPUT_UUID
        self.wristband_write_uuid: str   = WRISTBAND_WRITE_UUID
        self.squeeze_write_uuid: str     = SQUEEZE_WRITE_UUID
        self._wb_io = IoCharacteristics()
        self._sq_io = IoCharacteristics()
        self._reconfigure_pending = False
        self._last_supabase_sync_at = 0.0
        self._supabase_repo = None

    def reconfigure(self, wristband_name: str, squeeze_name: str,
                    wristband_uuid: str = "", squeeze_uuid: str = ""):
        """热更新设备名/UUID，下个扫描周期生效，同时断开旧连接。

        空 UUID 表示清空手动指定，回退到自动探测输入特征。
        """
        self.wristband_name        = wristband_name
        self.squeeze_name          = squeeze_name
        self.wristband_notify_uuid = wristband_uuid.strip()
        self.squeeze_notify_uuid   = squeeze_uuid.strip()
        self._reconfigure_pending = True
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(self._drop_connections())
            )

    def trigger_reconnect(self, device_type: str = "all"):
        _normalize_device_targets(device_type)
        self._reconfigure_pending = True
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(self._drop_connections())
            )

    # ── 对外接口 ──────────────────────────────────────────────

    def start_in_thread(self):
        """在后台线程启动 BLE 事件循环。"""
        if not BLE_RUNNER_ENABLED:
            log.info("BLE runner disabled by ENABLE_BLE_RUNNER")
            return
        if BleakClient is None or BleakScanner is None:
            log.warning("BLE runner unavailable because bleak is not installed: %s", BLEAK_IMPORT_ERROR)
            return
        t = threading.Thread(target=self._thread_main, daemon=True, name="ble-runner")
        t.start()

    def _thread_main(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._running = True
        try:
            self._loop.run_until_complete(self._run())
        except Exception as e:
            log.error("BLE runner crashed: %s", e)

    # ── 主循环 ────────────────────────────────────────────────

    async def _drop_connections(self):
        await self._disconnect("wristband")
        await self._disconnect("squeeze")
        telemetry_store.set_wristband_disconnected()
        telemetry_store.set_squeeze_disconnected()
        self._wb_device = None
        self._sq_device = None
        self._wb_io = IoCharacteristics()
        self._sq_io = IoCharacteristics()
        self._wb_available_chars = []
        self._sq_available_chars = []
        self._wb_last_connect_attempt_at = None
        self._sq_last_connect_attempt_at = None

    async def _run(self):
        def on_adv(device, adv):
            name = _display_name(device, adv)
            now = self._loop.time()
            self._record_scan_observation(device, adv)
            if _name_matches(self.wristband_name, name):
                self._wb_device = device
                self._wb_rssi = adv.rssi
                self._wb_ts = now
            if _name_matches(self.squeeze_name, name):
                self._sq_device = device
                self._sq_ts = now

        async with BleakScanner(detection_callback=on_adv):
            while self._running:
                await asyncio.sleep(SCAN_INTERVAL_S)
                now = self._loop.time()

                wb_alive = self._wb_device is not None and (now - self._wb_ts) < DEVICE_TIMEOUT_S
                sq_alive = self._sq_device is not None and (now - self._sq_ts) < DEVICE_TIMEOUT_S

                self._publish_presence(wb_alive)
                if _should_drop_connection(wb_alive, self._wb_client):
                    await self._disconnect(which="wristband")
                    telemetry_store.set_wristband_disconnected()

                if _should_drop_connection(sq_alive, self._sq_client):
                    await self._disconnect(which="squeeze")
                    telemetry_store.set_squeeze_disconnected()

                # 尝试连接
                if (
                    wb_alive
                    and self.wristband_name
                    and self._can_attempt_connect(
                        self._wb_client,
                        self._wb_connecting,
                        self._wb_last_connect_attempt_at,
                    )
                ):
                    await self._ensure_wristband()
                if (
                    sq_alive
                    and self.squeeze_name
                    and self._can_attempt_connect(
                        self._sq_client,
                        self._sq_connecting,
                        self._sq_last_connect_attempt_at,
                    )
                ):
                    await self._ensure_squeeze()

                # 如果输入特征是 read，则通过轮询读取最新值。
                await self._poll_read_characteristics_once()
                await self._try_read_wb_gatt_rssi()
                self._maybe_sync_supabase()

    # ── 连接管理 ──────────────────────────────────────────────

    def _make_wb_disconnect_cb(self):
        """GATT 断线时立即重置时间戳，让下一个扫描周期能触发重连。"""
        loop = self._loop
        def _on_wb_disconnect(_client):
            log.info("Wristband GATT disconnected")
            self._wb_client = None
            self._wb_io = IoCharacteristics()
            telemetry_store.set_wristband_disconnected()
            if loop:
                self._wb_ts = loop.time()  # 刷新时间戳，确保 wb_alive 保持 True 一段时间
        return _on_wb_disconnect

    def _make_sq_disconnect_cb(self):
        loop = self._loop
        def _on_sq_disconnect(_client):
            log.info("Squeeze GATT disconnected")
            self._sq_client = None
            self._sq_io = IoCharacteristics()
            telemetry_store.set_squeeze_disconnected()
            if loop:
                self._sq_ts = loop.time()
        return _on_sq_disconnect

    async def _try_read_wb_gatt_rssi(self):
        """每分钟从 GATT 连接读一次 RSSI，让设备停止广播后在位判定仍然新鲜。"""
        if self._wb_client is None or not self._wb_client.is_connected:
            return
        now = time.time()
        if now - self._wb_gatt_rssi_ts < GATT_RSSI_INTERVAL_S:
            return
        self._wb_gatt_rssi_ts = now
        try:
            rssi = await self._wb_client.get_rssi()
            if rssi is not None:
                self._wb_rssi = float(rssi)
                self._wb_ts = self._loop.time()
                log.debug("Wristband GATT RSSI: %s dBm", rssi)
        except Exception as exc:
            log.debug("GATT RSSI read failed: %s", exc)

    @staticmethod
    def _can_attempt_connect(
        client: BleakClient | None,
        connecting: bool,
        last_attempt_at: float | None,
    ) -> bool:
        if connecting:
            return False
        if client and client.is_connected:
            return False
        if last_attempt_at is None:
            return True
        return (time.time() - last_attempt_at) >= RECONNECT_INTERVAL_S

    async def _ensure_wristband(self):
        if self._wb_connecting:
            return
        if self._wb_client and self._wb_client.is_connected:
            return
        self._wb_connecting = True
        self._wb_last_connect_attempt_at = time.time()
        try:
            client = BleakClient(self._wb_device, disconnected_callback=self._make_wb_disconnect_cb())
            await client.connect()
            self._wb_available_chars = await self._describe_characteristics(client)
            channels = await self._resolve_io_characteristics(
                client,
                self.wristband_notify_uuid,
                self.wristband_write_uuid,
            )
            await self._attach_input_channel(client, channels, self._on_wristband)
            self._wb_client = client
            self._wb_io = channels
            if channels.write_uuid:
                self.wristband_write_uuid = channels.write_uuid
            telemetry_store.set_wristband_connected(self.wristband_name)
            self._wb_last_error = None
            self._wb_last_error_at = None
            log.info(
                "Wristband connected (input=%s, mode=%s, write=%s)",
                channels.input_uuid,
                _channel_mode(channels),
                channels.write_uuid,
            )
        except Exception as e:
            log.debug("Wristband connect failed: %s", e)
            self._wb_last_error = str(e)
            self._wb_last_error_at = time.time()
            await self._disconnect("wristband")
        finally:
            self._wb_connecting = False

    async def _ensure_squeeze(self):
        if self._sq_connecting:
            return
        if self._sq_client and self._sq_client.is_connected:
            return
        self._sq_connecting = True
        self._sq_last_connect_attempt_at = time.time()
        try:
            client = BleakClient(self._sq_device, disconnected_callback=self._make_sq_disconnect_cb())
            await client.connect()
            self._sq_available_chars = await self._describe_characteristics(client)
            channels = await self._resolve_io_characteristics(
                client,
                self.squeeze_notify_uuid,
                self.squeeze_write_uuid,
            )
            await self._attach_input_channel(client, channels, self._on_squeeze)
            self._sq_client = client
            self._sq_io = channels
            if channels.write_uuid:
                self.squeeze_write_uuid = channels.write_uuid
            telemetry_store.set_squeeze_connected(self.squeeze_name)
            self._sq_last_error = None
            self._sq_last_error_at = None
            log.info(
                "Squeeze connected (input=%s, mode=%s, write=%s)",
                channels.input_uuid,
                _channel_mode(channels),
                channels.write_uuid,
            )
        except Exception as e:
            log.debug("Squeeze connect failed: %s", e)
            self._sq_last_error = str(e)
            self._sq_last_error_at = time.time()
            await self._disconnect("squeeze")
        finally:
            self._sq_connecting = False

    @staticmethod
    async def _subscribe_notify(client: BleakClient, uuid: str, handler):
        """兼容旧逻辑：只订阅 notify/indicate 特征。"""
        channels = await BleRunner._resolve_io_characteristics(client, uuid)
        if not channels.notify_uuid:
            raise RuntimeError("No notify characteristics found on device")
        await client.start_notify(channels.notify_uuid, handler)

    @staticmethod
    async def _resolve_io_characteristics(
        client: BleakClient,
        preferred_input_uuid: str = "",
        preferred_write_uuid: str = "",
    ) -> IoCharacteristics:
        services = await _load_client_services(client)
        chars: list[tuple[str, set[str]]] = []
        for service in services:
            for char in service.characteristics:
                props = {str(p).lower() for p in (char.properties or [])}
                chars.append((str(char.uuid), props))

        channels = IoCharacteristics()
        preferred_input = (preferred_input_uuid or "").strip().lower()
        preferred_write = (preferred_write_uuid or "").strip().lower()

        if preferred_input:
            preferred_found = False
            for uuid_text, props in chars:
                if uuid_text.lower() != preferred_input:
                    continue
                preferred_found = True
                if "notify" in props or "indicate" in props:
                    channels.notify_uuid = uuid_text
                    if "read" in props:
                        channels.read_uuid = uuid_text
                elif "read" in props:
                    channels.read_uuid = uuid_text
                else:
                    raise RuntimeError(f"Preferred input uuid is not readable: {uuid_text}")
                break
            if not preferred_found:
                available_inputs = [uuid_text for uuid_text, props in chars if {"notify", "indicate", "read"} & props]
                raise RuntimeError(
                    "Preferred input uuid not found: "
                    f"{preferred_input_uuid}. Available input chars: {', '.join(available_inputs) or 'none'}"
                )

        if channels.input_uuid is None:
            for uuid_text, props in chars:
                if "notify" in props or "indicate" in props:
                    channels.notify_uuid = uuid_text
                    if "read" in props:
                        channels.read_uuid = uuid_text
                    break

        if channels.input_uuid is None:
            for uuid_text, props in chars:
                if "read" in props:
                    channels.read_uuid = uuid_text
                    break

        if preferred_write:
            preferred_write_found = False
            for uuid_text, props in chars:
                if uuid_text.lower() != preferred_write:
                    continue
                preferred_write_found = True
                if _can_write(props):
                    channels.write_uuid = uuid_text
                    break
                raise RuntimeError(f"Preferred write uuid is not writable: {uuid_text}")
            if not preferred_write_found:
                available_writes = [uuid_text for uuid_text, props in chars if _can_write(props)]
                raise RuntimeError(
                    "Preferred write uuid not found: "
                    f"{preferred_write_uuid}. Available write chars: {', '.join(available_writes) or 'none'}"
                )

        if channels.write_uuid is None:
            for uuid_text, props in chars:
                if _can_write(props):
                    channels.write_uuid = uuid_text
                    break

        if channels.input_uuid is None:
            raise RuntimeError("No readable or notify characteristics found on device")

        return channels

    @staticmethod
    async def _attach_input_channel(client: BleakClient, channels: IoCharacteristics, handler):
        if channels.notify_uuid:
            await client.start_notify(channels.notify_uuid, handler)

    async def _poll_read_characteristics_once(self):
        await self._poll_read_characteristic(
            self._wb_client,
            self._wb_io,
            self._on_wristband,
            self._wb_data_ts,
        )
        await self._poll_read_characteristic(
            self._sq_client,
            self._sq_io,
            self._on_squeeze,
            self._sq_data_ts,
        )

    @staticmethod
    async def _poll_read_characteristic(
        client: BleakClient | None,
        channels: IoCharacteristics,
        handler,
        last_data_ts: float,
    ):
        if client is None or not client.is_connected or not channels.read_uuid:
            return
        if channels.notify_uuid and last_data_ts and (time.time() - last_data_ts) < READ_FALLBACK_AFTER_S:
            return
        try:
            raw = await client.read_gatt_char(channels.read_uuid)
        except Exception as e:
            log.debug("Read %s failed: %s", channels.read_uuid, e)
            return

        data = bytes(raw or b"")
        if not data:
            return
        handler(0, bytearray(data))

    async def _disconnect(self, which: str):
        client = self._wb_client if which == "wristband" else self._sq_client
        if client is None:
            return
        try:
            if client.is_connected:
                await client.disconnect()
        except Exception:
            pass
        if which == "wristband":
            self._wb_client = None
            self._wb_io = IoCharacteristics()
        else:
            self._sq_client = None
            self._sq_io = IoCharacteristics()

    @staticmethod
    async def _describe_characteristics(client: BleakClient) -> list[dict[str, Any]]:
        services = await _load_client_services(client)
        described: list[dict[str, Any]] = []
        for service in services:
            for char in service.characteristics:
                props = sorted({str(p).lower() for p in (char.properties or [])})
                described.append({
                    "uuid": str(char.uuid),
                    "properties": props,
                })
        return described

    def _update_presence_from_rssi(self, rssi: float) -> bool:
        enter = float(rssi) >= RSSI_ENTER_DESK
        leave = float(rssi) <= RSSI_LEAVE_DESK
        if not self._is_at_desk and enter:
            self._is_at_desk = True
        elif self._is_at_desk and leave:
            self._is_at_desk = False
        return self._is_at_desk

    def _publish_presence(self, wb_alive: bool):
        if self._wb_rssi is not None:
            if wb_alive:
                self._update_presence_from_rssi(self._wb_rssi)
                telemetry_store.update_presence(
                    self._wb_rssi,
                    _estimate_distance_m(self._wb_rssi),
                    self._is_at_desk,
                )
                broadcaster.broadcast_sync("presence", {
                    "rssi":       self._wb_rssi,
                    "distance_m": _estimate_distance_m(self._wb_rssi),
                    "is_at_desk": self._is_at_desk,
                })
                return

            if self._wb_client and self._wb_client.is_connected:
                # 设备连接后停止广播时，保留最近一次 RSSI，不误判成离线
                telemetry_store.update_presence(
                    self._wb_rssi,
                    _estimate_distance_m(self._wb_rssi),
                    self._is_at_desk,
                )
                broadcaster.broadcast_sync("presence", {
                    "rssi":       self._wb_rssi,
                    "distance_m": _estimate_distance_m(self._wb_rssi),
                    "is_at_desk": self._is_at_desk,
                })
                return

        self._is_at_desk = False
        telemetry_store.update_presence(None, None, False)

    async def _send_wristband_signal(
        self,
        *,
        payload: bytes,
        reason: str = "manual",
        require_focus_active: bool = False,
    ) -> dict[str, Any]:
        if require_focus_active and not bool(getattr(telemetry_store, "focus_active", False)):
            return {
                "ok": True,
                "sent": False,
                "reason": reason,
                "skipped": "focus_inactive",
            }
        if self._wb_client is None or not self._wb_client.is_connected:
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": "wristband_not_connected",
            }
        if not self.wristband_write_uuid:
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": "wristband_write_uuid_missing",
            }
        try:
            await self._wb_client.write_gatt_char(
                self.wristband_write_uuid,
                payload,
                response=False,
            )
            return {
                "ok": True,
                "sent": True,
                "reason": reason,
                "payload_hex": payload.hex(),
            }
        except Exception as exc:
            log.debug("Send wristband signal failed (%s): %s", reason, exc)
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": str(exc),
            }

    def send_reminder_signal(
        self,
        *,
        reason: str = "manual",
        require_focus_active: bool = False,
        signal_hex: str = "01",
    ) -> dict[str, Any]:
        """线程安全地触发手环提醒信号（默认 0x01）。"""
        loop = self._loop
        if loop is None or not loop.is_running():
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": "ble_loop_not_running",
            }
        try:
            payload = self._decode_signal_hex(signal_hex)
        except ValueError as exc:
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": str(exc),
            }
        future = asyncio.run_coroutine_threadsafe(
            self._send_wristband_signal(
                payload=payload,
                reason=reason,
                require_focus_active=require_focus_active,
            ),
            loop,
        )
        try:
            return future.result(timeout=3.0)
        except Exception as exc:
            return {
                "ok": False,
                "sent": False,
                "reason": reason,
                "error": str(exc),
            }

    @staticmethod
    def _decode_signal_hex(signal_hex: str) -> bytes:
        text = str(signal_hex or "").strip().lower()
        if text.startswith("0x"):
            text = text[2:]
        if len(text) == 1:
            text = f"0{text}"
        if len(text) != 2:
            raise ValueError("invalid_signal_hex")
        try:
            value = int(text, 16)
        except Exception as exc:
            raise ValueError("invalid_signal_hex") from exc
        return bytes([value])

    async def _maybe_send_leave_signal(self, previous_at_desk: bool, current_at_desk: bool):
        if not previous_at_desk or current_at_desk:
            return
        await self._send_wristband_signal(
            payload=b"\x01",
            reason="leave_desk",
            require_focus_active=True,
        )

    def _maybe_sync_supabase(self):
        user_id = os.getenv("ADHD_USER_ID", "").strip()
        if not user_id:
            return

        now = time.time()
        if now - self._last_supabase_sync_at < SUPABASE_SYNC_INTERVAL_S:
            return

        try:
            if self._supabase_repo is None:
                from backend.supabase.client import get_supabase_client
                from backend.supabase.repository import SupabaseRepository

                self._supabase_repo = SupabaseRepository(get_supabase_client())

            snapshot = telemetry_store.snapshot()
            wb  = snapshot["wristband"]
            sq  = snapshot["squeeze"]
            pre = snapshot["presence"]
            self._supabase_repo.insert_telemetry(
                user_id=user_id,
                hrv=wb.get("sdnn") or wb.get("hrv"),   # 优先存 SDNN
                stress_level=wb.get("stress_level")
                if wb.get("stress_level") is not None
                else sq.get("stress_level"),
                distance_meters=pre.get("distance_m"),
                is_at_desk=bool(pre.get("is_at_desk", False)),
                squeeze_pressure=sq.get("pressure_raw"),
                focus_score=wb.get("focus"),
                source="desktop_gateway",
            )
            self._last_supabase_sync_at = now
        except Exception as exc:
            log.debug("Supabase telemetry sync skipped: %s", exc)

    def _record_scan_observation(self, device, adv):
        display_name = _display_name(device, adv)
        if not display_name:
            return

        now = time.time()
        identifier = _device_identifier(device, adv)
        rssi = getattr(adv, "rssi", None)
        service_uuids = sorted({str(x) for x in (getattr(adv, "service_uuids", None) or []) if str(x)})
        local_name = (getattr(adv, "local_name", None) or "").strip() or None
        device_name = (getattr(device, "name", None) or "").strip() or None

        with self._diag_lock:
            prev = self._scan_observations.get(identifier)
            first_seen_at = prev["first_seen_at"] if prev else now
            seen_count = (prev["seen_count"] if prev else 0) + 1
            self._scan_observations[identifier] = {
                "identifier": identifier,
                "display_name": display_name,
                "local_name": local_name,
                "device_name": device_name,
                "service_uuids": service_uuids,
                "rssi": rssi,
                "first_seen_at": first_seen_at,
                "last_seen_at": now,
                "seen_count": seen_count,
            }

    def scan_diagnostics(self, limit: int = 50) -> list[dict[str, Any]]:
        now = time.time()
        with self._diag_lock:
            items = list(self._scan_observations.values())

        items.sort(key=lambda item: item.get("last_seen_at") or 0.0, reverse=True)
        output: list[dict[str, Any]] = []
        for item in items[: max(1, limit)]:
            output.append(
                {
                    **item,
                    "last_seen_s_ago": round(max(0.0, now - float(item["last_seen_at"])), 1),
                    "matches_wristband": _name_matches(self.wristband_name, item["display_name"]),
                    "matches_squeeze": _name_matches(self.squeeze_name, item["display_name"]),
                }
            )
        return output

    def connection_diagnostics(self) -> dict[str, dict[str, Any]]:
        return {
            "wristband": {
                "selected_name": self.wristband_name or None,
                "connected": bool(self._wb_client and self._wb_client.is_connected),
                "configured_input_uuid": self.wristband_notify_uuid or None,
                "configured_write_uuid": self.wristband_write_uuid or None,
                "input_uuid": self._wb_io.input_uuid or (self.wristband_notify_uuid or None),
                "write_uuid": self._wb_io.write_uuid or (self.wristband_write_uuid or None),
                "last_connect_attempt_at": self._wb_last_connect_attempt_at,
                "last_error": self._wb_last_error,
                "last_error_at": self._wb_last_error_at,
                "available_characteristics": list(self._wb_available_chars),
            },
            "squeeze": {
                "selected_name": self.squeeze_name or None,
                "connected": bool(self._sq_client and self._sq_client.is_connected),
                "configured_input_uuid": self.squeeze_notify_uuid or None,
                "configured_write_uuid": self.squeeze_write_uuid or None,
                "input_uuid": self._sq_io.input_uuid or (self.squeeze_notify_uuid or None),
                "write_uuid": self._sq_io.write_uuid or (self.squeeze_write_uuid or None),
                "last_connect_attempt_at": self._sq_last_connect_attempt_at,
                "last_error": self._sq_last_error,
                "last_error_at": self._sq_last_error_at,
                "available_characteristics": list(self._sq_available_chars),
            },
        }

    # ── 数据回调 ──────────────────────────────────────────────

    def _on_wristband(self, _handle: int, data: bytearray):
        parsed = parse_wristband(bytes(data))
        if not parsed:
            return
        self._wb_data_ts = time.time()
        telemetry_store.update_wristband(parsed)
        # 广播字段与 snapshot["wristband"] 完全一致，避免 WS 和 HTTP 看到不同值
        broadcaster.broadcast_sync("wristband", {
            "sdnn":           telemetry_store.sdnn,
            "hrv":            telemetry_store.hrv,
            "focus":          telemetry_store.focus,
            "focus_active":   telemetry_store.focus_active,
            "stress_level":   telemetry_store.fused_stress(),
            "metrics_status": telemetry_store.metrics_status,
        })

    def _on_squeeze(self, _handle: int, data: bytearray):
        parsed = parse_squeeze(bytes(data))
        if not parsed:
            return
        self._sq_data_ts = time.time()
        telemetry_store.update_squeeze(parsed)
        # squeeze 事件只携带捏捏自身数据，stress_level = 纯捏捏压力
        # 融合压力在 wristband 事件和 snapshot["wristband"]["stress_level"] 里
        broadcaster.broadcast_sync("squeeze", {
            "pressure_raw":  telemetry_store.pressure_raw,
            "pressure_norm": telemetry_store.pressure_norm,
            "stress_level":  telemetry_store.squeeze_stress,
            "squeeze_count": telemetry_store.squeeze_count,
            "battery":       telemetry_store.battery,
        })


# 全局单例
ble_runner = BleRunner()


def _name_matches(target: str, scanned: str) -> bool:
    t = (target or "").strip().lower()
    s = (scanned or "").strip().lower()
    if not t or not s:
        return False
    return t == s or t in s or s in t


def _can_write(props: set[str]) -> bool:
    return "write" in props or "write-without-response" in props or "write without response" in props


def _channel_mode(channels: IoCharacteristics) -> str:
    if channels.notify_uuid and channels.read_uuid:
        return "notify+read"
    if channels.read_uuid:
        return "read"
    return "notify"


def _display_name(device, adv=None) -> str:
    return (
        (getattr(adv, "local_name", None) or "")
        or (getattr(device, "name", None) or "")
    ).strip()


def _device_identifier(device, adv=None) -> str:
    return str(
        getattr(device, "address", None)
        or getattr(device, "identifier", None)
        or getattr(device, "details", None)
        or _display_name(device, adv)
    ).strip()


def _should_drop_connection(device_alive: bool, client: BleakClient | None) -> bool:
    if client is None:
        return False
    return (not device_alive) and (not bool(getattr(client, "is_connected", False)))


async def _load_client_services(client) -> Any:
    get_services = getattr(client, "get_services", None)
    if callable(get_services):
        return await get_services()
    return getattr(client, "services", [])


def _estimate_distance_m(rssi: float) -> float:
    return round(10 ** ((-59.0 - float(rssi)) / (10 * 2.4)), 2)


def _normalize_device_targets(device_type: str) -> set[str]:
    text = (device_type or "all").strip().lower()
    if text == "all":
        return {"wristband", "squeeze"}
    if text in {"wristband", "squeeze"}:
        return {text}
    raise ValueError(f"Unsupported device_type: {device_type}")
