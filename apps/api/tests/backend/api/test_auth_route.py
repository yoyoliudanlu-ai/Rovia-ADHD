import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


class _Body:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _Request:
    def __init__(self, headers=None):
        self.headers = headers or {}


class _FakeHTTPException(Exception):
    def __init__(self, *, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class _FakeAuthApiError(Exception):
    def __init__(self, detail, *, status_code=None):
        super().__init__(detail)
        self.status_code = status_code


class _FakeSessionStore:
    def __init__(self):
        self.session = None
        self.revoked = []

    def create_session(self, *, user_id, email, mode="session", profile=None):
        self.session = {
            "access_token": f"token-{user_id}",
            "user": {
                "id": user_id,
                "email": email,
            },
            "mode": mode,
            "profile": profile or {},
        }
        return self.session

    def get_session(self, token):
        if self.session and self.session["access_token"] == token:
            return self.session
        return None

    def revoke(self, token):
        self.revoked.append(token)
        if self.session and self.session["access_token"] == token:
            self.session = None


class AuthRouteTests(unittest.TestCase):
    def _load_routes(
        self,
        *,
        sign_in_result=None,
        sign_up_result=None,
        sign_in_error=None,
        store=None,
        showcase=None,
    ):
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=_FakeHTTPException,
            Request=object,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=object)

        def _sign_in_with_password(credentials):
            if sign_in_error is not None:
                raise sign_in_error
            return sign_in_result or {
                "user": {"id": "user-1", "email": credentials["email"]},
                "session": {"provider_access_token": "supa-token"},
            }

        fake_auth_api = types.SimpleNamespace(
            sign_in_with_password=_sign_in_with_password,
            sign_up_with_password=lambda credentials: sign_up_result
            or {
                "user": {
                    "id": "user-2",
                    "email": credentials["email"],
                    "identities": [{}],
                },
                "session": None,
            },
        )

        fake_client_module = types.SimpleNamespace(
            get_supabase_client=lambda: types.SimpleNamespace(auth=fake_auth_api)
        )
        fake_store = store or _FakeSessionStore()
        fake_store_module = types.SimpleNamespace(session_store=fake_store)
        fake_demo_module = types.SimpleNamespace(
            SHOWCASE_DEMO_ACCOUNT=showcase
            or {
                "user_id": "showcase-user",
                "email": "showcase@rovia.local",
                "profile": {"display_name": "Rovia Showcase"},
            }
        )

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.supabase.client": fake_client_module,
                "backend.api.auth_store": fake_store_module,
                "backend.api.demo_accounts": fake_demo_module,
            },
        ):
            sys.modules.pop("backend.api.routes.auth", None)
            from backend.api.routes.auth import (
                demo_sign_in,
                get_session,
                sign_in,
                sign_out,
                sign_up,
            )

        return fake_store, sign_in, sign_up, sign_out, get_session, demo_sign_in

    def test_sign_in_returns_backend_owned_session_payload(self):
        store, sign_in, _sign_up, _sign_out, _get_session, _demo_sign_in = self._load_routes()

        result = sign_in(_Body(email="buddy@example.com", password="pw"))

        self.assertEqual(result["session"]["access_token"], "token-user-1")
        self.assertEqual(result["auth"]["mode"], "session")
        self.assertEqual(result["auth"]["userId"], "user-1")
        self.assertEqual(result["auth"]["email"], "buddy@example.com")
        self.assertEqual(store.session["user"]["email"], "buddy@example.com")

    def test_sign_in_maps_invalid_credentials_to_http_401(self):
        store, sign_in, _sign_up, _sign_out, _get_session, _demo_sign_in = self._load_routes(
            sign_in_error=_FakeAuthApiError(
                "Invalid login credentials",
                status_code=400,
            )
        )

        with self.assertRaises(_FakeHTTPException) as caught:
            sign_in(_Body(email="buddy@example.com", password="bad-pw"))

        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(caught.exception.detail, "Invalid login credentials")
        self.assertIsNone(store.session)

    def test_sign_up_reports_email_confirmation_when_session_is_missing(self):
        _store, _sign_in, sign_up, _sign_out, _get_session, _demo_sign_in = self._load_routes()

        result = sign_up(_Body(email="new@example.com", password="pw"))

        self.assertTrue(result["needsEmailConfirmation"])
        self.assertFalse(result["alreadyRegistered"])
        self.assertEqual(result["registeredUserId"], "user-2")

    def test_get_session_reads_current_bearer_token(self):
        store = _FakeSessionStore()
        store.create_session(
            user_id="showcase-user",
            email="showcase@rovia.local",
            mode="demo",
            profile={"display_name": "Rovia Showcase"},
        )
        _store, _sign_in, _sign_up, _sign_out, get_session, _demo_sign_in = self._load_routes(
            store=store
        )

        result = get_session(_Request({"authorization": "Bearer token-showcase-user"}))

        self.assertEqual(result["auth"]["mode"], "demo")
        self.assertEqual(result["auth"]["userId"], "showcase-user")
        self.assertEqual(result["profile"]["display_name"], "Rovia Showcase")

    def test_sign_out_revokes_current_session(self):
        store = _FakeSessionStore()
        store.create_session(user_id="user-1", email="buddy@example.com")
        _store, _sign_in, _sign_up, sign_out, _get_session, _demo_sign_in = self._load_routes(
            store=store
        )

        result = sign_out(_Request({"authorization": "Bearer token-user-1"}))

        self.assertEqual(result["auth"]["mode"], "anonymous")
        self.assertIn("token-user-1", store.revoked)

    def test_demo_sign_in_creates_showcase_session(self):
        store, _sign_in, _sign_up, _sign_out, _get_session, demo_sign_in = self._load_routes()

        result = demo_sign_in()

        self.assertEqual(result["auth"]["mode"], "demo")
        self.assertEqual(result["auth"]["email"], "showcase@rovia.local")
        self.assertEqual(result["profile"]["display_name"], "Rovia Showcase")
        self.assertEqual(store.session["access_token"], "token-showcase-user")


if __name__ == "__main__":
    unittest.main()
