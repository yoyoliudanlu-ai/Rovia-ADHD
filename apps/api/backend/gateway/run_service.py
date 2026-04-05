"""Run dual-BLE backend sync service."""

from __future__ import annotations

import asyncio
import logging
import os

from backend.gateway.config import default_gateway_config
from backend.gateway.service import BackendSyncService
from backend.supabase.client import create_supabase_from_env
from backend.supabase.repository import SupabaseRepository


def _setup_logging():
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


async def _main():
    _setup_logging()
    user_id = os.getenv("ADHD_USER_ID")
    if not user_id:
        raise RuntimeError("ADHD_USER_ID is required")

    repo = SupabaseRepository(create_supabase_from_env())
    svc = BackendSyncService(
        user_id=user_id,
        repository=repo,
        gateway_config=default_gateway_config(),
        upload_interval_s=float(os.getenv("UPLOAD_INTERVAL_S", "12")),
    )
    await svc.run_forever()


if __name__ == "__main__":
    asyncio.run(_main())

