# backend 接口梳理与 webped 接入评估

## 范围

本次梳理基于当前仓库内的 [backend](/Users/zhangjiayi/.codex/webped/backend)。

当前 `backend` 已经不是占位目录，而是一套完整的三层后端：

- `api/`：FastAPI 服务，对外暴露 HTTP 和 WebSocket
- `gateway/`：双 BLE 接入、解析、算法、提醒与同步
- `supabase/`：Supabase client、repository、migration、RLS

## 总体判断

这版 `backend` 已经比之前明显更统一，适合作为 `webped` 的“硬件后端 + 数据接口层”。

最适合直接接入 `webped` 的有两类：

1. 实时硬件数据
2. Todo / Focus / Telemetry 的基础业务接口

但仍然有两类问题要注意：

1. 后端内部还有少量 schema 历史包袱
2. `backend` 输出的数据格式和 `webped` 当前内部状态模型并不完全一致，仍需要一层 adapter

## backend 的真实数据流

当前主链路是：

1. 蓝牙设备数据进入 [api/ble_runner.py](/Users/zhangjiayi/.codex/webped/backend/api/ble_runner.py)
2. 使用 [gateway/parsers.py](/Users/zhangjiayi/.codex/webped/backend/gateway/parsers.py) 解析手环和捏捏 payload
3. 写入 [api/store.py](/Users/zhangjiayi/.codex/webped/backend/api/store.py) 的内存快照
4. 通过 [api/ws.py](/Users/zhangjiayi/.codex/webped/backend/api/ws.py) 广播 WebSocket
5. 同时周期性写入 Supabase，入口在 [gateway/service.py](/Users/zhangjiayi/.codex/webped/backend/gateway/service.py) 或 [api/ble_runner.py](/Users/zhangjiayi/.codex/webped/backend/api/ble_runner.py)

## 对外接口

接口文档主入口在 [API.md](/Users/zhangjiayi/.codex/webped/backend/API.md)。

### WebSocket

#### `WS /ws/telemetry`

消息格式：

```json
{ "event": "<event>", "data": { ... } }
```

当前事件类型：

- `snapshot`
- `wristband`
- `squeeze`
- `presence`

### Telemetry

- `GET /api/telemetry/latest`
- `GET /api/telemetry/history`

### Devices

- `GET /api/devices/status`
- `GET /api/devices/scan`
- `GET /api/devices/scan/raw`
- `GET /api/devices/config`
- `POST /api/devices/configure`

### Todo

- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{id}`
- `DELETE /api/todos/{id}`

### Focus

- `POST /api/focus/start`
- `POST /api/focus/finish`
- `GET /api/focus/sessions`
- `GET /api/focus/ranking`

## 适合你直接使用的数据

下面这些字段最适合直接接到 `webped` 里。

### 1. 手环实时数据

来源：

- `snapshot.data.wristband`
- `wristband` event

可直接使用的字段：

- `sdnn`
- `hrv`
- `focus`
- `stress_level`
- `metrics_status`

适合接到 `webped` 的位置：

- `metrics.hrv`
- `metrics.sdnn`
- `metrics.focusScore`
- `metrics.stressScore`

用途：

- 专注状态判断
- 压力状态展示
- Rovia 动效强弱
- Focus 页实时指标

### 2. 捏捏实时数据

来源：

- `snapshot.data.squeeze`
- `squeeze` event

可直接使用的字段：

- `pressure_raw`
- `pressure_norm`
- `stress_level`
- `squeeze_count`
- `battery`

其中最适合直接用的是：

- `pressure_raw`
- `pressure_norm`

原因：

- `pressure_raw` 是真实原始值，范围明确为 `0..4095`
- `pressure_norm` 已归一化为 `0..1`

适合接到 `webped` 的位置：

- `metrics.pressureRaw`
- `metrics.pressurePercent`
- 捏捏页看板
- 桌宠颜色和形变强度

### 3. 在位与距离数据

来源：

- `snapshot.data.presence`
- `presence` event

可直接使用的字段：

- `rssi`
- `distance_m`
- `is_at_desk`

适合接到 `webped` 的位置：

- `metrics.wearableRssi`
- `metrics.distanceMeters`
- `metrics.presenceState`

用途：

- 判断 near / far
- Away 状态切换
- 远离桌面提醒

### 4. Todo 数据

来源：

- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{id}`

可直接使用的字段：

- `id`
- `task_text`
- `is_completed`
- `priority`
- `start_time`
- `end_time`
- `created_at`

适合用途：

- 面板 TodoList
- 当前任务编辑
- 完成状态同步

### 5. Focus Session 数据

来源：

- `POST /api/focus/start`
- `POST /api/focus/finish`
- `GET /api/focus/sessions`
- `GET /api/focus/ranking`

可直接使用的字段：

- `id`
- `start_time`
- `end_time`
- `duration_minutes`
- `status`
- `is_active`
- `trigger_source`

适合用途：

- 专注开始/结束
- 历史专注记录
- 排行榜

## 需要处理后再使用的数据

这部分不是不能用，而是不能原样喂给 `webped`。

### 1. WebSocket 事件格式

`backend` 当前发的是：

```json
{ "event": "snapshot", "data": { ... } }
```

但 `webped` 当前最适合消费的是：

```json
{ "type": "telemetry", ... }
```

`webped` 现有入口在 [state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js) 的 `ingestSidecarEvent()`。

所以需要一个 adapter，把：

- `snapshot`
- `wristband`
- `squeeze`
- `presence`

转换成：

- `telemetry`
- `squeeze_pulse`
- `band_alert`

### 2. `pressure_norm`

`backend` 的 `pressure_norm` 是 `0..1`。  
`webped` 当前更习惯用 `0..100` 的百分比。

所以要先做：

```text
pressurePercent = pressure_norm * 100
```

### 3. `is_at_desk`

`backend` 是布尔值：

- `true`
- `false`

但 `webped` 当前状态机更适合：

- `near`
- `far`

所以需要映射：

- `true -> near`
- `false -> far`

### 4. Todo 字段

`backend` 用的是：

- `task_text`
- `is_completed`

而 `webped` 当前 Todo 模型更接近：

- `title`
- `status`
- `isActive`
- `priority`
- `updatedAt`

推荐映射：

- `task_text -> title`
- `is_completed = true -> status = done`
- `is_completed = false -> status = pending`
- `created_at/start_time/end_time` 保留为扩展字段

其中 `isActive` 后端目前没有，需要由 `webped` 本地维护。

### 5. Focus 状态值

`backend` 当前 focus status 是：

- `running`
- `completed`
- `canceled`

但 `webped` 当前内部 focus status 是：

- `focusing`
- `away`
- `completed`
- `interrupted`
- `canceled`

所以需要至少做：

- `running -> focusing`
- `completed -> completed`
- `canceled -> canceled`

另外要注意：

- `backend` 当前没有 `away`
- `backend` 当前也没有 `interrupted`

如果 `webped` 仍保留自己的 away 逻辑，这部分可以继续由前端状态机本地维护。

## 当前最适合优先接入的接口

### P0 先接

1. `WS /ws/telemetry`
2. `GET /api/telemetry/latest`
3. `GET /api/todos`
4. `POST /api/todos`
5. `PATCH /api/todos/{id}`
6. `DELETE /api/todos/{id}`
7. `POST /api/focus/start`
8. `POST /api/focus/finish`
9. `GET /api/focus/sessions`

这些已经足够支撑：

- 桌宠实时状态
- 捏捏实时看板
- Todo 面板
- 专注会话
- 历史记录

### P1 再接

1. `GET /api/focus/ranking`
2. `GET /api/telemetry/history`
3. `GET /api/devices/status`
4. `GET /api/devices/config`
5. `POST /api/devices/configure`
6. `GET /api/devices/scan/raw`

这些更适合：

- 社交/好友页
- 趋势图
- 设备诊断页

## 当前后端里仍需要注意的问题

这版后端比上次好了很多，但还有几处需要你心里有数。

### 1. repository 和 gateway 还有一个小的不一致

[gateway/service.py](/Users/zhangjiayi/.codex/webped/backend/gateway/service.py) 里仍然在传：

- `bpm`

但 [supabase/repository.py](/Users/zhangjiayi/.codex/webped/backend/supabase/repository.py) 的 `insert_telemetry()` 目前没有接收 `bpm`。

也就是说：

- HTTP / WS 层能正常用
- Supabase 落库层里 `bpm` 目前不会被真正保存

### 2. migrations 仍有历史过渡字段

例如：

- `focus_sessions` 的早期 migration 里还是 `duration`
- `todos` 目录里同时存在旧 schema 和补丁 migration

但从目前的 API 和 repository 来看，实际要对接的“接口合同”已经基本稳定成：

- `focus_sessions.duration_minutes`
- `todos.task_text`
- `todos.is_completed`

所以你现在做前端接入时，优先相信：

- `API.md`
- `api/routes/*.py`
- `supabase/repository.py`

不要优先按早期 migration 的旧字段去接。

### 3. 用户身份仍然是固定环境变量模式

当前 API 通过：

- `ADHD_USER_ID`

决定读写哪位用户的数据。  
这说明它现在更像“单用户开发态后端”，不是完整登录态后端。

对你当前 MVP 来说这不是立即阻塞，但如果后面要和 `webped` 的 Supabase 登录态彻底统一，还需要再补 token / auth 方案。

## 推荐接入策略

最稳的做法是：

1. 不直接改 `webped` 现有状态模型
2. 在 `backend -> webped` 中间加一个 adapter
3. 先接 WebSocket 实时数据
4. 再接 HTTP 的 Todo / Focus

推荐新增一个模块，例如：

- `src/main/backend-adapter.js`

让它负责：

- `snapshot -> telemetry`
- `wristband -> telemetry`
- `squeeze -> telemetry + squeeze_pulse`
- `presence -> telemetry`

## 结论

这版最新 `backend` 已经足够支持你开始接入：

- 实时硬件数据
- Todo 数据
- Focus 数据

最适合你直接用的数据是：

- `sdnn / hrv / focus / stress_level`
- `pressure_raw / pressure_norm`
- `rssi / distance_m / is_at_desk`
- `task_text / is_completed / priority`
- `duration_minutes / status / trigger_source`

最需要你处理的数据是：

- `event/data -> type`
- `pressure_norm -> pressurePercent`
- `is_at_desk -> near/far`
- `task_text -> title`
- `is_completed -> status`
- `running -> focusing`

如果你准备继续往下走，下一步最合理的是：

1. 我直接帮你写 `backend -> webped` 的 adapter
2. 或者我先把这份接口评估再补成“前后端字段对照表 + 示例 payload”
