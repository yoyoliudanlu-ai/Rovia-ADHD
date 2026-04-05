# ADHD 文件夹总结

更新时间：2026-04-05  
范围：`/Users/zhangjiayi/.codex/webped/ADHD`

## 1. 一句话概览

`ADHD` 是一套“手环 + 捏捏 + 桌宠 + Supabase”的完整原型仓结构，已经具备双蓝牙采集、压力/HRV算法、桌面端展示、云端同步与基础测试；移动端目前仍是预留目录。

## 2. 目录结构（已过滤 build / __pycache__ / .venv）

可维护文件约 `62` 个，核心分层如下：

- `backend/`：双 BLE 网关、算法、Supabase 读写封装、SQL migration、RLS 脚本
- `frontend/`：PyQt6 桌宠（含 tray、BLE worker、窗口逻辑），以及 `mobile_app` 预留目录
- `device/`：ESP-IDF 手环固件、桌面网关脚本、距离调试工具、归档文件
- `tests/`：后端算法/仓储测试 + 前端运行时/遥测解析测试
- `docs/`：总览文档、前后端文档、端侧文档、实施计划文档

## 3. 当前主链路

文档定义的目标闭环为：

`手环(BLE) + 捏捏(BLE) -> 电脑后端网关 -> Supabase -> 桌面宠物/手机端`

对照代码，主链路入口分别是：

- 后端服务入口：`ADHD/backend/gateway/run_service.py`
- 桌宠入口：`ADHD/frontend/desktop_pet/main.py`
- 手环固件入口：`ADHD/device/wristband/main/main.c`

## 4. 分层能力总结

### 4.1 Backend（`ADHD/backend`）

已实现：

- 双设备 BLE 网关（手环 + 捏捏）与并发连接：`gateway/dual_ble_gateway.py`
- RSSI 阈值提醒回写（默认 `-60 dBm`）与冷却机制
- HRV/压力算法：`compute_rmssd`、`compute_sdnn`、`stress_from_rmssd`、`fuse_stress` 等（`gateway/algorithms.py`）
- Supabase 仓储封装：遥测、Todo、Focus Session、排行榜（`supabase/repository.py`）
- 数据库迁移与 RLS：
  - `migrations/20260404_0001_core_schema.sql`
  - `migrations/20260404_0002_focus_ranking.sql`
  - `scripts/enable_rls.sql`

注意：

- `run_service.py` 运行依赖 `ADHD_USER_ID` 环境变量。
- `focus_sessions.status` 在 SQL 里约束为 `running/completed/canceled`，与某些上层状态映射需要保持一致。

### 4.2 Frontend（`ADHD/frontend`）

桌宠端已实现原型：

- PyQt6 桌宠主窗口、托盘、BLE 线程、运行时环境处理
- BLE Worker 同时支持手环与捏捏通知解析（`desktop_pet/ble_worker.py`）
- 遥测解析逻辑（`desktop_pet/telemetry.py`）

移动端现状：

- `frontend/mobile_app` 只有 README，尚无工程代码。

### 4.3 Device（`ADHD/device`）

已实现：

- ESP-IDF 手环固件可每秒推送 JSON（BPM/RMSSD/SDNN/focus）：
  - `device/wristband/main/main.c`
  - `device/wristband/main/max30102.c`
  - `device/wristband/main/ble_hrv.c`
- 桌面侧 BLE 在位检测脚本与距离测试工具：
  - `device/desktop_gateway/ble_presence.py`
  - `device/desktop_gateway/tools/ble_distance_test.py`

现状差异：

- `device/wristband/build/` 存在大量编译产物，建议不纳入版本管理主路径。

### 4.4 Tests（`ADHD/tests`）

已有测试 4 组：

- `tests/backend/gateway/test_algorithms.py`
- `tests/backend/supabase/test_repository.py`
- `tests/frontend/desktop_pet/test_runtime.py`
- `tests/frontend/desktop_pet/test_telemetry.py`

覆盖重点：

- 算法函数正确性
- Supabase repository 字段映射与查询行为
- 桌宠运行时路径设置
- 传感器 payload 解析

## 5. 与文档目标的一致性

总体一致：`ADHD/docs/*.md` 描述的“双 BLE + 算法 + Supabase + 桌宠原型”在代码里基本都能找到对应实现。  
主要未完成项也与文档一致：移动端未落地、手环物理按键/震动反馈链路尚未完整进入主流程。

## 6. 关键风险与改进建议

- 凭证安全风险：
  - `ADHD/frontend/desktop_pet/main.py`
  - `ADHD/device/desktop_gateway/ble_presence.py`
  当前含硬编码 `SUPABASE_URL / KEY / USER_UUID`，建议改为 `.env` 读取并移除明文配置。
- 代码重复风险：
  - 桌面侧同时有 `frontend/desktop_pet/ble_worker.py` 与 `device/desktop_gateway/ble_presence.py` 两套 BLE 逻辑，阈值与职责易漂移，建议合并/抽象公共层。
- 仓库整洁性风险：
  - `device/wristband/build/` 体量大，建议通过 `.gitignore` 管理构建产物。

## 7. 可直接执行的下一步

1. 统一 BLE 网关实现（提取共享模块，桌宠与后端共用同一套采集/判定逻辑）。
2. 清理硬编码凭证，统一环境变量入口（`SUPABASE_URL/SUPABASE_KEY/ADHD_USER_ID`）。
3. 以 `focus_sessions` 为核心，先补移动端最小 MVP（登录 + Todo + 倒计时页）。
