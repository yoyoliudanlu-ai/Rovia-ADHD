"""FastAPI 后端入口。

启动：
  cd /Volumes/ORICO/项目/ADHD
  uvicorn backend.api.server:app --host 0.0.0.0 --port 8000 --reload

WebSocket 实时推送：
  ws://localhost:8000/ws/telemetry

  收到的消息格式：
  {"event": "wristband", "data": {...}}
  {"event": "squeeze",   "data": {...}}
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

# 自动加载项目根目录的 .env 文件
_env_file = Path(__file__).parent.parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            import os as _os
            _os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .ble_runner import ble_runner
from .routes import devices, focus, telemetry, todos
from .ws import broadcaster

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s  %(message)s",
)
log = logging.getLogger(__name__)

app = FastAPI(
    title="ADHD Companion Backend",
    version="1.0.0",
    description="BLE 双设备网关 + 遥测 + Todo + 专注会话",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(telemetry.router)
app.include_router(focus.router)
app.include_router(todos.router)


@app.on_event("startup")
async def startup():
    ble_runner_enabled = os.getenv("ENABLE_BLE_RUNNER", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    if not ble_runner_enabled:
        log.info("BLE runner disabled by ENABLE_BLE_RUNNER")
        return

    log.info("Starting BLE runner...")
    ble_runner.start_in_thread()


@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    """
    实时推送 BLE 数据给前端。

    连接后立即推一次当前快照，之后每次设备发数据都推送。

    消息格式：
      {"event": "wristband", "data": {bpm, hrv, sdnn, focus, stress_level, metrics_status}}
      {"event": "squeeze",   "data": {pressure_raw, pressure_norm, stress_level, squeeze_count, battery}}
    """
    await broadcaster.connect(ws)
    try:
        # 连接后立即推一次最新快照
        from .store import telemetry_store
        await broadcaster.broadcast("snapshot", telemetry_store.snapshot())
        # 保持连接
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.disconnect(ws)


@app.get("/health")
def health():
    return {"ok": True}
