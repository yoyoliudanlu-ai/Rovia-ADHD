from __future__ import annotations

import os

from fastapi import HTTPException, Request

from .auth_store import session_store


def extract_bearer_token(request: Request | None) -> str | None:
    if request is None:
        return None
    header = getattr(request, "headers", {}).get("authorization", "")
    if not isinstance(header, str) or not header.lower().startswith("bearer "):
        return None
    token = header.split(" ", 1)[1].strip()
    return token or None


def get_current_session(request: Request | None = None) -> dict | None:
    return session_store.get_session(extract_bearer_token(request))


def resolve_user_id(request: Request | None = None, required: bool = False) -> str:
    session = get_current_session(request)
    user_id = ((session or {}).get("user") or {}).get("id") or os.getenv("ADHD_USER_ID", "").strip()
    if user_id:
        return user_id
    if required:
        raise HTTPException(status_code=401, detail="No active backend session")
    return ""
