# Runbook

## 0) 仓库根目录

```bash
cd /Volumes/ORICO/项目/ADHD/Rovia-ADHD
```

## 1) API（apps/api）

目录：

- `apps/api`

启动：

```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
ENABLE_BLE_RUNNER=0 .venv/bin/uvicorn backend.api.server:app --host 127.0.0.1 --port 8000 --reload
```

说明：

- `ENABLE_BLE_RUNNER=0` 用于纯前后端联调（无真实 BLE 设备也能跑通）。
- 若要连真实设备，可改为 `ENABLE_BLE_RUNNER=1`。

端口冲突排查（常见于旧 `workspace` 进程）：

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
kill <PID>
```

## 2) Desktop（apps/desktop）

目录：

- `apps/desktop`

安装并启动：

```bash
cd apps/desktop
npm install
ADHD_API_URL=http://127.0.0.1:8000 \
ROVIA_SIDECAR_URL=ws://127.0.0.1:8000/ws/telemetry \
npm start
```

说明：

- `ADHD_API_URL` 指向综合项目 API 后端。
- `ROVIA_SIDECAR_URL` 直接指向 FastAPI 的 `/ws/telemetry`。
- `npm start` 已自动清理 `ELECTRON_RUN_AS_NODE`，避免 Electron 被误当成普通 Node 进程启动。

## 3) 核心接口清单

- `POST /api/auth/sign-in`
- `POST /api/auth/sign-up`
- `POST /api/auth/demo-sign-in`
- `GET /api/auth/session`
- `GET /api/telemetry/latest`
- `GET /api/todos`
- `POST /api/focus/start`
- `POST /api/focus/finish`
- `GET /api/friends/recommendations`
- `GET /api/friends/ranking`
- `WS /ws/telemetry`

## 4) zclaw

目录：

- `hardware/zclaw`

常用命令：

```bash
cd hardware/zclaw
./scripts/build.sh
./scripts/flash.sh
./scripts/provision-dev.sh
./scripts/monitor.sh /dev/cu.usbmodem1101
```

补充说明：

- `zclaw` 当前仍按自己的 README 和脚本体系运行。
- 若要接入 Supabase todo / relay / notifier，请使用其自带 `scripts/`。
- `zclaw` 已移除 HRV 相关功能（MAX30102 工具与 HRV HTTP 服务）。

## 5) nienie / nienie_band

目录：

- `hardware/nienie`
- `hardware/nienie_band`

当前文件：

- `hardware/nienie/nienie.ino`
- `hardware/nienie_band/nienie_band.ino`

说明：

- 两个目录目前是 Arduino sketch 形态，建议在对应目录补齐板卡型号、编译工具链和烧录流程说明。
- 若后续拆成完整工程，保持各自独立目录，不要混入 `zclaw`。

## Validation Checklist

- API 能启动且 `/health` 返回 `{ "ok": true }`
- Desktop 能打开并连接 `ADHD_API_URL`
- WebSocket 能连到 `/ws/telemetry`
- `zclaw` 目录包含 `main/`、`scripts/`、`README.md`
