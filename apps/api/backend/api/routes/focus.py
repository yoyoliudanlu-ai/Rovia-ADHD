"""
专注会话接口

POST /api/focus/start          → 开始专注会话
POST /api/focus/finish         → 结束专注会话
GET  /api/focus/sessions       → 当前用户历史会话
GET  /api/focus/ranking        → 排行榜（按天）
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..auth_context import resolve_user_id

router = APIRouter(prefix="/api/focus", tags=["focus"])


def _repo():
    from backend.supabase.repository import SupabaseRepository
    from backend.supabase.client import get_supabase_client
    return SupabaseRepository(get_supabase_client())


def _user_id(request: Request = None) -> str:
    uid = resolve_user_id(request) or os.getenv("ADHD_USER_ID", "")
    if not uid:
        raise HTTPException(status_code=500, detail="ADHD_USER_ID not configured")
    return uid


class StartFocusRequest(BaseModel):
    duration_minutes: int = 25
    trigger_source: str = "manual"    # "manual" | "wristband_button" | "squeeze"


class FinishFocusRequest(BaseModel):
    session_id: str
    status: str = "completed"         # "completed" | "canceled"


@router.post("/start")
def start_focus(body: StartFocusRequest, request: Request = None):
    return _repo().start_focus_session(
        user_id=_user_id(request),
        duration_minutes=body.duration_minutes,
        trigger_source=body.trigger_source,
    )


@router.post("/finish")
def finish_focus(body: FinishFocusRequest, request: Request = None):
    return _repo().finish_focus_session(
        user_id=_user_id(request),
        session_id=body.session_id,
        status=body.status,
    )


@router.get("/sessions")
def get_sessions(request: Request = None, limit: int = 20):
    return {"data": _repo().get_focus_sessions(user_id=_user_id(request), limit=limit)}


@router.get("/ranking")
def get_ranking(day: str | None = None, limit: int = 20):
    """
    day: "2026-04-05"（不填则今天）
    返回 [{user_id, focus_minutes, completed_sessions}, ...]
    """
    return _repo().get_focus_ranking(day=day, limit=limit)
