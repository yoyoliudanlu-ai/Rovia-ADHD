# Rovia Backend 联调指南

## 1. 文档目的

这份文档面向当前项目成员，用来回答一个更实际的问题：

- 现在 `backend/` 目录里到底有什么
- 我们应该怎么把它跑起来
- 桌面端、sidecar、Supabase 目前怎样联调

它和已有文档的关系是：

- [rovia-backend-supabase.md](/Users/zhangjiayi/.codex/webped/docs/rovia-backend-supabase.md)：偏现状分析
- [rovia-backend-interface-spec.md](/Users/zhangjiayi/.codex/webped/docs/rovia-backend-interface-spec.md)：偏接口规范
- 本文档：偏开发联调和执行路径

## 2. 当前 `backend` 学习结果

当前仓库中的 `backend/supabase` 不是完整后端服务，而是一个 Supabase 工作区骨架：

```text
backend/supabase/
├── .env.example
├── README.md
├── migrations/
├── requirements.txt
├── scripts/
└── tests/
    └── test_supabase.py
```

已经表达清楚的方向有：

- 用 Supabase 作为统一数据中心
- 核心表包含 `telemetry_data`、`todos`、`focus_sessions`
- 需要使用 Realtime 做多端同步
- 需要使用 RLS 按 `user_id` 做权限隔离

还没有真正落地的内容有：

- SQL migration
- 建表脚本
- RLS policy 文件
- Realtime 初始化脚本
- 自动化回归测试

## 3. 当前推荐联调链路

### 3.1 角色分工

- 桌面端：展示桌宠状态，读写 Todo 和专注会话
- BLE sidecar：采集 HRV、压力、距离等输入
- Supabase：保存数据并负责实时同步
- 手机端：后续作为多端任务与状态面板

### 3.2 当前最小闭环

现阶段建议先跑通这条最小链路：

1. 在 Supabase 建好基础表
2. 配置 `.env`
3. 用 Python 测试脚本验证三张表都能写
4. 再让桌面端切换到真实 Supabase 配置

## 4. 本地启动步骤

### 4.1 配置环境变量

```bash
cp backend/supabase/.env.example backend/supabase/.env
```

需要填写的字段：

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TEST_USER_ID=
TEST_USER_EMAIL=
TEST_USER_PASSWORD=
```

建议这样理解：

- `SUPABASE_ANON_KEY`：客户端联调用
- `SUPABASE_SERVICE_ROLE_KEY`：管理脚本或初始化脚本用
- `TEST_USER_ID`：测试写入时绑定的用户
- `TEST_USER_EMAIL / TEST_USER_PASSWORD`：当 RLS 需要真实登录态时使用

### 4.2 安装依赖

```bash
cd backend/supabase
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4.3 运行测试

```bash
cd backend/supabase
python tests/test_supabase.py --table telemetry_data
python tests/test_supabase.py --table todos
python tests/test_supabase.py --table focus_sessions
python tests/test_supabase.py --table all
```

## 5. 当前脚本的作用范围

[test_supabase.py](/Users/zhangjiayi/.codex/webped/backend/supabase/tests/test_supabase.py) 现在是一个 smoke test，不是完整测试框架。

它适合验证：

- 环境变量是否配置正确
- Supabase 凭证是否可用
- 三张核心表是否可写
- 当前用户态 / 服务态是否满足策略要求

它暂时不验证：

- Realtime 推送
- 边界 RLS 行为
- 并发写入
- 数据清洗与聚合

## 6. 与桌面端的接口关系

当前桌面端已经具备本地状态机和 UI，后端接入时优先对齐三类能力：

### `telemetry_data`

- 由 sidecar 或桌面端写入
- 用于驱动宠物状态和专注页数据

### `todos`

- 由桌面端和手机端双向维护
- 用于当前任务、待办列表和完成状态同步

### `focus_sessions`

- 由硬件触发或桌面端动作创建
- 用于记录专注开始、取消、完成

更完整的字段与接口建议，参考：

- [rovia-backend-interface-spec.md](/Users/zhangjiayi/.codex/webped/docs/rovia-backend-interface-spec.md)

## 7. 下一步落地建议

为了让 backend 从“说明文档”进入“可部署状态”，建议按这个顺序推进：

1. 补正式 SQL migration，固定三张核心表结构。
2. 为每张表补 `SELECT / INSERT / UPDATE / DELETE` 的 RLS policy。
3. 在 Supabase 打开对应 publication，确认 Realtime 可用。
4. 让桌面端切换到真实 Supabase 环境变量。
5. 再补针对 Realtime 和多端联动的集成测试。

## 8. 当前结论

现在这个 `backend/supabase` 已经足够作为“联调起点”，但还不能算“完整 backend”。团队可以先用它跑通：

- 环境变量
- 基础写表
- 多端数据模型对齐

等 migration 和策略文件补齐之后，再进入正式联调和部署阶段。
