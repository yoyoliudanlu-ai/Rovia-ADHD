# Supabase Backend

这个目录对应你提的 4/5 两项后端需求：

- Todo / HRV / 压力数据同步到 Supabase
- 多用户专注排行数据

## 目录说明

- `migrations/20260404_0001_core_schema.sql`
  创建并补齐 `telemetry_data`、`todos`、`focus_sessions`。
- `migrations/20260404_0002_focus_ranking.sql`
  创建 `focus_daily_ranking` 视图（按日、按用户聚合专注时长）。
- `scripts/enable_rls.sql`
  开启并配置三张表的 RLS。
- `client.py`
  从环境变量创建 Supabase Client。
- `repository.py`
  统一封装遥测写入、Todo 增删改查、专注会话、排行查询。

## 依赖环境变量

- `SUPABASE_URL`
- `SUPABASE_KEY`

## Python 侧调用示例

```python
from backend.supabase.client import create_supabase_from_env
from backend.supabase.repository import SupabaseRepository

repo = SupabaseRepository(create_supabase_from_env())

repo.insert_telemetry(
    user_id="49d91ddd-a62d-488e-90b1-f80bd5434987",
    hrv=36.8,
    stress_level=42,
    distance_meters=0.92,
    is_at_desk=True,
)

todos = repo.list_todos(user_id="49d91ddd-a62d-488e-90b1-f80bd5434987")
ranking = repo.get_focus_ranking(day="2026-04-04", limit=20)
```

