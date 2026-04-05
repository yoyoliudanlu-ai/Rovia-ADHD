"""WebSocket 广播管理器：把 BLE 实时数据推给所有连接的前端。"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class WsBroadcaster:
    def __init__(self):
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        log.debug("WS client connected, total=%d", len(self._clients))

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._clients.discard(ws)
        log.debug("WS client disconnected, total=%d", len(self._clients))

    async def broadcast(self, event: str, data: Any):
        """向所有客户端广播 {event, data} 消息。"""
        msg = json.dumps({"event": event, "data": data}, ensure_ascii=False)
        dead: list[WebSocket] = []
        async with self._lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)

    def broadcast_sync(self, event: str, data: Any):
        """从同步回调里触发广播（BLE notify handler 用）。"""
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(self.broadcast(event, data))
            )


broadcaster = WsBroadcaster()
