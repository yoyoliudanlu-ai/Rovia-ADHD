# ADHD Companion 综合项目（统一结构版）

## 项目总览

- 项目名称：`ADHD Companion Monorepo`
- GitHub/Gitee 仓库链接：`<待补充：统一仓库地址>`

统一目录：

```text
workspace/
  apps/
    api/
    desktop/
  hardware/
    zclaw/
    nienie/
    nienie_band/
  docs/
```

---

## 模块 1：API 后端（apps/api）

- 代码/仓库链接（如有）：
  - GitHub/Gitee：`<待补充：同主仓库子目录>`
  - 本地路径：`workspace/apps/api`
- 代码目录结构说明：
  - `backend/api/`：FastAPI 入口、路由、WebSocket、BLE 运行桥接
  - `backend/gateway/`：BLE 解析与信号算法
  - `backend/supabase/`：Repository、SQL migration、RLS 脚本
  - `tests/backend/`：后端测试
- 关键代码文件说明：
  - `backend/api/server.py`：服务入口与路由挂载
  - `backend/api/ble_runner.py`：BLE 扫描、连接、重连、遥测同步
  - `backend/api/routes/devices.py`：设备扫描/配置/重连接口
  - `backend/supabase/repository.py`：Todo/Focus/Telemetry 数据访问
  - `backend/gateway/parsers.py`：手环与捏捏数据解析

---

## 模块 2：桌面端（apps/desktop）

- 代码/仓库链接（如有）：
  - GitHub/Gitee：`<待补充：同主仓库子目录>`
  - 本地路径：`workspace/apps/desktop`
- 代码目录结构说明：
  - `src/main/`：Electron 主进程、状态机、后端客户端
  - `src/renderer/`：桌宠界面与面板交互
  - `src/shared/`：共享 schema 与通用映射
  - `sidecar/`：可选 Python sidecar
- 关键代码文件说明：
  - `src/main/main.js`：窗口、托盘、IPC、应用生命周期
  - `src/main/state-manager.js`：核心状态管理与业务编排
  - `src/main/backend-http-client.js`：对接后端 API
  - `src/main/backend-adapter.js`：WS 事件转统一前端事件
  - `src/renderer/panel.js`：任务/设备/好友/账号页逻辑

---

## 模块 3：设备固件（hardware/zclaw）

- 代码/仓库链接（如有）：
  - GitHub：`https://github.com/tnm/zclaw`（上游参考）
  - 本地路径：`workspace/hardware/zclaw`
- 代码目录结构说明：
  - `main/`：ESP-IDF 固件核心
  - `scripts/`：构建、烧录、配置、桥接脚本
  - `test/`：host/api/node 测试
  - `docs/`：设备侧文档
- 关键代码文件说明：
  - `main/main.c`：固件主启动流程
  - `main/agent.c`：Agent 消息处理与工具编排
  - `main/llm.c`：模型请求适配
  - `main/tools_supabase.c`：Supabase todo 工具
  - `main/weixin_mqtt.c`：WeChat MQTT 桥接

说明：当前 `zclaw` 已移除 HRV 相关模块。

---

## 模块 4：捏捏设备（hardware/nienie）

- 代码/仓库链接（如有）：
  - GitHub/Gitee：`<待补充>`
  - 本地路径：`workspace/hardware/nienie`
- 代码目录结构说明：
  - `nienie.ino`：单文件 Arduino sketch
- 关键代码文件说明：
  - `nienie.ino`：FSR 压力采集、贴合状态检测、BLE 压力/状态通知

---

## 模块 5：手环设备（hardware/nienie_band）

- 代码/仓库链接（如有）：
  - GitHub/Gitee：`<待补充>`
  - 本地路径：`workspace/hardware/nienie_band`
- 代码目录结构说明：
  - `nienie_band.ino`：单文件 Arduino sketch
- 关键代码文件说明：
  - `nienie_band.ino`：传感器串口读取、专注按键、蜂鸣器报警、BLE 合并数据发送
