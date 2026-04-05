# backend 2 接口梳理与 webped 接入评估

## 目标目录

本次梳理基于 [backend 2](/Users/zhangjiayi/.codex/webped/backend%202)。

它不是单纯的 Supabase schema，而是一套完整的后端链路：

- `api/`: FastAPI 服务，对外提供 HTTP + WebSocket
- `gateway/`: 双 BLE 网关、解析器、HRV/压力算法
- `supabase/`: Supabase client、repository、migration、RLS

## 整体数据流

当前 backend 2 的主链路是：

1. BLE 手环和捏捏数据进入 `api/ble_runner.py`
2. `gateway/parsers.py` 解析原始 payload
3. `api/store.py` 把结果写入内存快照 `telemetry_store`
4. `api/ws.py` 通过 `ws://localhost:8000/ws/telemetry` 实时广播给前端
5. `api/routes/telemetry.py` 通过 HTTP 提供最新快照和历史数据
6. `api/ble_runner.py` 或 `gateway/service.py` 周期性把数据写到 Supabase

对 webped 来说，这套后端最适合承担两件事：

- 真实硬件接入层
- 硬件数据归一化和聚合层

而 UI 状态机、桌宠表现、面板展示仍然应该由 webped 自己控制。

## 接口清单

### WebSocket

#### `WS /ws/telemetry`

连接后立即推一次 `snapshot`，之后按设备实时推送。

消息格式：

```json
{ "event": "snapshot" | "wristband" | "squeeze", "data": { ... } }
```

适合 webped 使用的字段：

- `data.wristband.hrv`
- `data.wristband.sdnn`
- `data.wristband.focus`
- `data.wristband.stress_level`
- `data.squeeze.pressure_raw`
- `data.squeeze.pressure_norm`
- `data.squeeze.squeeze_count`
- `data.presence.rssi`
- `data.presence.distance_m`
- `data.presence.is_at_desk`
- `data.meta.updated_at`

### Telemetry HTTP

#### `GET /api/telemetry/latest`

返回当前内存快照，字段结构与 `snapshot` 相同。

适合用途：

- 面板初次加载时拉一次最新状态
- WebSocket 断开后的兜底轮询

#### `GET /api/telemetry/history`

从 `telemetry_data` 拉历史数据。

适合用途：

- 后续做趋势图
- 今日专注 / 压力回顾
- 捏捏频率和压力回放

### Devices HTTP

#### `GET /api/devices/status`

提供手环和捏捏的连接状态。

适合用途：

- 桌面端隐藏页或 Apple 顶部状态栏里的设备状态
- 设备诊断提示

#### `GET /api/devices/scan`
#### `GET /api/devices/scan/raw`
#### `GET /api/devices/config`
#### `POST /api/devices/configure`

适合用途：

- 设备配对和调试页
- 选择设备名和输入特征 UUID

这组接口更适合留在“设置/诊断”层，不建议直接驱动桌宠状态。

### Todo HTTP

#### `GET /api/todos`
#### `POST /api/todos`
#### `PATCH /api/todos/{id}`
#### `DELETE /api/todos/{id}`

适合用途：

- 任务列表
- 当前任务编辑
- 勾选完成

### Focus HTTP

#### `POST /api/focus/start`
#### `POST /api/focus/finish`
#### `GET /api/focus/sessions`
#### `GET /api/focus/ranking`

适合用途：

- 启动专注
- 结束专注
- 历史专注记录
- 排行榜或社交页

## 适合 webped 直接使用的数据

### 1. 生理与在位状态

这些字段可以直接映射到 webped 现有 `metrics`：

| backend 2 字段 | webped 字段 | 用法 |
|---|---|---|
| `wristband.hrv` | `metrics.hrv` | HRV 展示与状态判断 |
| `wristband.sdnn` | `metrics.sdnn` | HRV 算法补充值 |
| `wristband.focus` | `metrics.focusScore` | 专注度展示 |
| `wristband.stress_level` | `metrics.stressScore` | 压力展示 |
| `presence.rssi` | `metrics.wearableRssi` | 距离状态 |
| `presence.distance_m` | `metrics.distanceMeters` | 距离状态 |
| `presence.is_at_desk` | `metrics.presenceState` | `true -> near`, `false -> far` |
| `meta.updated_at` | `metrics.lastSensorAt` | 数据更新时间 |

### 2. 捏捏压力

这些字段很适合直接用于你现在的捏捏看板和桌宠动效：

| backend 2 字段 | webped 字段 | 用法 |
|---|---|---|
| `squeeze.pressure_raw` | `metrics.pressureRaw` | 原始压力值，范围 `0..4095` |
| `squeeze.pressure_norm` | `metrics.pressurePercent` | 需要乘以 `100` |
| `squeeze.squeeze_count` | `squeeze` 统计 | 可做捏压次数和频率 |
| `squeeze.stress_level` | 可作为辅助展示 | 更适合显示“用力程度”，不建议直接覆盖全部系统压力 |

### 3. Todo

如果你准备让 backend 2 接管任务接口，当前最直接能用的是：

- `id`
- `task_text`
- `is_completed`
- `priority`
- `created_at`

### 4. Focus Sessions

如果你准备让 backend 2 接管专注历史和排行榜，当前最直接能用的是：

- `id`
- `start_time`
- `end_time`
- `status`
- `trigger_source`
- `focus_score`

## 需要处理或转换后再给 webped 使用的数据

### 1. WebSocket 事件格式需要先适配

webped 当前 sidecar 期望收到的是：

```json
{
  "type": "telemetry",
  "hrv": 45,
  "sdnn": 45,
  "focusScore": 42,
  "stressScore": 38,
  "wearableRssi": -58,
  "distanceMeters": 1.2,
  "pressureRaw": 1024,
  "pressurePercent": 25,
  "presenceState": "near"
}
```

但 backend 2 发的是：

```json
{ "event": "snapshot" | "wristband" | "squeeze", "data": { ... } }
```

所以必须加一个 adapter，把 backend 2 的事件统一转成 webped 现有 `ingestSidecarEvent()` 能消费的格式。

推荐映射：

- `snapshot` -> 一次完整 `telemetry`
- `wristband` -> 局部 `telemetry`
- `squeeze` -> 局部 `telemetry` 或 `squeeze_pulse`

### 2. `pressure_norm` 不是百分比

backend 2 的 `pressure_norm` 是 `0..1`。

webped 当前更适合显示：

- `pressureRaw`: `0..4095`
- `pressurePercent`: `0..100`

所以需要做：

```text
pressurePercent = round(pressure_norm * 100)
```

### 3. `is_at_desk` 需要转成本地状态机字段

backend 2 的布尔值：

- `true`
- `false`

webped 当前状态机更适合：

- `near`
- `far`

所以需要做：

- `true -> near`
- `false -> far`

### 4. Todo 字段和 webped 当前字段不一致

webped 当前 todo 更像：

- `title`
- `status`
- `isActive`
- `priority`
- `updatedAt`

backend 2 当前 todo 更像：

- `task_text`
- `is_completed`
- `priority`
- `created_at`

需要做最少映射：

- `task_text -> title`
- `is_completed: true -> status = done`
- `is_completed: false -> status = pending`
- `created_at -> updatedAt`
- `isActive` 需要由 webped 本地自己维护，backend 2 当前没有这个字段

### 5. Focus Session 字段也需要映射

webped 当前 focus session 更像：

- `durationSec`
- `status: focusing | away | completed | interrupted | canceled`
- `startedAt`
- `endedAt`

backend 2 / API.md 当前更像：

- `duration_minutes` 或 `duration`
- `status: running | completed | interrupted | canceled`
- `start_time`
- `end_time`

需要做：

- `duration_minutes * 60 -> durationSec`
- `running -> focusing`
- `start_time -> startedAt`
- `end_time -> endedAt`

同时要注意：backend 2 当前没有 `away` 这个中间状态。

## 当前最适合你接入的接口

如果目标是“尽快把 backend 2 接入 webped”，优先级建议是：

### P0 直接接

1. `WS /ws/telemetry`
2. `GET /api/telemetry/latest`
3. `GET /api/todos`
4. `POST /api/todos`
5. `PATCH /api/todos/{id}`
6. `DELETE /api/todos/{id}`
7. `POST /api/focus/start`
8. `POST /api/focus/finish`
9. `GET /api/focus/sessions`

这几组已经足够把：

- 桌宠实时状态
- 捏捏看板
- TodoList
- 专注开始/结束
- 历史记录

串成闭环。

### P1 再接

1. `GET /api/focus/ranking`
2. `GET /api/devices/status`
3. `GET /api/devices/config`
4. `POST /api/devices/configure`
5. `GET /api/telemetry/history`

这些更适合补充：

- 社交/好友页
- 设备调试页
- 趋势图和复盘页

## backend 2 当前需要你特别注意的问题

这里有几处“接口文档和真实实现不完全一致”的地方，接入前最好先修。

### 1. `telemetry_data` 同步代码和 repository 方法签名不一致

`api/ble_runner.py` 和 `gateway/service.py` 调用了：

- `squeeze_pressure`
- `bpm`
- `focus_score`
- `source`

但 `supabase/repository.py` 里的 `insert_telemetry()` 当前只接收：

- `hrv`
- `stress_level`
- `distance_meters`
- `is_at_desk`

这意味着当前“周期性同步到 Supabase”大概率会因为额外参数报错后被吞掉，属于接入前必须修的问题。

### 2. `focus_sessions` 的字段定义前后不一致

`API.md` 和 `api/routes/focus.py` 使用的是：

- `duration_minutes`
- `is_active`
- `status = interrupted`

但 `supabase/migrations/20260404_0001_core_schema.sql` 更接近：

- `duration`
- 没有 `is_active`
- `status` 只允许 `running/completed/canceled`

这部分如果不统一，前端会很难稳定对接。

### 3. `todos` 表结构有两套版本

`repository.py` 还在用旧字段：

- `task_text`
- `is_completed`
- `priority`

但 `20260405_0003_todos_schedule_and_status.sql` 又引入了新字段：

- `content`
- `start_time`
- `end_time`
- `status`

如果你准备把 backend 2 当成正式接口源，这里必须先确定最终 schema。

### 4. backend 2 当前没有真正的登录态

它依赖环境变量：

- `ADHD_USER_ID`

这意味着它更像“单用户开发态后端”，不是多用户登录态后端。  
如果你要跟 webped 当前的 Supabase 登录/登出联动，需要改成：

- 前端把用户 token 带过来
- 或后端能根据 session / jwt 识别 `auth.uid()`

## 对 webped 的接入建议

最稳的做法不是让 webped 完全改用 backend 2 的数据结构，而是在 webped 里加一个适配层。

推荐拆成两层：

### 1. `Backend2Client`

负责：

- 连接 `WS /ws/telemetry`
- 请求 `latest/history`
- 请求 `todos/focus/devices`

### 2. `Backend2Adapter`

负责把 backend 2 的原始字段映射成 webped 现有字段：

- `event/data -> type`
- `pressure_norm -> pressurePercent`
- `is_at_desk -> presenceState`
- `task_text -> title`
- `duration_minutes -> durationSec`
- `running -> focusing`

这样做的好处是：

- 不用大改现有桌宠状态机
- 可以同时保留当前 Supabase schema 兼容层
- 后面 backend 2 再变动时，影响面更小

## 结论

backend 2 里最适合你直接拿来用的是两类数据：

1. 硬件实时数据  
`wristband / squeeze / presence` 这组非常适合驱动桌宠、捏捏看板和专注状态判断。

2. 基础业务接口  
`todos / focus / telemetry latest/history` 这组已经够支撑 webped 当前 MVP。

最需要你额外处理的是三类问题：

1. WebSocket 事件格式适配
2. Todo / Focus / Telemetry 字段命名映射
3. backend 2 内部 schema 与 repository 不一致的问题

如果先修掉 schema 不一致，backend 2 是可以作为 webped 硬件后端接入层来用的。
