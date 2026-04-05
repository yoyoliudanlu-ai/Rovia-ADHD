# Rovia-ADHD 综合项目（统一结构版）

## 项目总览

- 项目名称：`Rovia-ADHD`
- GitHub 仓库链接：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD`
- 本地根目录：`/Volumes/ORICO/项目/ADHD/Rovia-ADHD`

统一目录：

```text
Rovia-ADHD/
  apps/
    api/
    desktop/
  hardware/
    zclaw/
    nienie/
    nienie_band/
  docs/
  README.md
```

---

## 模块 1：API 后端（apps/api）

- 代码/仓库链接（如有）：
  - GitHub：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD/tree/main/apps/api`
  - 本地路径：`apps/api`
- 代码目录结构说明：
  - `backend/api/`：FastAPI 服务层（路由、鉴权上下文、BLE runner、WebSocket 推送）。
  - `backend/gateway/`：手环/捏捏数据解析与信号处理逻辑。
  - `backend/supabase/`：Supabase 客户端与 Repository 数据访问层。
  - `tests/backend/`：后端单元测试与接口行为测试。
- 关键代码文件说明：
  - `backend/api/server.py`：后端主入口，加载 `.env`，挂载所有路由与 `/ws/telemetry`。
  - `backend/api/routes/auth.py`：注册/登录/demo 登录/会话查询/退出；向前端返回统一 auth 状态。
  - `backend/api/routes/todos.py`：Todo 列表、新增、更新、删除接口；字段映射 `task_text/is_completed/priority/start_time/end_time`。
  - `backend/api/routes/focus.py`：专注会话 start/finish/history/ranking 接口。
  - `backend/api/routes/friends.py`：好友推荐、排行、申请与接受接口（前端社交页依赖）。
  - `backend/api/ble_runner.py`：双设备 BLE 扫描连接、通知处理、遥测入库与广播。
  - `backend/supabase/repository.py`：业务数据访问核心，负责 telemetry、todos、focus、devices 读写。

---

## 模块 2：桌面端（apps/desktop）

- 代码/仓库链接（如有）：
  - GitHub：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD/tree/main/apps/desktop`
  - 本地路径：`apps/desktop`
- 代码目录结构说明：
  - `src/main/`：Electron 主进程逻辑、状态管理、后端 HTTP 客户端、WebSocket 事件适配。
  - `src/renderer/`：桌宠可视化与右侧面板 UI（任务、设备、好友、账号）。
  - `src/shared/`：跨主进程/渲染进程通用 schema、错误映射、设备映射逻辑。
  - `sidecar/`：可选 sidecar 服务（用于扩展本地能力）。
- 关键代码文件说明：
  - `src/main/main.js`：应用生命周期、窗口和 IPC 入口，连接状态管理器与渲染层。
  - `src/main/state-manager.js`：桌面端核心编排层，协调 auth、todo、focus、telemetry、好友状态。
  - `src/main/backend-http-client.js`：前端调用后端 API 的统一封装，负责 token 与字段映射。
  - `src/main/backend-adapter.js`：将后端 WS 快照/事件转成前端内部统一事件格式。
  - `src/renderer/panel.js`：面板交互主逻辑，承接任务管理、设备配置、好友页、账号页行为。

---

## 模块 3：zclaw（hardware/zclaw）

- 代码/仓库链接（如有）：
  - GitHub（本仓库）：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD/tree/main/hardware/zclaw`
  - 上游参考：`https://github.com/tnm/zclaw`
  - 本地路径：`hardware/zclaw`
- 代码目录结构说明：
  - `main/`：ESP-IDF 固件主逻辑（Agent、工具调用、网络连接、协议桥接）。
  - `scripts/`：构建、烧录、配置、设备监控脚本。
  - `test/`：主机侧/接口侧测试。
  - `docs/`：zclaw 运行与接入文档。
- 关键代码文件说明：
  - `main/main.c`：固件启动入口，初始化系统组件与任务循环。
  - `main/agent.c`：Agent 调度与工具执行流程。
  - `main/tools_supabase.c`：Todo 写入与同步相关 Supabase 工具能力。
  - `main/weixin_mqtt.c`：微信侧消息桥接能力，支持 Todo 写入与提醒触发。

说明：`zclaw` 当前已移除 HRV 相关模块，重点转向微信 Todo 检测提醒、长期注意力管理和个性化建议。

---

## 模块 4：捏捏设备（hardware/nienie）

- 代码/仓库链接（如有）：
  - GitHub：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD/tree/main/hardware/nienie`
  - 本地路径：`hardware/nienie`
- 代码目录结构说明：
  - `nienie.ino`：Arduino 单文件工程。
- 关键代码文件说明：
  - `nienie.ino`：FSR 压力采样、按压强度归一化、状态判定、BLE 通知上报。

---

## 模块 5：手环设备（hardware/nienie_band）

- 代码/仓库链接（如有）：
  - GitHub：`https://github.com/yoyoliudanlu-ai/Rovia-ADHD/tree/main/hardware/nienie_band`
  - 本地路径：`hardware/nienie_band`
- 代码目录结构说明：
  - `nienie_band.ino`：Arduino 单文件工程。
- 关键代码文件说明：
  - `nienie_band.ino`：串口传感器读取、按键触发、蜂鸣器提醒、BLE 数据打包发送。
