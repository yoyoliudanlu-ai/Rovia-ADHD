# Bluetooth Transfer Bundle 接入说明

## 结论

`backend/bluetooth_transfer_bundle` 不是一套新的独立协议，而是当前主 `backend` 蓝牙链路的整理包。  
也就是说，`webped` 现在不需要再额外接一套新接口，应该继续使用现有：

- HTTP: `http://127.0.0.1:8000`
- WebSocket: `ws://127.0.0.1:8000/ws/telemetry`

整理包的价值主要是明确了当前蓝牙数据口径和运行边界。

## 当前协议口径

### 手环

- 支持两类输入：
  - UTF-8 JSON
  - 2 字节二进制

- 当前已确认二进制格式：
  - `byte[0] = SDNN(ms)`
  - `byte[1] = focus_state`

- 后端解析后输出：
  - `sdnn`
  - `hrv`
  - `focus`
  - `stress_level`
  - `metrics_status`

### 捏捏

- 当前按 `uint16 little-endian` 解析压力原始值
- 原始值范围：`0..4095`

- 后端解析后输出：
  - `pressure_raw`
  - `pressure_norm`
  - `stress_level`
  - `squeeze_count`
  - `battery`

## 与 webped 的对接关系

`webped` 目前已经能直接消费 backend 的 WS/HTTP：

- WS 事件：
  - `snapshot`
  - `wristband`
  - `squeeze`
  - `presence`

- HTTP 接口：
  - `GET /api/telemetry/latest`
  - `GET /api/todos`
  - `GET /api/focus/sessions`
  - `POST /api/todos`
  - `PATCH /api/todos/{id}`
  - `POST /api/focus/start`
  - `POST /api/focus/finish`

关键接入文件：

- [src/main/backend-adapter.js](/Users/zhangjiayi/.codex/webped/src/main/backend-adapter.js)
- [src/main/backend-http-client.js](/Users/zhangjiayi/.codex/webped/src/main/backend-http-client.js)
- [src/main/state-manager.js](/Users/zhangjiayi/.codex/webped/src/main/state-manager.js)

## 已按 README 对齐的点

- 主 backend 的手环默认设备名已设为 `ZhiYa-Wristband`
- 主 backend 的捏捏默认设备名已设为 `ZhiYa-NieNie`
- 手环默认输入特征已设为 `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- 新增环境模板：
  - [backend/.env.example](/Users/zhangjiayi/.codex/webped/backend/.env.example)

## 需要你确认的点

- `SQUEEZE_NOTIFY_CHAR_UUID`
  - 整理包 README 没把它定死
  - 如果不填，backend 会自动探测 notify/read 特征
  - 如果你们已经确认真机 UUID，建议显式填入

- 手环提醒回写特征
  - `WRISTBAND_ALERT_CHAR_UUID`
  - 不填的话，后端不会给手环回写离位提醒

## 推荐启动方式

只做接口联调：

```bash
ENABLE_BLE_RUNNER=0 ADHD_USER_ID=<uuid> uvicorn backend.api.server:app --host 127.0.0.1 --port 8000
```

接真机蓝牙：

```bash
cp backend/.env.example backend/.env
# 补充 SUPABASE_URL / SUPABASE_KEY / ADHD_USER_ID / 设备名 / UUID
uvicorn backend.api.server:app --host 127.0.0.1 --port 8000
```

桌宠接 backend：

```bash
ADHD_API_URL=http://127.0.0.1:8000 \
ROVIA_SIDECAR_URL=ws://127.0.0.1:8000/ws/telemetry \
npm start
```

## 现阶段最适合直接使用的数据

- 手环：
  - `sdnn`
  - `focus`
  - `stress_level`
  - `metrics_status`

- 捏捏：
  - `pressure_raw`
  - `pressure_norm`
  - `stress_level`

- 在位：
  - `rssi`
  - `distance_m`
  - `is_at_desk`

这些字段已经能直接驱动桌宠状态、捏捏看板和面板数据。
