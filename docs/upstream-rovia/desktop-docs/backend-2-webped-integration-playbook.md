# backend 2 接入 webped 落地手册

## 目标

把 [backend 2](/Users/zhangjiayi/.codex/webped/backend%202) 作为 `webped` 的硬件后端接入层使用，同时尽量少改现有桌宠状态机。

推荐原则：

- `backend 2` 负责 BLE 接入、原始数据解析、算法和后端接口
- `webped` 负责桌宠状态机、UI 呈现、交互和本地体验
- 中间通过一层 `adapter` 做字段和事件格式转换

## 推荐接入方式

### P0

先接 `backend 2` 的 WebSocket 和基础 HTTP。

这样能最快打通：

- 手环实时数据
- 捏捏实时数据
- 在位状态
- Todo
- 专注开始/结束

### P1

再接：

- `telemetry/history`
- `focus/ranking`
- `devices/status`
- `devices/configure`

## 当前 webped 的接入点

后端实时数据当前是这样进入桌宠的：

1. [main.js](/Users/zhangjiayi/.codex/webped/src/main/main.js#L603) 创建 `SidecarClient`
2. [sidecar-client.js](/Users/zhangjiayi/.codex/webped/src/main/sidecar-client.js#L28) 收到 WebSocket 消息
3. [state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js#L1364) 通过 `ingestSidecarEvent()` 消费事件

也就是说，最小改法不是重写状态机，而是在 `SidecarClient -> ingestSidecarEvent()` 中间插一个 `Backend2Adapter`。

## 推荐新增模块

建议新增一个文件：

- `src/main/backend2-adapter.js`

职责只有一个：

- 把 `backend 2` 的 `{ event, data }` 转成 `webped` 当前能直接消费的事件格式

## 推荐的统一事件格式

`webped` 现有状态机最适合吃这三类事件：

### 1. `telemetry`

```json
{
  "type": "telemetry",
  "physioState": "ready",
  "heartRate": 72,
  "hrv": 45,
  "sdnn": 45,
  "focusScore": 42,
  "stressScore": 38,
  "distanceMeters": 1.2,
  "wearableRssi": -58,
  "pressureRaw": 1024,
  "pressurePercent": 25,
  "pressureLevel": "engaged",
  "presenceState": "near",
  "sourceDevice": "backend2",
  "syncedBySidecar": true
}
```

### 2. `squeeze_pulse`

```json
{
  "type": "squeeze_pulse",
  "timestamp": "2026-04-05T10:00:00.000Z",
  "pressureRaw": 2048,
  "pressurePercent": 50,
  "pressureLevel": "squeeze",
  "sourceDevice": "backend2"
}
```

### 3. `band_alert`

```json
{
  "type": "band_alert",
  "message": "你离桌面有点远了，先回来继续当前任务吧"
}
```

## WebSocket 映射规则

backend 2 当前 WebSocket 是：

- `snapshot`
- `wristband`
- `squeeze`

### `snapshot -> telemetry`

适配规则：

| backend 2 | webped |
|---|---|
| `data.wristband.hrv` | `hrv` |
| `data.wristband.sdnn` | `sdnn` |
| `data.wristband.focus` | `focusScore` |
| `data.wristband.stress_level` | `stressScore` |
| `data.presence.rssi` | `wearableRssi` |
| `data.presence.distance_m` | `distanceMeters` |
| `data.squeeze.pressure_raw` | `pressureRaw` |
| `data.squeeze.pressure_norm * 100` | `pressurePercent` |
| `data.presence.is_at_desk` | `presenceState` |

建议：

- `true -> "near"`
- `false -> "far"`

### `wristband -> telemetry`

只更新这些字段：

- `hrv`
- `sdnn`
- `focusScore`
- `stressScore`

不需要强行覆盖压力和距离。

### `squeeze -> telemetry + squeeze_pulse`

推荐一条 `squeeze` 消息拆成两个本地事件：

1. `telemetry`
2. `squeeze_pulse`

原因：

- `telemetry` 负责更新压力值和桌宠颜色
- `squeeze_pulse` 负责更新 `webped` 当前的捏压频率和时间线统计

## 推荐的状态推导规则

backend 2 没有直接给 `physioState` 和 `pressureLevel`，需要在 adapter 里推导。

### `physioState`

推荐规则：

- `metrics_status === "offline"` -> `unknown`
- `stress_level >= 70` -> `strained`
- `focus >= 60` 且 `stress_level <= 40` -> `ready`
- 其他 -> `unknown`

这样能直接兼容 [state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js#L1184) 当前逻辑。

### `pressureLevel`

推荐规则：

- `pressurePercent >= 78` -> `squeeze`
- `pressurePercent >= 34` -> `engaged`
- `pressurePercent > 0` -> `light`
- 其他 -> `idle`

这样能直接兼容现在捏捏页和桌宠动效。

## HTTP 接口映射

### Todo

backend 2：

- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{id}`
- `DELETE /api/todos/{id}`

webped 当前本地 todo 结构更适合：

```json
{
  "id": "uuid",
  "title": "完成报告",
  "status": "pending",
  "isActive": false,
  "priority": 1,
  "updatedAt": "2026-04-05T10:00:00+00:00"
}
```

推荐映射：

| backend 2 | webped |
|---|---|
| `task_text` | `title` |
| `is_completed = true` | `status = "done"` |
| `is_completed = false` | `status = "pending"` |
| `priority` | `priority` |
| `created_at` 或 `updated_at` | `updatedAt` |

注意：

- `isActive` backend 2 没有，需要 webped 本地自行维护

### Focus Sessions

backend 2：

- `POST /api/focus/start`
- `POST /api/focus/finish`
- `GET /api/focus/sessions`

webped 当前 focus session 结构更适合：

```json
{
  "id": "uuid",
  "taskTitle": "本次专注",
  "status": "focusing",
  "durationSec": 1500,
  "triggerSource": "wearable",
  "startedAt": "2026-04-05T10:00:00+00:00",
  "endedAt": null
}
```

推荐映射：

| backend 2 | webped |
|---|---|
| `duration_minutes` 或 `duration` | `durationSec = value * 60` |
| `status = "running"` | `status = "focusing"` |
| `status = "completed"` | `status = "completed"` |
| `status = "interrupted"` | `status = "interrupted"` |
| `status = "canceled"` | `status = "canceled"` |
| `start_time` | `startedAt` |
| `end_time` | `endedAt` |
| `trigger_source` | `triggerSource` |

## 推荐的代码改动顺序

### 第一步

新增 `backend2-adapter.js`，先只做 WS 适配。

改动点：

- [main.js](/Users/zhangjiayi/.codex/webped/src/main/main.js#L603)
- [sidecar-client.js](/Users/zhangjiayi/.codex/webped/src/main/sidecar-client.js#L1)

目标：

- 让 `ROVIA_SIDECAR_URL=ws://localhost:8000/ws/telemetry` 直接可用

### 第二步

补一个 `backend2-http-client.js`。

职责：

- 请求 `/api/telemetry/latest`
- 请求 `/api/todos`
- 请求 `/api/focus/sessions`

目标：

- 面板打开时先拉一次最新快照和历史

### 第三步

把 `backend2` 的 Todo / Focus 映射到现有 `rovia-schema` 风格。

改动点建议：

- `src/shared/rovia-schema.js`
- 或新增 `src/shared/backend2-schema.js`

### 第四步

再决定是否要让 `webped` 继续自己写 Supabase。

如果 `backend 2` 已经负责写库，更推荐：

- `syncedBySidecar: true`

这样 [state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js#L1384) 会跳过重复写入。

## backend 2 需要先修的地方

这些问题不先统一，前端接起来会非常别扭。

### 1. `insert_telemetry()` 方法签名过旧

[repository.py](/Users/zhangjiayi/.codex/webped/backend 2/supabase/repository.py#L29) 当前只支持：

- `hrv`
- `stress_level`
- `distance_meters`
- `is_at_desk`

但 [ble_runner.py](/Users/zhangjiayi/.codex/webped/backend 2/api/ble_runner.py#L474) 和 [service.py](/Users/zhangjiayi/.codex/webped/backend 2/gateway/service.py#L61) 已经在传：

- `squeeze_pressure`
- `bpm`
- `focus_score`
- `source`

推荐修法：

- 直接扩展 `insert_telemetry()` 参数和 payload
- 与 `20260404_0001_core_schema.sql` 对齐

### 2. `focus_sessions` schema 前后不统一

不一致点：

- 文档和 repository 用 `duration_minutes`、`is_active`
- migration 用 `duration`
- migration 里 `status` 没有 `interrupted`

相关文件：

- [API.md](/Users/zhangjiayi/.codex/webped/backend 2/API.md#L244)
- [repository.py](/Users/zhangjiayi/.codex/webped/backend 2/supabase/repository.py#L98)
- [20260404_0001_core_schema.sql](/Users/zhangjiayi/.codex/webped/backend 2/supabase/migrations/20260404_0001_core_schema.sql#L42)

推荐修法：

- 统一成 `duration_minutes`
- 增加 `is_active`
- `status` 允许 `running/completed/interrupted/canceled`

### 3. `todos` 有两套 schema

旧版：

- `task_text`
- `is_completed`
- `priority`

新版：

- `content`
- `start_time`
- `end_time`
- `status`

相关文件：

- [repository.py](/Users/zhangjiayi/.codex/webped/backend 2/supabase/repository.py#L50)
- [20260405_0003_todos_schedule_and_status.sql](/Users/zhangjiayi/.codex/webped/backend 2/supabase/migrations/20260405_0003_todos_schedule_and_status.sql#L3)

推荐修法二选一：

1. 保留旧版，前端少改
2. 正式切到新版，并同步更新 repository 和 API 文档

如果以 `webped` 当前 MVP 为目标，我更建议先保留旧版，再逐步迁移。

### 4. 当前后端没有真实登录态

`backend 2` 现在依赖：

- `ADHD_USER_ID`

也就是说它当前是“单用户开发态接口”，不是 session-based 用户接口。

如果你要和 `webped` 当前 Supabase 登录态真正统一，后面需要补：

- 基于 `auth.uid()` 的身份识别
- 或桌面端带 token 给后端

## 我建议你现在直接用的数据

如果你马上开始接，我建议优先使用这些：

### 直接接

- `wristband.hrv`
- `wristband.sdnn`
- `wristband.focus`
- `wristband.stress_level`
- `squeeze.pressure_raw`
- `squeeze.pressure_norm`
- `presence.rssi`
- `presence.distance_m`
- `presence.is_at_desk`
- `/api/todos`
- `/api/focus/start`
- `/api/focus/finish`
- `/api/focus/sessions`

### 暂时不要直接相信，先统一

- `telemetry_data` 的入库字段
- `focus_sessions.duration/duration_minutes`
- `focus_sessions.is_active`
- `todos.content/status`

## 推荐的实际实施顺序

1. 先修 backend 2 的 schema / repository 不一致
2. 在 `webped` 增加 `backend2-adapter.js`
3. 让 `webped` 先接 `WS /ws/telemetry`
4. 再接 `/api/todos` 和 `/api/focus/*`
5. 最后再决定是否完全切走当前本地 Supabase 写入逻辑

## 结论

最稳的接法不是让 `webped` 直接改成 backend 2 的内部数据结构，而是：

- 保持 `webped` 现有状态模型不动
- 让 `backend 2` 提供实时数据和基础接口
- 用一层 adapter 完成兼容

这样你可以先很快接上真实硬件数据，同时把后端 schema 收口的风险控制在可管理范围内。
