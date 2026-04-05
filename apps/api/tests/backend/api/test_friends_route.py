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


class FriendsRouteTests(unittest.TestCase):
    def _load_routes(self):
        calls = []

        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            Request=object,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=object)
        fake_auth_context = types.SimpleNamespace(
            resolve_user_id=lambda request=None, required=False: "user-1"
        )
        fake_friends_service = types.SimpleNamespace(
            list_friends=lambda user_id: calls.append(("list", user_id)) or [{"id": "f-1"}],
            get_recommendations=lambda user_id: calls.append(("recommend", user_id)) or [{"id": "f-2"}],
            get_ranking=lambda user_id, day=None, limit=20: calls.append(
                ("ranking", user_id, day, limit)
            )
            or [{"id": "self"}],
            send_request=lambda user_id, friend_id: calls.append(
                ("request", user_id, friend_id)
            )
            or {"ok": True, "status": "pending"},
            accept_request=lambda user_id, friend_id: calls.append(
                ("accept", user_id, friend_id)
            )
            or {"ok": True, "status": "connected"},
        )

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.auth_context": fake_auth_context,
                "backend.api.friends_service": fake_friends_service,
            },
        ):
            sys.modules.pop("backend.api.routes.friends", None)
            from backend.api.routes.friends import (
                accept_friend,
                get_friend_ranking,
                list_friends,
                recommend_friends,
                request_friend,
            )

        return calls, list_friends, recommend_friends, get_friend_ranking, request_friend, accept_friend

    def test_list_friends_uses_current_user(self):
        calls, list_friends, _recommend_friends, _get_friend_ranking, _request_friend, _accept_friend = (
            self._load_routes()
        )

        result = list_friends(_Request())

        self.assertEqual(result["data"], [{"id": "f-1"}])
        self.assertEqual(calls[0], ("list", "user-1"))

    def test_recommend_friends_uses_current_user(self):
        calls, _list_friends, recommend_friends, _get_friend_ranking, _request_friend, _accept_friend = (
            self._load_routes()
        )

        result = recommend_friends(_Request())

        self.assertEqual(result["data"], [{"id": "f-2"}])
        self.assertEqual(calls[0], ("recommend", "user-1"))

    def test_friend_ranking_passes_day_and_limit(self):
        calls, _list_friends, _recommend_friends, get_friend_ranking, _request_friend, _accept_friend = (
            self._load_routes()
        )

        result = get_friend_ranking(_Request(), day="2026-04-06", limit=6)

        self.assertEqual(result["data"], [{"id": "self"}])
        self.assertEqual(calls[0], ("ranking", "user-1", "2026-04-06", 6))

    def test_request_friend_passes_friend_id(self):
        calls, _list_friends, _recommend_friends, _get_friend_ranking, request_friend, _accept_friend = (
            self._load_routes()
        )

        result = request_friend(_Request(), _Body(friend_id="f-9"))

        self.assertEqual(result["status"], "pending")
        self.assertEqual(calls[0], ("request", "user-1", "f-9"))

    def test_accept_friend_passes_friend_id(self):
        calls, _list_friends, _recommend_friends, _get_friend_ranking, _request_friend, accept_friend = (
            self._load_routes()
        )

        result = accept_friend(_Request(), _Body(friend_id="f-9"))

        self.assertEqual(result["status"], "connected")
        self.assertEqual(calls[0], ("accept", "user-1", "f-9"))


if __name__ == "__main__":
    unittest.main()
