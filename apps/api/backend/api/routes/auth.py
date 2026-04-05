from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..auth_store import session_store
from ..demo_accounts import SHOWCASE_DEMO_ACCOUNT
from backend.supabase.client import get_supabase_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


class CredentialsRequest(BaseModel):
    email: str
    password: str


def _extract_bearer_token(request: Request = None) -> str | None:
    if request is None:
        return None
    header = getattr(request, "headers", {}).get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    return header.split(" ", 1)[1].strip() or None


def _to_dict(value):
    if isinstance(value, dict):
        return value
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    return {}


def _build_auth_state(session: dict | None, *, configured: bool = True) -> dict:
    user = (session or {}).get("user", {})
    mode = (session or {}).get("mode") or ("anonymous" if configured else "local")
    user_id = user.get("id")
    return {
        "configured": configured,
        "mode": mode,
        "isLoggedIn": bool(user_id),
        "hasIdentity": bool(user_id),
        "needsLogin": configured and not user_id,
        "email": user.get("email"),
        "userId": user_id,
    }


def _build_response(session: dict | None, *, configured: bool = True) -> dict:
    return {
        "session": session,
        "auth": _build_auth_state(session, configured=configured),
        "profile": (session or {}).get("profile") or {},
    }


def _invoke_auth_method(method, *, email: str, password: str):
    try:
        return method(
            {
                "email": email,
                "password": password,
            }
        )
    except TypeError:
        return method(email=email, password=password)


def _raise_auth_http_error(error: Exception):
    detail = str(error).strip() or "Authentication failed"
    normalized = detail.lower()

    if "invalid login credentials" in normalized:
        raise HTTPException(status_code=401, detail="Invalid login credentials")

    if "email not confirmed" in normalized:
        raise HTTPException(status_code=403, detail="Email not confirmed")

    status_code = getattr(error, "status_code", None)
    if isinstance(status_code, int) and 400 <= status_code < 600:
        raise HTTPException(status_code=status_code, detail=detail)

    raise HTTPException(status_code=502, detail=detail)


@router.post("/sign-in")
def sign_in(body: CredentialsRequest):
    auth_api = get_supabase_client().auth
    try:
        result = _to_dict(
            _invoke_auth_method(
                auth_api.sign_in_with_password,
                email=body.email,
                password=body.password,
            )
        )
    except Exception as error:
        _raise_auth_http_error(error)

    user = _to_dict(result.get("user"))
    session = session_store.create_session(
        user_id=user.get("id", ""),
        email=user.get("email") or body.email,
        mode="session",
    )
    return _build_response(session)


@router.post("/sign-up")
def sign_up(body: CredentialsRequest):
    auth_api = get_supabase_client().auth
    sign_up_fn = getattr(auth_api, "sign_up", None) or getattr(
        auth_api, "sign_up_with_password"
    )
    result = _to_dict(
        _invoke_auth_method(
            sign_up_fn,
            email=body.email,
            password=body.password,
        )
    )
    user = _to_dict(result.get("user"))
    raw_session = _to_dict(result.get("session"))
    identities = user.get("identities") or []
    already_registered = bool(user and len(identities) == 0)
    needs_email_confirmation = bool(user and not already_registered and not raw_session)

    session = None
    if raw_session:
        session = session_store.create_session(
            user_id=user.get("id", ""),
            email=user.get("email") or body.email,
            mode="session",
        )

    return {
        **_build_response(session),
        "alreadyRegistered": already_registered,
        "needsEmailConfirmation": needs_email_confirmation,
        "registeredUserId": user.get("id"),
    }


@router.get("/session")
def get_session(request: Request = None):
    session = session_store.get_session(_extract_bearer_token(request))
    return _build_response(session)


@router.post("/sign-out")
def sign_out(request: Request = None):
    session_store.revoke(_extract_bearer_token(request))
    return _build_response(None)


@router.post("/demo-sign-in")
def demo_sign_in():
    session = session_store.create_session(
        user_id=SHOWCASE_DEMO_ACCOUNT["user_id"],
        email=SHOWCASE_DEMO_ACCOUNT["email"],
        mode="demo",
        profile=SHOWCASE_DEMO_ACCOUNT.get("profile") or {},
    )
    return _build_response(session)
