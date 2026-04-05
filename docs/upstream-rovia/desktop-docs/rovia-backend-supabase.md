# Rovia Backend 文档整理（基于当前 `backend` 目录）

## 1. 文档目的

本文档基于当前仓库中的 `backend` 目录内容整理而成，用于说明：

- 这份后端内容目前已经包含什么
- 它表达出的 Supabase 架构意图是什么
- 当前实现缺口在哪里
- 后续如何把它接到现有的桌宠桌面端原型上

这不是一份“已完成后端”的交付说明，而是一份基于现状的后端梳理文档。

## 2. 当前目录现状

当前 `backend` 目录实际内容如下：

```text
backend/
└── supabase/
    ├── README.md
    ├── migrations/          # 当前为空
    ├── scripts/             # 当前为空
    └── tests/
        └── test_supabase.py
```

### 2.1 已有内容

- 一份 Supabase 后端说明文档
- 一个用于向 `telemetry_data` 写入模拟数据的 Python 测试脚本

### 2.2 当前缺失

- 实际 SQL migration
- 建表脚本
- RLS 执行脚本
- Realtime 配置脚本
- 环境变量模板
- 数据初始化脚本
- 认证流程说明
- 与桌面端 / sidecar 的正式对接脚本

结论：当前 `backend/supabase` 更像“后端设计草稿 + 测试样例”，还不是完整可部署后端。

## 3. 队友文档表达出的后端目标

根据 [backend/supabase/README.md](/Users/zhangjiayi/.codex/webped/backend/supabase/README.md)，当前后端的目标是让 Supabase 作为 ADHD Companion / Rovia 系统的中心数据层，统一承接以下三类客户端：

- PC 端 / 桌宠端：上传手环数据、距离数据、专注会话
- 手环侧触发：通过按键或物理动作创建专注会话
- 手机端 App：实时订阅任务、会话、健康相关状态

整体模式是：

`手环 / 电脑 / 手机 -> Supabase -> 订阅方实时同步`

## 4. 当前设计中的核心数据流

### 4.1 遥测数据流

1. 电脑端通过 Python + BLE 采集手环数据
2. 将 HRV、压力值、距离等信息写入 `telemetry_data`
3. 手机端或其他客户端通过 Realtime 订阅更新

### 4.2 专注会话流

1. 用户触发手环物理按键
2. PC 网关在 `focus_sessions` 中创建一条新记录
3. 手机端订阅到会话后，进入倒计时或专注模式

### 4.3 Todo 任务流

1. 手机端或桌面端编辑 `todos`
2. Supabase 存储任务状态
3. 其他端通过 Realtime 同步任务变化

## 5. 当前文档中的数据表设计

队友文档中明确提到了 3 张核心表。

### 5.1 `telemetry_data`

用途：存放来自电脑端高频上传的生理和空间状态数据。

当前定义包含：

- `id`
- `user_id`
- `hrv`
- `stress_level`
- `distance_meters`
- `is_at_desk`
- `created_at`

适用场景：

- 展示用户当前压力 / 生理状态
- 判断用户是否在桌前
- 为手机端或桌宠端提供实时状态源

### 5.2 `todos`

用途：跨端同步待办任务。

当前定义包含：

- `id`
- `user_id`
- `task_text`
- `is_completed`
- `priority`

适用场景：

- 手机端维护任务列表
- 桌宠端绑定当前任务
- 后续统计“任务完成率”

### 5.3 `focus_sessions`

用途：记录专注会话。

当前定义包含：

- `id`
- `user_id`
- `start_time`
- `duration`
- `status`

适用场景：

- 驱动跨端倒计时
- 记录专注开始 / 完成 / 取消
- 后续接专注数据分析

## 6. 当前设计的实时能力要求

根据 README，当前后端强依赖 Supabase Realtime。

建议开启订阅的表：

- `telemetry_data`
- `todos`
- `focus_sessions`

其中：

- `telemetry_data` 用于压力状态、桌前状态联动
- `todos` 用于多端任务同步
- `focus_sessions` 用于专注会话的跨端广播

## 7. 当前设计的安全模型

README 中明确要求所有表开启 RLS，并使用：

```sql
auth.uid() = user_id
```

作为访问隔离的核心条件。

这意味着正确的访问模型应该是：

- 每一条业务数据都归属某个 `user_id`
- 客户端必须以真实登录用户身份访问 Supabase
- 查询、插入、更新都应仅允许本人访问自己的记录

## 8. 当前测试脚本分析

测试脚本位于 [backend/supabase/tests/test_supabase.py](/Users/zhangjiayi/.codex/webped/backend/supabase/tests/test_supabase.py)。

它的作用很明确：

- 连接指定 Supabase 项目
- 向 `telemetry_data` 插入一条模拟遥测数据

### 8.1 当前脚本实际做法

脚本当前写死了：

- Supabase URL
- publishable key
- `user_uuid`

然后直接执行：

- `supabase.table("telemetry_data").insert(data).execute()`

### 8.2 当前脚本存在的问题

#### 问题 1：敏感配置硬编码

URL、key、用户 UUID 都直接写在测试文件里，不适合继续保留在仓库中。

更好的方式：

- 使用 `.env`
- 使用 `SUPABASE_URL`
- 使用 `SUPABASE_ANON_KEY`
- 使用 `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
- 使用 `TEST_USER_ID`

#### 问题 2：与 RLS 描述存在潜在冲突

README 里希望所有表都按 `auth.uid() = user_id` 做访问控制，但测试脚本没有显式登录用户，也没有建立真实用户会话。

这会导致两种可能：

- 如果 RLS 严格开启，脚本插入可能失败
- 如果脚本插入成功，说明当前表策略可能还未按 README 中的目标收紧

#### 问题 3：测试覆盖面过小

目前脚本只覆盖：

- `telemetry_data` 的一次插入

未覆盖：

- `todos`
- `focus_sessions`
- Realtime 订阅
- RLS 校验

## 9. 当前后端的成熟度判断

如果按工程成熟度划分，当前 `backend/supabase` 可以视为：

### 已完成

- 后端架构方向说明
- 核心表的大致设计意图
- 单表写入测试示例

### 未完成

- 正式 schema
- migration
- 自动化部署
- 鉴权方案
- 后端接入规范
- 桌面端 / 手机端 / sidecar 的统一事件协议

所以它更接近：

`概念设计 + 测试样例`

而不是：

`可直接上线的 backend 模块`

## 10. 与当前 Rovia 桌宠原型的关系

当前仓库里，我们已经有一套更接近可运行原型的桌面端与 Supabase 设计：

- 桌面端原型：`src/`
- 侧车原型：`sidecar/`
- 根目录 Supabase migration：`supabase/migrations/`

这意味着现在存在两套信息来源：

### 来源 A：队友拷贝来的 `backend/supabase`

特点：

- 偏产品 / 架构说明
- 有测试样例
- 没有正式 migration

### 来源 B：当前仓库已有的 `supabase/migrations`

特点：

- 偏实现导向
- 已有建表与 RLS 方案
- 更接近桌面原型当前代码结构

建议后续做法：

- 保留 `backend/supabase` 作为“队友原始设计输入”
- 以仓库根目录 `supabase/` 作为“正式实现目录”
- 后续不要并行维护两套 schema 定义，避免漂移

## 11. 推荐的后端整理方向

建议把当前 backend 内容按下面方式继续补齐。

### 11.1 保留文档层

保留：

- `backend/supabase/README.md`

它可以继续承担：

- 架构说明
- 多端数据流说明
- 业务意图描述

### 11.2 把实现层迁移到正式目录

建议正式实现放在：

```text
supabase/
├── migrations/
├── seeds/
├── policies/
└── README.md
```

### 11.3 把测试脚本改成环境变量驱动

建议后续把 [test_supabase.py](/Users/zhangjiayi/.codex/webped/backend/supabase/tests/test_supabase.py) 改造成：

- 通过 `.env` 读取配置
- 支持测试不同表
- 支持验证 RLS
- 支持验证 Realtime

## 12. 推荐补充的环境变量

建议后端相关文档统一使用以下环境变量命名：

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
ROVIA_USER_ID=
TEST_USER_EMAIL=
TEST_USER_PASSWORD=
```

如果测试脚本需要绕过用户登录，仅用于开发验证，也应明确区分：

- 客户端测试：使用 `ANON KEY + 登录用户`
- 服务端脚本：使用 `SERVICE ROLE KEY`

## 13. 推荐后续补齐的表字段

如果后端要和当前桌宠原型完全对齐，建议在后续 schema 中补充或统一以下字段。

### 13.1 `telemetry_data`

建议补充：

- `physio_state`
- `recorded_at`

原因：

- 桌宠端当前直接消费标准化后的 `physio_state`
- 相比 `created_at`，`recorded_at` 更准确表达采样时间

### 13.2 `todos`

建议补充：

- `status`
- `is_active`
- `updated_at`
- `created_at`

原因：

- 桌宠端当前需要区分当前任务与普通待办
- 多端同步时需要更稳定的更新时间字段

### 13.3 `focus_sessions`

建议补充：

- `end_time`
- `duration_sec`
- `trigger_source`
- `start_physio_state`
- `away_count`
- `updated_at`

原因：

- 这些字段更贴近桌宠侧实际行为模型
- 后续更方便做专注统计与中断分析

## 14. 建议的下一步

如果要把这份 backend 继续推进成可用后端，建议顺序如下：

1. 统一 schema 来源，只保留一套正式 migration
2. 把 `backend/supabase/README.md` 中的表设计落实成 SQL
3. 补齐 `.env.example` 和测试脚本的环境变量读取
4. 验证 RLS 是否真的与测试脚本兼容
5. 补一套最小的 Todo / Focus / Telemetry 插入与查询测试
6. 让桌面端与 sidecar 都接同一套 Supabase schema

## 15. 一句话总结

当前 `backend/supabase` 提供了一个清晰的 Supabase 后端方向：它定义了系统想怎样联动，但还没有真正把数据库、策略和脚本落成一个完整 backend。最适合它现在的定位，是“后端设计输入文档 + 样例测试”，而不是最终实现。
