# Rovia-ADHD

统一的 ADHD 陪伴系统综合项目（桌面端 + 后端 + 硬件端）。

仓库地址：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD`

## 项目结构

```text
Rovia-ADHD/
  apps/
    api/               # FastAPI + BLE + Supabase backend
    desktop/           # Electron desktop app
  hardware/
    zclaw/             # ESP32 firmware runtime (HRV 模块已移除)
    nienie/            # 捏捏模块 Arduino sketch
    nienie_band/       # 手环模块 Arduino sketch
    uploads/           # 其他硬件同学上传入口
  docs/
    migration.md
    runbook.md
    upstream-rovia/
  .env.example
```

## 模块说明

### 1) apps/api

- 目录：`apps/api`
- 入口：`apps/api/backend/api/server.py`
- 作用：提供设备配置、遥测、Todo、Focus、好友、认证与 WebSocket 推送接口。

### 2) apps/desktop

- 目录：`apps/desktop`
- 入口：`apps/desktop/src/main/main.js`
- 作用：桌宠主程序与任务面板，通过 HTTP + WebSocket 对接 `apps/api`。

### 3) hardware/zclaw

- 目录：`hardware/zclaw`
- 入口：`hardware/zclaw/main/main.c`
- 作用：ESP32 设备运行时（Agent、消息桥接、工具调用）。  
- 说明：已移除 HRV 相关模块（MAX30102 工具与 HRV HTTP 服务）。

### 4) hardware/nienie

- 目录：`hardware/nienie`
- 入口：`hardware/nienie/nienie.ino`
- 作用：捏捏压力采集与 BLE 上报。

### 5) hardware/nienie_band

- 目录：`hardware/nienie_band`
- 入口：`hardware/nienie_band/nienie_band.ino`
- 作用：手环传感器读取、专注按键、蜂鸣器与 BLE 上报。

## 快速启动

### 启动 API

```bash
cd apps/api
uvicorn backend.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 启动 Desktop

```bash
cd apps/desktop
npm install
ADHD_API_URL=http://127.0.0.1:8000 \
ROVIA_SIDECAR_URL=ws://127.0.0.1:8000/ws/telemetry \
npm start
```

### 构建 zclaw

```bash
cd hardware/zclaw
./scripts/build.sh
```
