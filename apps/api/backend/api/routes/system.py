from __future__ import annotations

import os
import signal
import time

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

router = APIRouter(prefix="/api/system", tags=["system"])

_LOCALHOSTS = {"127.0.0.1", "::1", "localhost"}


def _request_host(request: Request) -> str:
    client = getattr(request, "client", None)
    host = getattr(client, "host", "") or ""
    return host.split("%", 1)[0]


def _is_local_request(request: Request) -> bool:
    return _request_host(request) in _LOCALHOSTS


def _terminate_process(delay_s: float = 0.2):
    time.sleep(max(0.0, delay_s))
    os.kill(os.getpid(), signal.SIGTERM)


@router.post("/shutdown")
def shutdown_system(request: Request, background_tasks: BackgroundTasks):
    if not _is_local_request(request):
        raise HTTPException(status_code=403, detail="shutdown is only available from localhost")

    background_tasks.add_task(_terminate_process)
    return {"ok": True}
