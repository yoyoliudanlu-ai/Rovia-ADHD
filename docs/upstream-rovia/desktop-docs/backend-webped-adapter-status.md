# Webped x Backend 接入状态

## 当前已经接通的部分

- WebSocket 实时链路
  - 来源：`ws://<backend>/ws/telemetry`
  - 已接事件：`snapshot`、`wristband`、`squeeze`、`presence`
  - 入口文件：[src/main/backend-adapter.js](/Users/zhangjiayi/.codex/webped/src/main/backend-adapter.js)

- HTTP 数据链路
  - `GET /api/telemetry/latest`
  - `GET /api/todos`
  - `GET /api/focus/sessions`
  - `POST /api/todos`
  - `PATCH /api/todos/{id}`
  - `DELETE /api/todos/{id}`
  - `POST /api/focus/start`
  - `POST /api/focus/finish`
  - 入口文件：[src/main/backend-http-client.js](/Users/zhangjiayi/.codex/webped/src/main/backend-http-client.js)

- 主状态机接入
  - `syncMode` 新增 `backend`
  - `Todo / Focus` 在 backend 模式下会优先走 HTTP，同步结果回写到本地 state
  - 入口文件：[src/main/state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js)

## 适合直接使用的数据

- 手环：
  - `sdnn`
  - `hrv`
  - `focus`
  - `stress_level`

- 捏捏：
  - `pressure_raw`
  - `pressure_norm`
  - `stress_level`

- 距离：
  - `rssi`
  - `distance_m`
  - `is_at_desk`

- 业务：
  - `todos.task_text`
  - `todos.is_completed`
  - `todos.priority`
  - `focus_sessions.duration_minutes`
  - `focus_sessions.status`
  - `focus_sessions.trigger_source`

## 已做的数据处理

- `pressure_norm 0..1 -> pressurePercent 0..100`
- `pressure_raw 0..4095 -> pressureRaw`
- `is_at_desk -> presenceState(near/far)`
- `wristband.focus -> focusScore`
- `wristband.stress_level / squeeze.stress_level -> stressScore`
- `focus_sessions.running -> focusing`
- `todos.is_completed -> pending/done`
- backend 事件 `{ event, data } -> webped 内部事件 { type, ... }`

## 仍需注意的点

- `focus_sessions` 后端没有 `taskTitle / todoId / awayCount`，这些字段目前由桌面端本地补齐。
- `todos` 后端没有 `tag / isActive`，这两个字段目前仍由桌面端维护。
- `bpm` 还不适合作为落库字段依赖；后端 repository 目前没有正式保存它。

## 启动方式

```bash
ADHD_API_URL=http://127.0.0.1:8000 \
ROVIA_SIDECAR_URL=ws://127.0.0.1:8000/ws/telemetry \
npm start
```

## 关键文件

- [src/main/main.js](/Users/zhangjiayi/.codex/webped/src/main/main.js)
- [src/main/backend-adapter.js](/Users/zhangjiayi/.codex/webped/src/main/backend-adapter.js)
- [src/main/backend-http-client.js](/Users/zhangjiayi/.codex/webped/src/main/backend-http-client.js)
- [src/main/state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js)
- [docs/backend-interface-assessment-latest.md](/Users/zhangjiayi/.codex/webped/docs/backend-interface-assessment-latest.md)
