"""
设备接口

GET  /api/devices/status          → 手环+捏捏连接状态
GET  /api/devices/scan            → 扫描附近 BLE 设备（返回设备名和 RSSI）
GET  /api/devices/scan/raw        → 返回原始扫描诊断（local_name / service UUID / 最后出现时间）
POST /api/devices/configure       → 设置要连接的设备名
POST /api/devices/disconnect      → 暂停指定设备的自动连接
POST /api/devices/reconnect       → 恢复指定设备的自动连接并触发重新发现
POST /api/devices/remind          → 向手环发送提醒信号（默认 0x01，可传 0x02）
GET  /api/devices/config          → 当前配置的设备名
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import telemetry_store
from ..ble_runner import _display_name, ble_runner

router = APIRouter(prefix="/api/devices", tags=["devices"])
log = logging.getLogger(__name__)


# ── 响应模型 ──────────────────────────────────────────────────

class DeviceStatus(BaseModel):
    connected: bool
    last_seen_s: float | None
    device_name: str | None
    selected_name: str | None = None
    state: str = "unselected"
    last_error: str | None = None
    rssi: float | None = None
    is_at_desk: bool | None = None
    hrv: float | None = None
    pressure_raw: float | None = None


class DevicesStatusResponse(BaseModel):
    wristband: DeviceStatus
    squeeze: DeviceStatus


class DeviceConfigRequest(BaseModel):
    wristband: str = ""
    squeeze: str = ""
    wristband_uuid: str = ""
    squeeze_uuid: str = ""


class DeviceConfigResponse(BaseModel):
    wristband: str
    wristband_uuid: str
    squeeze: str
    squeeze_uuid: str


class DeviceActionRequest(BaseModel):
    device_type: str = "all"


class DeviceReminderRequest(BaseModel):
    reason: str = "manual"
    require_focus_active: bool = False
    signal_hex: str = "01"


def _normalize_device_type(value: str | None) -> str:
    device_type = (value or "all").strip().lower()
    if device_type not in {"all", "wristband", "squeeze"}:
        raise HTTPException(status_code=400, detail="device_type must be all, wristband, or squeeze")
    return device_type


def _derive_device_state(*, selected_name: str | None, connected: bool, last_error: str | None, last_connect_attempt_at: float | None, discovered: bool, allow_selected_discovered: bool = True) -> str:
    if connected:
        return "connected"
    if discovered:
        return "discovered"
    if last_error:
        return "connection_failed"
    if selected_name and last_connect_attempt_at:
        return "connecting"
    if selected_name and allow_selected_discovered:
        return "discovered"
    if selected_name:
        return "offline"
    return "unselected"


# ── 路由 ──────────────────────────────────────────────────────

@router.get("/status", response_model=DevicesStatusResponse)
def get_devices_status():
    diagnostics = ble_runner.connection_diagnostics()
    wristband_diag = diagnostics.get("wristband") or {}
    squeeze_diag = diagnostics.get("squeeze") or {}
    wristband_selected = wristband_diag.get("selected_name") or ble_runner.wristband_name or None
    squeeze_selected = squeeze_diag.get("selected_name") or ble_runner.squeeze_name or None
    return DevicesStatusResponse(
        wristband=DeviceStatus(
            connected=telemetry_store.wristband_connected,
            last_seen_s=telemetry_store.wristband_last_seen_s(),
            device_name=telemetry_store.wristband_name or wristband_selected,
            selected_name=wristband_selected,
            state=_derive_device_state(
                selected_name=wristband_selected,
                connected=telemetry_store.wristband_connected,
                last_error=wristband_diag.get("last_error"),
                last_connect_attempt_at=wristband_diag.get("last_connect_attempt_at"),
                discovered=telemetry_store.rssi is not None,
            ),
            last_error=wristband_diag.get("last_error"),
            rssi=telemetry_store.rssi,
            is_at_desk=telemetry_store.is_at_desk,
            hrv=telemetry_store.hrv,
        ),
        squeeze=DeviceStatus(
            connected=telemetry_store.squeeze_connected,
            last_seen_s=telemetry_store.squeeze_last_seen_s(),
            device_name=telemetry_store.squeeze_name or squeeze_selected,
            selected_name=squeeze_selected,
            state=_derive_device_state(
                selected_name=squeeze_selected,
                connected=telemetry_store.squeeze_connected,
                last_error=squeeze_diag.get("last_error"),
                last_connect_attempt_at=squeeze_diag.get("last_connect_attempt_at"),
                discovered=False,
                allow_selected_discovered=False,
            ),
            last_error=squeeze_diag.get("last_error"),
            pressure_raw=telemetry_store.pressure_raw,
        ),
    )


@router.get("/scan")
async def scan_devices(timeout: float = 5.0):
    """
    扫描附近 BLE 设备，返回设备名列表。
    timeout: 扫描秒数，默认 5 秒，最长 15 秒。
    """
    timeout = min(max(timeout, 2.0), 15.0)
    try:
        from bleak import BleakScanner
        results = await BleakScanner.discover(timeout=timeout, return_adv=True)
        devices: dict[str, dict] = {}
        for device, adv in results.values():
            name = _display_name(device, adv)
            if not name:
                continue
            devices[name] = {
                "name": name,
                "rssi": getattr(adv, "rssi", None),
            }
        return {"devices": [devices[name] for name in sorted(devices)]}
    except Exception as e:
        log.error("BLE scan failed: %s", e)
        raise HTTPException(status_code=503, detail=f"BLE scan failed: {e}")


@router.get("/scan/raw")
def get_raw_scan_diagnostics(limit: int = 50):
    """
    返回后台扫描诊断缓存，便于判断：
    1. 设备是否持续广播
    2. 是否广播到了但 GATT 连接失败
    """
    limit = min(max(limit, 1), 200)
    return {
        "selected": {
            "wristband": ble_runner.wristband_name or None,
            "squeeze": ble_runner.squeeze_name or None,
        },
        "connections": ble_runner.connection_diagnostics(),
        "observations": ble_runner.scan_diagnostics(limit=limit),
    }


@router.get("/config", response_model=DeviceConfigResponse)
def get_device_config():
    """返回当前后端使用的设备名和 UUID 配置。"""
    return DeviceConfigResponse(
        wristband=ble_runner.wristband_name,
        wristband_uuid=ble_runner.wristband_notify_uuid,
        squeeze=ble_runner.squeeze_name,
        squeeze_uuid=ble_runner.squeeze_notify_uuid,
    )


@router.post("/configure", response_model=DeviceConfigResponse)
def configure_devices(body: DeviceConfigRequest):
    """
    设置要连接的设备名和 Notify UUID，立即生效（断开旧连接，重连新设备）。
    传空字符串表示不连接该设备 / 保持原 UUID 不变。
    """
    ble_runner.reconfigure(
        wristband_name=body.wristband.strip(),
        squeeze_name=body.squeeze.strip(),
        wristband_uuid=body.wristband_uuid.strip(),
        squeeze_uuid=body.squeeze_uuid.strip(),
    )
    return DeviceConfigResponse(
        wristband=ble_runner.wristband_name,
        wristband_uuid=ble_runner.wristband_notify_uuid,
        squeeze=ble_runner.squeeze_name,
        squeeze_uuid=ble_runner.squeeze_notify_uuid,
    )


@router.post("/disconnect")
def disconnect_device(body: DeviceActionRequest | None = None):
    device_type = _normalize_device_type(getattr(body, "device_type", "all"))
    keep_wristband = device_type == "squeeze"
    keep_squeeze = device_type == "wristband"
    ble_runner.reconfigure(
        wristband_name=ble_runner.wristband_name if keep_wristband else "",
        squeeze_name=ble_runner.squeeze_name if keep_squeeze else "",
        wristband_uuid=ble_runner.wristband_notify_uuid if keep_wristband else "",
        squeeze_uuid=ble_runner.squeeze_notify_uuid if keep_squeeze else "",
    )
    return {"ok": True, "device_type": device_type}


@router.post("/reconnect")
def reconnect_device(body: DeviceActionRequest | None = None):
    device_type = _normalize_device_type(getattr(body, "device_type", "all"))
    ble_runner.trigger_reconnect(device_type)
    return {"ok": True, "device_type": device_type}


@router.post("/remind")
async def send_reminder(body: DeviceReminderRequest | None = None):
    payload = body or DeviceReminderRequest()
    return ble_runner.send_reminder_signal(
        reason=payload.reason.strip() or "manual",
        require_focus_active=bool(payload.require_focus_active),
        signal_hex=payload.signal_hex,
    )
