from __future__ import annotations

from dataclasses import dataclass, field
from secrets import token_urlsafe


@dataclass
class SessionStore:
    _sessions: dict[str, dict] = field(default_factory=dict)

    def create_session(
        self,
        *,
        user_id: str,
        email: str | None,
        mode: str = "session",
        profile: dict | None = None,
    ) -> dict:
        access_token = token_urlsafe(24)
        session = {
            "access_token": access_token,
            "user": {
                "id": user_id,
                "email": email,
            },
            "mode": mode,
            "profile": profile or {},
        }
        self._sessions[access_token] = session
        return session

    def get_session(self, token: str | None) -> dict | None:
        if not token:
            return None
        return self._sessions.get(token)

    def revoke(self, token: str | None):
        if not token:
            return
        self._sessions.pop(token, None)


session_store = SessionStore()
