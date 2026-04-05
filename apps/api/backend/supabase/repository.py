"""Supabase repository — 与实际表结构严格对齐。

地基：Supabase public schema CSV（2026-04-05）+ migration 0004 补丁列

  telemetry_data : id, user_id, hrv, stress_level, distance_meters, is_at_desk,
                   squeeze_pressure, focus_score, source, created_at
  focus_sessions : id, user_id, start_time, end_time, duration_minutes,
                   status('running'|'completed'|'canceled'), is_active, trigger_source
  todos          : id, user_id, task_text, is_completed, priority,
                   start_time, end_time, created_at
  profiles       : id, username, target_hrv, updated_at
  devices        : id, user_id, device_name, device_type, last_seen
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

# 允许的 focus_sessions.status 值
FOCUS_STATUS = frozenset({"running", "completed", "canceled"})


class SupabaseRepository:
    def __init__(self, client: Any):
        self.client = client

    @staticmethod
    def _first(resp: Any, fallback: dict) -> dict:
        data = getattr(resp, "data", resp)
        return data[0] if isinstance(data, list) and data else fallback

    # ── 遥测数据 ──────────────────────────────────────────────

    def insert_telemetry(
        self,
        *,
        user_id: str,
        hrv: float | None = None,
        stress_level: int | None = None,
        distance_meters: float | None = None,
        is_at_desk: bool = False,
        squeeze_pressure: float | None = None,
        focus_score: int | None = None,
        source: str = "desktop_gateway",
    ) -> dict:
        payload: dict = {
            "user_id":          user_id,
            "hrv":              hrv,
            "stress_level":     stress_level,
            "distance_meters":  distance_meters,
            "is_at_desk":       is_at_desk,
            "source":           source,
        }
        if squeeze_pressure is not None:
            payload["squeeze_pressure"] = squeeze_pressure
        if focus_score is not None:
            payload["focus_score"] = int(focus_score)
        resp = self.client.table("telemetry_data").insert(payload).execute()
        return self._first(resp, payload)

    # ── Todo ──────────────────────────────────────────────────

    def list_todos(self, *, user_id: str) -> list[dict]:
        resp = (
            self.client.table("todos")
            .select("id, user_id, task_text, is_completed, priority, start_time, end_time, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return list(getattr(resp, "data", resp) or [])

    def create_todo(
        self,
        *,
        user_id: str,
        task_text: str,
        priority: int = 0,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> dict:
        payload: dict = {
            "user_id":      user_id,
            "task_text":    task_text,
            "priority":     max(0, min(2, int(priority))),
            "is_completed": False,
        }
        if start_time is not None:
            payload["start_time"] = start_time
        if end_time is not None:
            payload["end_time"] = end_time
        resp = self.client.table("todos").insert(payload).execute()
        return self._first(resp, payload)

    def update_todo(self, *, user_id: str, todo_id: str, **patch: Any) -> dict:
        # 只允许可更新字段，防止注入其他列
        allowed = {"task_text", "is_completed", "priority", "start_time", "end_time"}
        safe = {k: v for k, v in patch.items() if k in allowed}
        if not safe:
            return {}
        resp = (
            self.client.table("todos")
            .update(safe)
            .eq("id", todo_id)
            .eq("user_id", user_id)
            .execute()
        )
        return self._first(resp, safe)

    def delete_todo(self, *, user_id: str, todo_id: str):
        resp = (
            self.client.table("todos")
            .delete()
            .eq("id", todo_id)
            .eq("user_id", user_id)
            .execute()
        )
        return getattr(resp, "data", resp)

    # ── 专注会话 ──────────────────────────────────────────────

    def start_focus_session(
        self,
        *,
        user_id: str,
        duration_minutes: int = 25,
        trigger_source: str = "manual",
    ) -> dict:
        payload = {
            "user_id":          user_id,
            "duration_minutes": max(1, int(duration_minutes)),
            "status":           "running",
            "is_active":        True,
            "trigger_source":   trigger_source,
        }
        resp = self.client.table("focus_sessions").insert(payload).execute()
        return self._first(resp, payload)

    def finish_focus_session(
        self,
        *,
        user_id: str,
        session_id: str,
        status: str = "completed",
    ) -> dict:
        if status not in FOCUS_STATUS:
            status = "completed"
        now = datetime.now(timezone.utc).isoformat()
        patch = {
            "end_time":  now,
            "status":    status,
            "is_active": False,
        }
        resp = (
            self.client.table("focus_sessions")
            .update(patch)
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
        return self._first(resp, patch)

    def get_focus_sessions(self, *, user_id: str, limit: int = 20) -> list[dict]:
        query_limit = max(1, int(limit))

        def _query(columns: str):
            return (
                self.client.table("focus_sessions")
                .select(columns)
                .eq("user_id", user_id)
                .order("start_time", desc=True)
                .limit(query_limit)
                .execute()
            )

        try:
            resp = _query(
                "id, user_id, start_time, end_time, duration_minutes, status, is_active, trigger_source"
            )
            return list(getattr(resp, "data", resp) or [])
        except Exception as exc:
            if "trigger_source" not in str(exc) or "does not exist" not in str(exc):
                raise

        resp = _query("id, user_id, start_time, end_time, duration_minutes, status, is_active")
        rows = list(getattr(resp, "data", resp) or [])
        return [{**row, "trigger_source": row.get("trigger_source") or "manual"} for row in rows]

    def get_focus_ranking(self, *, day: str | None = None, limit: int = 20) -> list[dict]:
        ranking_day = day or date.today().isoformat()
        try:
            resp = (
                self.client.table("focus_daily_ranking")
                .select("*")
                .eq("day", ranking_day)
                .order("focus_minutes", desc=True)
                .limit(int(limit))
                .execute()
            )
            data = list(getattr(resp, "data", resp) or [])
            if data:
                return data
        except Exception:
            pass

        # 兜底：直接聚合 focus_sessions
        resp = (
            self.client.table("focus_sessions")
            .select("user_id, duration_minutes, status")
            .gte("start_time", f"{ranking_day}T00:00:00+00:00")
            .lte("start_time", f"{ranking_day}T23:59:59+00:00")
            .eq("status", "completed")
            .execute()
        )
        rows = list(getattr(resp, "data", resp) or [])
        totals: dict[str, int] = {}
        counts: dict[str, int] = {}
        for r in rows:
            uid = r.get("user_id", "")
            totals[uid] = totals.get(uid, 0) + int(r.get("duration_minutes") or 0)
            counts[uid] = counts.get(uid, 0) + 1
        return [
            {"user_id": uid, "focus_minutes": m, "completed_sessions": counts[uid]}
            for uid, m in sorted(totals.items(), key=lambda x: -x[1])
        ][:limit]

    # ── 设备注册 ──────────────────────────────────────────────

    def upsert_device(
        self,
        *,
        user_id: str,
        device_name: str,
        device_type: str,
    ) -> dict:
        payload = {
            "user_id":     user_id,
            "device_name": device_name,
            "device_type": device_type,
            "last_seen":   datetime.now(timezone.utc).isoformat(),
        }
        resp = (
            self.client.table("devices")
            .upsert(payload, on_conflict="user_id,device_name")
            .execute()
        )
        return self._first(resp, payload)
