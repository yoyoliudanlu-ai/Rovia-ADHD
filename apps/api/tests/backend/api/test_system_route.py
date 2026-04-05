from pathlib import Path
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


class _BackgroundTasks:
    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args, **kwargs):
        self.calls.append((fn, args, kwargs))


class _Client:
    def __init__(self, host):
        self.host = host


class _Request:
    def __init__(self, host="127.0.0.1"):
        self.client = _Client(host)
        self.headers = {}


class SystemRouteTests(unittest.TestCase):
    def _load_routes(self):
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            BackgroundTasks=_BackgroundTasks,
            HTTPException=Exception,
            Request=object,
        )

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
            },
        ):
            sys.modules.pop("backend.api.routes.system", None)
            from backend.api.routes.system import shutdown_system

        return shutdown_system

    def test_shutdown_route_accepts_local_requests_and_schedules_termination(self):
        shutdown_system = self._load_routes()
        background_tasks = _BackgroundTasks()

        result = shutdown_system(_Request("127.0.0.1"), background_tasks)

        self.assertEqual(result["ok"], True)
        self.assertEqual(len(background_tasks.calls), 1)

    def test_shutdown_route_rejects_non_local_requests(self):
        shutdown_system = self._load_routes()
        background_tasks = _BackgroundTasks()

        with self.assertRaises(Exception):
            shutdown_system(_Request("10.0.0.8"), background_tasks)


if __name__ == "__main__":
    unittest.main()
