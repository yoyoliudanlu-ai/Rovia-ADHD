from backend.supabase.repository import SupabaseRepository


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, name: str):
        self.name = name
        self.last_action = None
        self.last_payload = None
        self.filters = []
        self.orders = []
        self._result = []
        self.selected_columns = None
        self.fail_on_select_contains = None

    def insert(self, payload):
        self.last_action = "insert"
        self.last_payload = payload
        self._result = [payload]
        return self

    def update(self, payload):
        self.last_action = "update"
        self.last_payload = payload
        self._result = [payload]
        return self

    def delete(self):
        self.last_action = "delete"
        self.last_payload = None
        self._result = []
        return self

    def select(self, _columns):
        self.last_action = "select"
        self.selected_columns = _columns
        if self.fail_on_select_contains and self.fail_on_select_contains in _columns:
            raise Exception(f"column {self.name}.{self.fail_on_select_contains} does not exist")
        self._result = [{"ok": True}]
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, key, desc=False):
        self.orders.append((key, desc))
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        return FakeResponse(self._result)


class FakeClient:
    def __init__(self):
        self.tables = {}

    def table(self, name: str):
        if name not in self.tables:
            self.tables[name] = FakeTable(name)
        return self.tables[name]


def test_insert_telemetry_maps_fields():
    repo = SupabaseRepository(FakeClient())
    out = repo.insert_telemetry(
        user_id="u1",
        hrv=31.2,
        stress_level=44,
        distance_meters=1.2,
        is_at_desk=True,
        squeeze_pressure=1024,
        bpm=74,
        focus_score=66,
        source="dual_ble_gateway",
    )
    assert out["user_id"] == "u1"
    assert out["hrv"] == 31.2
    assert out["stress_level"] == 44
    assert out["squeeze_pressure"] == 1024


def test_todo_upsert_insert_then_update():
    client = FakeClient()
    repo = SupabaseRepository(client)

    inserted = repo.upsert_todo(
        user_id="u1",
        content="task",
        start_time="2026-04-05T10:00:00Z",
        end_time="2026-04-05T11:00:00Z",
        status="pending",
    )
    assert inserted["content"] == "task"
    assert inserted["status"] == "pending"
    assert client.tables["todos"].last_action == "insert"

    updated = repo.update_todo(user_id="u1", todo_id="t1", status="completed")
    assert updated["status"] == "completed"
    assert client.tables["todos"].last_action == "update"
    assert ("id", "t1") in client.tables["todos"].filters


def test_get_focus_ranking_queries_view():
    client = FakeClient()
    repo = SupabaseRepository(client)
    rows = repo.get_focus_ranking(day="2026-04-04", limit=10)
    assert rows == [{"ok": True}]
    table = client.tables["focus_daily_ranking"]
    assert table.last_action == "select"
    assert ("day", "2026-04-04") in table.filters


def test_get_focus_sessions_falls_back_when_trigger_source_column_is_missing():
    client = FakeClient()
    table = client.table("focus_sessions")
    table.fail_on_select_contains = "trigger_source"
    repo = SupabaseRepository(client)

    rows = repo.get_focus_sessions(user_id="u1", limit=5)

    assert rows == [{"ok": True, "trigger_source": "manual"}]
