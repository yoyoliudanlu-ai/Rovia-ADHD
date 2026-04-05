# Runbook

## Desktop

目录：

- `workspace/apps/desktop`

安装并启动：

```bash
cd workspace/apps/desktop
npm install
ADHD_API_URL=http://127.0.0.1:8000 \
ROVIA_SIDECAR_URL=ws://127.0.0.1:8000/ws/telemetry \
npm start
```

说明：

- `ADHD_API_URL` 指向综合项目中的 API 后端
- `ROVIA_SIDECAR_URL` 直接指向 FastAPI 的 `/ws/telemetry`
- `npm start` 已自动清理 `ELECTRON_RUN_AS_NODE`，避免 Electron 被误当成普通 Node 进程启动

## API

目录：

- `workspace/apps/api`

启动：

```bash
cd workspace/apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
uvicorn backend.api.server:app --host 0.0.0.0 --port 8000 --reload
```

主要能力：

- `POST /api/auth/sign-in`
- `POST /api/auth/sign-up`
- `POST /api/auth/demo-sign-in`
- `GET /api/auth/session`
- `GET /api/telemetry/latest`
- `GET /api/todos`
- `POST /api/focus/start`
- `GET /api/friends/recommendations`
- `GET /api/friends/ranking`
- `WS /ws/telemetry`

账号与好友说明：

- 桌面端登录、注册、退出登录都优先走 backend auth，而不是 renderer 直连 Supabase
- `demo-sign-in` 会创建一个展示账号，用于账号页、好友页和排行榜演示
- 当前好友页已经改成读 backend 返回的真实接口数据；若要长期保存好友关系，下一步建议把 `profiles / friendships / friend_requests` 迁到 Supabase 表中

设备选择说明：

- 默认不预设手环或捏捏设备名
- 建议先从桌面端设备页扫描附近 BLE 设备，再保存选择
- 当前前端身体信号展示以 `HRV + 压力/按压 + 在位状态` 为主，不再依赖 fake BPM

## zclaw

目录：

- `workspace/hardware/zclaw`

常用命令：

```bash
cd workspace/hardware/zclaw
./scripts/build.sh
./scripts/flash.sh
./scripts/provision-dev.sh
./scripts/monitor.sh /dev/cu.usbmodem1101
```

补充说明：

- `zclaw` 当前仍按自己的 README 和脚本体系运行
- 若要接入 Supabase todo / relay / notifier，请继续使用它自带的 `scripts/`
- `zclaw` 已移除 HRV 相关功能（MAX30102 工具与 HRV HTTP 服务）
- 其他硬件代码统一放到 `workspace/hardware/uploads/`

## nienie / nienie_band

目录：

- `workspace/hardware/nienie`
- `workspace/hardware/nienie_band`

当前文件：

- `workspace/hardware/nienie/nienie.ino`
- `workspace/hardware/nienie_band/nienie_band.ino`

说明：

- 两个目录目前是 Arduino sketch 形态，建议在对应目录补齐板卡型号、编译工具链和烧录流程说明。
- 若后续拆成完整工程，保持各自独立目录，不要混入 `zclaw`。

## Validation Checklist

- API 能启动且 `/health` 返回 `{ "ok": true }`
- Desktop 能打开并连接 `ADHD_API_URL`
- WebSocket 能连到 `/ws/telemetry`
- `zclaw` 目录包含 `main/`、`scripts/`、`README.md`
