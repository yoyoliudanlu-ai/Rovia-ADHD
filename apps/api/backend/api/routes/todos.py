"""
Todo 接口

GET    /api/todos              → 列表（按 created_at 升序）
POST   /api/todos              → 新建
PATCH  /api/todos/{id}         → 更新（task_text / is_completed / priority / start_time / end_time）
DELETE /api/todos/{id}         → 删除
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..auth_context import resolve_user_id

router = APIRouter(prefix="/api/todos", tags=["todos"])


def _repo():
    from backend.supabase.repository import SupabaseRepository
    from backend.supabase.client import get_supabase_client
    return SupabaseRepository(get_supabase_client())


def _user_id(request: Request = None) -> str:
    uid = resolve_user_id(request) or os.getenv("ADHD_USER_ID", "")
    if not uid:
        raise HTTPException(status_code=500, detail="ADHD_USER_ID not configured")
    return uid


class CreateTodoRequest(BaseModel):
    task_text: str
    priority: int = 0
    start_time: str | None = None   # ISO 8601，如 "2026-04-05T10:00:00+08:00"
    end_time: str | None = None


class UpdateTodoRequest(BaseModel):
    task_text: str | None = None
    is_completed: bool | None = None
    priority: int | None = None
    start_time: str | None = None
    end_time: str | None = None


@router.get("")
def list_todos(request: Request = None):
    return _repo().list_todos(user_id=_user_id(request))


@router.post("", status_code=201)
def create_todo(body: CreateTodoRequest, request: Request = None):
    return _repo().create_todo(
        user_id=_user_id(request),
        task_text=body.task_text,
        priority=body.priority,
        start_time=body.start_time,
        end_time=body.end_time,
    )


@router.patch("/{todo_id}")
def update_todo(todo_id: str, body: UpdateTodoRequest, request: Request = None):
    patch: dict = {}
    if body.task_text is not None:
        patch["task_text"] = body.task_text
    if body.is_completed is not None:
        patch["is_completed"] = body.is_completed
    if body.priority is not None:
        patch["priority"] = body.priority
    if body.start_time is not None:
        patch["start_time"] = body.start_time
    if body.end_time is not None:
        patch["end_time"] = body.end_time
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    return _repo().update_todo(user_id=_user_id(request), todo_id=todo_id, **patch)


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: str, request: Request = None):
    _repo().delete_todo(user_id=_user_id(request), todo_id=todo_id)
