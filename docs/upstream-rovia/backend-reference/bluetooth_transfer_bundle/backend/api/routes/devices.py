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
    connected: bool
    last_seen_s: float | None
    device_name: str | None


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


# ── 路由 ──────────────────────────────────────────────────────

@router.get("/status", response_model=DevicesStatusResponse)
def get_devices_status():
    return DevicesStatusResponse(
        wristband=DeviceStatus(
            connected=telemetry_store.wristband_connected,
            last_seen_s=telemetry_store.wristband_last_seen_s(),
            device_name=telemetry_store.wristband_name,
        ),
        squeeze=DeviceStatus(
            connected=telemetry_store.squeeze_connected,
            last_seen_s=telemetry_store.squeeze_last_seen_s(),
            device_name=telemetry_store.squeeze_name,
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
        names = sorted({
            _display_name(d, adv)
            for d, adv in results.values()
            if _display_name(d, adv)
        })
        return {"devices": names}
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
