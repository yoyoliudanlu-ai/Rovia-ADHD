import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


class _Request:
    def __init__(self, headers=None):
        self.headers = headers or {}


class UserContextRouteTests(unittest.TestCase):
    def test_todos_route_prefers_backend_session_user_over_env_user(self):
        seen = {}
        fake_repo = types.SimpleNamespace(
            list_todos=lambda user_id: seen.setdefault("todos_user_id", user_id) or []
        )
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
                patch=lambda *a, **k: (lambda fn: fn),
                delete=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
            Request=object,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=object)
        fake_repo_module = types.SimpleNamespace(SupabaseRepository=lambda _client: fake_repo)
        fake_client_module = types.SimpleNamespace(get_supabase_client=lambda: object())
        fake_auth_context = types.SimpleNamespace(resolve_user_id=lambda request=None, required=False: "session-user")

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.supabase.repository": fake_repo_module,
                "backend.supabase.client": fake_client_module,
                "backend.api.auth_context": fake_auth_context,
            },
        ), mock.patch.dict(os.environ, {"ADHD_USER_ID": "env-user"}):
            sys.modules.pop("backend.api.routes.todos", None)
            from backend.api.routes.todos import list_todos

            list_todos(_Request())

        self.assertEqual(seen["todos_user_id"], "session-user")

    def test_focus_route_prefers_backend_session_user_over_env_user(self):
        seen = {}
        fake_repo = types.SimpleNamespace(
            get_focus_sessions=lambda user_id, limit=20: seen.setdefault("focus_user_id", user_id) or []
        )
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
            Request=object,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=object)
        fake_repo_module = types.SimpleNamespace(SupabaseRepository=lambda _client: fake_repo)
        fake_client_module = types.SimpleNamespace(get_supabase_client=lambda: object())
        fake_auth_context = types.SimpleNamespace(resolve_user_id=lambda request=None, required=False: "session-user")

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.supabase.repository": fake_repo_module,
                "backend.supabase.client": fake_client_module,
                "backend.api.auth_context": fake_auth_context,
            },
        ), mock.patch.dict(os.environ, {"ADHD_USER_ID": "env-user"}):
            sys.modules.pop("backend.api.routes.focus", None)
            from backend.api.routes.focus import get_sessions

            get_sessions(_Request(), limit=10)

        self.assertEqual(seen["focus_user_id"], "session-user")


if __name__ == "__main__":
    unittest.main()
