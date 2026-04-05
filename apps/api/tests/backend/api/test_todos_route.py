import os
import sys
import types
import unittest
from unittest import mock


class _Body:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class TodosRouteTests(unittest.TestCase):
    def test_create_and_update_todo_use_new_supabase_schema_fields(self):
        fake_repo = types.SimpleNamespace(
            list_todos=lambda user_id: [{"id": "t1", "content": "写文档", "status": "pending"}],
            upsert_todo=lambda **kwargs: kwargs,
            update_todo=lambda **kwargs: kwargs,
            delete_todo=lambda **kwargs: kwargs,
        )
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
                patch=lambda *a, **k: (lambda fn: fn),
                delete=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=object)
        fake_repo_module = types.SimpleNamespace(SupabaseRepository=lambda _client: fake_repo)
        fake_client_module = types.SimpleNamespace(get_supabase_client=lambda: object())

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.supabase.repository": fake_repo_module,
                "backend.supabase.client": fake_client_module,
            },
        ), mock.patch.dict(os.environ, {"ADHD_USER_ID": "u1"}):
            sys.modules.pop("backend.api.routes.todos", None)
            from backend.api.routes.todos import create_todo, list_todos, update_todo

            created = create_todo(
                _Body(
                    content="写文档",
                    start_time="2026-04-05T10:00:00Z",
                    end_time="2026-04-05T11:00:00Z",
                    status="pending",
                )
            )
            listed = list_todos()
            updated = update_todo("t1", _Body(status="completed", content=None, start_time=None, end_time=None))

        self.assertEqual(created["content"], "写文档")
        self.assertEqual(created["status"], "pending")
        self.assertEqual(created["start_time"], "2026-04-05T10:00:00Z")
        self.assertEqual(listed[0]["content"], "写文档")
        self.assertEqual(updated["status"], "completed")


if __name__ == "__main__":
    unittest.main()
