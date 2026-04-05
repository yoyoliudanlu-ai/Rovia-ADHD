# ADHD Companion Backend API

**Base URL:** `http://localhost:8000`  
**WebSocket:** `ws://localhost:8000/ws/telemetry`

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `ADHD_API_URL` | 前端使用的后端地址 | `http://localhost:8000` |
| `ADHD_USER_ID` | 当前用户 UUID | `298bbeb7-452a-4fbb-8fff-32879a62f46a` |
| `SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key | `sb_publishable_...` |

---

## Supabase 表结构（地基）

> 以下为代码唯一参考，运行 `migration 0004` 补全缺失列后与实际 DB 完全对齐。

### `telemetry_data`
| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | bigint | NO | 自增主键 |
| user_id | uuid | NO | |
| hrv | float8 | YES | 存 SDNN 值（ms） |
| stress_level | int4 | YES | 融合压力 0-100 |
| distance_meters | float8 | YES | 估算距离（米） |
| is_at_desk | boolean | YES | 是否在桌前 |
| squeeze_pressure | float8 | YES | 捏捏原始 ADC（0-4095）|
| focus_score | int4 | YES | 专注评分 0-100 |
| source | text | YES | 默认 `desktop_gateway` |
| created_at | timestamptz | YES | 自动填入 |

### `focus_sessions`
| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | NO | |
| user_id | uuid | YES | |
| start_time | timestamptz | YES | 默认 now() |
| end_time | timestamptz | YES | 结束时写入 |
| duration_minutes | integer | YES | 计划时长 |
| status | text | YES | `running` \| `completed` \| `canceled` |
| is_active | boolean | YES | 默认 true |
| trigger_source | text | YES | `manual` \| `wristband_button` \| `squeeze` |

### `todos`
| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | NO | |
| user_id | uuid | NO | |
| task_text | text | NO | |
| is_completed | boolean | YES | 默认 false |
| priority | int2 | YES | 0-2，默认 0 |
| start_time | timestamptz | YES | 计划开始时间 |
| end_time | timestamptz | YES | 计划结束时间 |
| created_at | timestamptz | YES | 自动填入 |

### `profiles`
| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | NO | 等于 auth.uid() |
| username | text | YES | |
| target_hrv | float8 | YES | 目标 SDNN，默认 60.0 |
| updated_at | timestamptz | YES | |

### `devices`
| 列 | 类型 | 可空 | 说明 |
|----|------|------|------|
| id | uuid | NO | |
| user_id | uuid | YES | |
| device_name | text | YES | |
| device_type | text | YES | `wristband` \| `squeeze` |
| last_seen | timestamptz | YES | |

---

## WebSocket

### `WS /ws/telemetry`

连接后立即推送一次完整快照，之后实时推送增量事件。

**消息格式**

```json
{ "event": "<event>", "data": { ... } }
```

| event | 触发时机 |
|-------|---------|
| `snapshot` | 新客户端连接时 |
| `wristband` | 收到手环 BLE 数据 |
| `squeeze` | 收到捏捏 BLE 数据 |
| `presence` | 每次 BLE 扫描周期（约3秒）|

**snapshot data**

```json
{
  "wristband": {
    "sdnn": 45.0,
    "hrv": null,
    "focus": 42,
    "stress_level": 38,
    "metrics_status": "ready"
  },
  "squeeze": {
    "pressure_raw": 1024.0,
    "pressure_norm": 0.25,
    "stress_level": 20,
    "squeeze_count": null,
    "battery": null
  },
  "presence": {
    "rssi": -58.0,
    "distance_m": 1.2,
    "is_at_desk": true
  },
  "meta": { "updated_at": 1712300000.0 }
}
```

**wristband event data**

```json
{
  "sdnn": 45.0,
  "hrv": null,
  "focus": 42,
  "stress_level": 38,
  "metrics_status": "ready"
}
```

**squeeze event data**

```json
{
  "pressure_raw": 2048.0,
  "pressure_norm": 0.5,
  "stress_level": 45,
  "squeeze_count": null,
  "battery": null
}
```

**presence event data**

```json
{
  "rssi": -57.0,
  "distance_m": 0.83,
  "is_at_desk": true
}
```

---

## 遥测

### `GET /api/telemetry/latest`

实时内存快照，不经 Supabase。

```json
{
  "wristband": {
    "sdnn": 45.0,
    "hrv": null,
    "focus": 42,
    "stress_level": 38,
    "metrics_status": "ready"
  },
  "squeeze": {
    "pressure_raw": 1024.0,
    "pressure_norm": 0.25,
    "stress_level": 20,
    "squeeze_count": null,
    "battery": null
  },
  "presence": {
    "rssi": -58.0,
    "distance_m": 1.2,
    "is_at_desk": true
  },
  "meta": { "updated_at": 1712300000.0 }
}
```

### `GET /api/telemetry/history?limit=50&offset=0`

Supabase `telemetry_data`，按 `created_at` 倒序。

```json
{
  "data": [
    {
      "id": 1,
      "user_id": "uuid",
      "hrv": 45.0,
      "stress_level": 38,
      "distance_meters": 1.2,
      "is_at_desk": true,
      "squeeze_pressure": 1024.0,
      "focus_score": 42,
      "source": "desktop_gateway",
      "created_at": "2026-04-05T10:00:00+00:00"
    }
  ],
  "total": 1
}
```

---

## 设备

### `GET /api/devices/status`

```json
{
  "wristband": { "connected": true, "last_seen_s": 1.2, "device_name": "Band-001" },
  "squeeze":   { "connected": true, "last_seen_s": 0.8, "device_name": "NieNie-001" }
}
```

### `GET /api/devices/scan?timeout=5`

```json
{ "devices": ["Band-001", "NieNie-001"] }
```

### `GET /api/devices/config`

```json
{
  "wristband": "Band-001",
  "wristband_uuid": "",
  "squeeze": "NieNie-001",
  "squeeze_uuid": ""
}
```

### `POST /api/devices/configure`

```json
{
  "wristband": "Band-001",
  "wristband_uuid": "",
  "squeeze": "NieNie-001",
  "squeeze_uuid": ""
}
```

Response 同 `GET /api/devices/config`。

---

## Todo

### `GET /api/todos`

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "task_text": "完成报告",
    "is_completed": false,
    "priority": 0,
    "start_time": null,
    "end_time": null,
    "created_at": "2026-04-05T10:00:00+00:00"
  }
]
```

### `POST /api/todos` — 201

```json
{
  "task_text": "完成报告",
  "priority": 1,
  "start_time": "2026-04-05T10:00:00+08:00",
  "end_time": "2026-04-05T12:00:00+08:00"
}
```

`priority`: 0-2，`start_time`/`end_time` 可选。

Response → 新建的 Todo 对象（字段同 GET）。

### `PATCH /api/todos/{id}`

所有字段可选。

```json
{
  "task_text": "修改后的文字",
  "is_completed": true,
  "priority": 2,
  "start_time": "2026-04-05T14:00:00+08:00",
  "end_time": "2026-04-05T15:00:00+08:00"
}
```

Response → 更新后的 Todo 对象。

### `DELETE /api/todos/{id}` — 204

---

## 专注会话

### `POST /api/focus/start`

```json
{ "duration_minutes": 25, "trigger_source": "manual" }
```

`trigger_source`: `manual` | `wristband_button` | `squeeze`

Response:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "duration_minutes": 25,
  "status": "running",
  "is_active": true,
  "trigger_source": "manual",
  "start_time": "2026-04-05T10:00:00+00:00"
}
```

### `POST /api/focus/finish`

```json
{ "session_id": "uuid", "status": "completed" }
```

`status`: `completed` | `canceled`

Response:

```json
{
  "status": "completed",
  "is_active": false,
  "end_time": "2026-04-05T10:25:00+00:00"
}
```

### `GET /api/focus/sessions?limit=20`

```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "start_time": "2026-04-05T10:00:00+00:00",
      "end_time": "2026-04-05T10:25:00+00:00",
      "duration_minutes": 25,
      "status": "completed",
      "is_active": false,
      "trigger_source": "manual"
    }
  ]
}
```

### `GET /api/focus/ranking?day=2026-04-05&limit=20`

```json
[
  { "user_id": "uuid", "focus_minutes": 75, "completed_sessions": 3 }
]
```

---

## 健康检查

### `GET /health`

```json
{ "ok": true }
```

---

## Supabase 入库字段映射

后端每隔 30 秒写一条遥测记录：

| `telemetry_data` 列 | 来源 |
|---------------------|------|
| `hrv` | `wristband.sdnn`（优先）或 `wristband.hrv` |
| `stress_level` | `wristband.stress_level`（融合值）|
| `distance_meters` | `presence.distance_m` |
| `is_at_desk` | `presence.is_at_desk` |
| `squeeze_pressure` | `squeeze.pressure_raw` |
| `focus_score` | `wristband.focus` |
| `source` | 固定为 `desktop_gateway` |

---

## 算法说明

### 专注度 `focus`（0-100）

基于 SDNN 滑动窗口（最近 12 样本）双因子模型：

```
level_score     = linear(mean_sdnn / baseline_sdnn,  floor=0.55, ceiling=1.05) × 70
stability_score = linear(0.32 - coeff_variation,     floor=0.0,  ceiling=0.24) × 30
focus           = level_score + stability_score
```

窗口不足 3 样本时返回 `null`。

### 融合压力 `wristband.stress_level`（0-100）

```
fused = HRV_stress × 0.65 + squeeze_stress × 0.35
```

- **HRV_stress**：`100 - sigmoid(sdnn, mid=50, k=0.08)`
- **squeeze_stress**：`(pressure_norm ^ 0.85) × 100`

任一来源无数据时退化为单源值。

### RSSI → 距离

```
distance_m = 10 ^ ((-59 - rssi) / (10 × 2.4))
```

在位迟滞：RSSI > -55 dBm 进入，≤ -63 dBm 离开。
