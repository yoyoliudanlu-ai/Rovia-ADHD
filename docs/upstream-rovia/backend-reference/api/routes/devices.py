"""
设备接口

GET  /api/devices/status          → 手环+捏捏连接状态
GET  /api/devices/scan            → 扫描附近 BLE 设备（返回设备名列表）
GET  /api/devices/scan/raw        → 返回原始扫描诊断（local_name / service UUID / 最后出现时间）
POST /api/devices/configure       → 设置要连接的设备名
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
    device_type: str
    selected_name: str | None
    device_name: str | None
    state: str
    connected: bool
    discovered: bool
    connecting: bool
    failed: bool
    last_seen_s: float | None
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
    squeeze: str


class DeviceActionRequest(BaseModel):
    device_type: str = "all"


def _has_matching_observation(scan_items: list[dict], key: str) -> bool:
    flag = f"matches_{key}"
    return any(bool(item.get(flag)) for item in scan_items)


def _derive_connection_state(*, selected_name: str | None, connected: bool, connecting: bool, failed: bool, discovered: bool):
    if not selected_name:
        return "unselected"
    if connected:
        return "connected"
    if connecting:
        return "connecting"
    if failed:
        return "connection_failed"
    if discovered:
        return "discovered"
    return "offline"


# ── 路由 ──────────────────────────────────────────────────────

@router.get("/status", response_model=DevicesStatusResponse)
def get_devices_status():
    diagnostics = ble_runner.connection_diagnostics()
    observations = ble_runner.scan_diagnostics(limit=200)

    wristband_diag = diagnostics["wristband"]
    squeeze_diag = diagnostics["squeeze"]
    wristband_selected = wristband_diag.get("selected_name")
    squeeze_selected = squeeze_diag.get("selected_name")
    wristband_discovered = _has_matching_observation(observations, "wristband")
    squeeze_discovered = _has_matching_observation(observations, "squeeze")
    wristband_connecting = bool(
        wristband_diag.get("last_connect_attempt_at") and not wristband_diag.get("connected")
    ) and not wristband_diag.get("last_error")
    squeeze_connecting = bool(
        squeeze_diag.get("last_connect_attempt_at") and not squeeze_diag.get("connected")
    ) and not squeeze_diag.get("last_error")

    return DevicesStatusResponse(
        wristband=DeviceStatus(
            device_type="wristband",
            selected_name=wristband_selected,
            device_name=telemetry_store.wristband_name or wristband_selected,
            state=_derive_connection_state(
                selected_name=wristband_selected,
                connected=telemetry_store.wristband_connected,
                connecting=wristband_connecting,
                failed=bool(wristband_diag.get("last_error")),
                discovered=wristband_discovered,
            ),
            connected=telemetry_store.wristband_connected,
            discovered=wristband_discovered,
            connecting=wristband_connecting,
            failed=bool(wristband_diag.get("last_error")),
            last_seen_s=telemetry_store.wristband_last_seen_s(),
            last_error=wristband_diag.get("last_error"),
            rssi=telemetry_store.rssi,
            is_at_desk=telemetry_store.is_at_desk,
            hrv=telemetry_store.sdnn or telemetry_store.hrv,
        ),
        squeeze=DeviceStatus(
            device_type="squeeze",
            selected_name=squeeze_selected,
            device_name=telemetry_store.squeeze_name or squeeze_selected,
            state=_derive_connection_state(
                selected_name=squeeze_selected,
                connected=telemetry_store.squeeze_connected,
                connecting=squeeze_connecting,
                failed=bool(squeeze_diag.get("last_error")),
                discovered=squeeze_discovered,
            ),
            connected=telemetry_store.squeeze_connected,
            discovered=squeeze_discovered,
            connecting=squeeze_connecting,
            failed=bool(squeeze_diag.get("last_error")),
            last_seen_s=telemetry_store.squeeze_last_seen_s(),
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
        devices = []
        for device, adv in results.values():
            name = _display_name(device, adv)
            if not name:
                continue
            devices.append(
                {
                    "name": name,
                    "rssi": getattr(adv, "rssi", None),
                }
            )
        devices.sort(key=lambda item: (item["name"].lower(), -(item["rssi"] or -9999)))
        deduped = []
        seen_names = set()
        for item in devices:
            if item["name"] in seen_names:
                continue
            seen_names.add(item["name"])
            deduped.append(item)
        return {"devices": deduped}
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
        squeeze=ble_runner.squeeze_name,
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
        wristband_uuid="",
        squeeze_uuid="",
    )
    return DeviceConfigResponse(
        wristband=ble_runner.wristband_name,
        squeeze=ble_runner.squeeze_name,
    )


@router.post("/disconnect")
def disconnect_devices(body: DeviceActionRequest):
    ble_runner.disconnect_device(body.device_type)
    return {"ok": True, "device_type": body.device_type}


@router.post("/reconnect")
def reconnect_devices(body: DeviceActionRequest):
    ble_runner.reconnect_device(body.device_type)
    return {"ok": True, "device_type": body.device_type}
