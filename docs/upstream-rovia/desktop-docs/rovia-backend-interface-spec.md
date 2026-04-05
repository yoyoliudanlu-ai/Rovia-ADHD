# Rovia Backend 学习总结与接口规范

## 1. 文档定位

本文档基于当前仓库中的 `backend/` 目录内容整理，目标有两个：

- 总结当前后端目录已经表达出来的架构和数据设计
- 形成一份可供桌面端、手机端、BLE sidecar 和后续后端实现共同遵守的接口规范

当前结论先说在前面：

- `backend/supabase` 已经明确了“Supabase 作为中心数据层”的方向
- 但它目前仍然是“设计说明 + 测试样例”，不是完整后端实现
- 因此本接口规范属于“建议落地规范”，其中一部分已经可以直接执行，另一部分需要后续补 migration / auth / test

## 2. 当前 `backend` 目录学习结果

### 2.1 目录现状

当前 `backend` 目录中实际可读内容如下：

```text
backend/
└── supabase/
    ├── README.md
    ├── migrations/   # 目前为空
    ├── scripts/      # 目前为空
    └── tests/
        └── test_supabase.py
```

### 2.2 已经能确定的信息

根据 [backend/supabase/README.md](/Users/zhangjiayi/.codex/webped/backend/supabase/README.md)，当前后端采用的是：

- 中心化存储：Supabase
- 分布式监听：多端通过 Realtime 订阅数据变化
- 数据生产者：PC 端 / 桌面宠物 / BLE 网关
- 数据消费者：手机端 App、桌面端面板、后续统计模块

### 2.3 当前已有的后端能力定义

当前文档已经定义了 3 张核心表：

- `telemetry_data`
- `todos`
- `focus_sessions`

并且已经表达了以下约束：

- 必须开启 Realtime
- 必须开启 RLS
- 必须用 `auth.uid() = user_id` 做数据隔离

### 2.4 当前后端还缺什么

当前 `backend/supabase` 尚未提供：

- SQL migration
- 真正可执行的建表脚本
- RLS policy 文件
- Realtime 配置脚本
- 统一环境变量模板
- 多表测试
- 认证登录流程
- 服务端脚本和 sidecar 的正式接入规范

### 2.5 测试脚本现状

[backend/supabase/tests/test_supabase.py](/Users/zhangjiayi/.codex/webped/backend/supabase/tests/test_supabase.py) 当前只做了一件事：

- 向 `telemetry_data` 插入一条模拟数据

它验证的是“表能不能写”，但不能代表：

- RLS 已正确配置
- Realtime 已可用
- Todo 和 FocusSession 已可用
- 手机端 / 桌面端已能完成联动

## 3. 当前后端架构理解

### 3.1 架构角色

#### 桌面端 / PC 宠物端

- 接收 BLE sidecar 的数据
- 上传 `telemetry_data`
- 创建或更新 `focus_sessions`
- 读取和更新 `todos`

#### 手环 / BLE 网关

- 提供物理触发，例如“开始专注”
- 提供 HRV、压力、RSSI / 距离等原始或半处理数据

#### 手机端

- 维护 TodoList
- 订阅专注会话
- 订阅实时状态数据

#### Supabase

- 作为统一状态中心
- 负责存储、权限控制、Realtime 广播

## 4. 统一后端接口设计原则

由于当前后端是 Supabase，不是自建 REST 服务，因此这里的“接口规范”应分为三层：

1. 认证接口规范
2. 数据表写入 / 查询规范
3. Realtime 订阅规范

换句话说，当前系统的主接口不是 `POST /api/...`，而是：

- Supabase Auth
- Supabase Database API
- Supabase Realtime

## 5. 认证接口规范

### 5.1 统一原则

- 所有业务表都必须带 `user_id`
- 客户端必须以登录用户身份访问 Supabase
- 所有读写都只能操作本人的数据

### 5.2 推荐环境变量

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ROVIA_USER_ID=
TEST_USER_EMAIL=
TEST_USER_PASSWORD=
```

### 5.3 客户端权限约定

#### 桌面端 / 手机端

- 使用 `ANON KEY`
- 配合真实登录用户会话
- 通过 RLS 访问自己的数据

#### 测试脚本 / 管理脚本

- 若是用户态测试：使用 `ANON KEY + 用户登录`
- 若是服务端管理脚本：使用 `SERVICE ROLE KEY`

### 5.4 RLS 约定

所有业务表默认遵循：

```sql
auth.uid() = user_id
```

推荐策略：

- `SELECT` 仅本人可读
- `INSERT` 仅本人可写入自己的 `user_id`
- `UPDATE` 仅本人可更新自己的记录
- `DELETE` 仅本人可删除自己的记录

## 6. 数据接口规范

## 6.1 `telemetry_data` 接口规范

### 用途

存储由桌面端 / BLE sidecar 上报的生理与空间状态数据。

### 推荐字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | bigint 或 uuid | 否 | 主键 |
| `user_id` | uuid | 是 | 当前用户 ID |
| `hrv` | float8 | 否 | HRV 数值 |
| `stress_level` | int4 | 否 | 压力等级，建议 0-100 |
| `distance_meters` | float8 | 否 | 距离值 |
| `is_at_desk` | bool | 是 | 是否在桌前 |
| `physio_state` | text | 建议 | `ready / strained / unknown` |
| `created_at` 或 `recorded_at` | timestamptz | 是 | 采样时间 |

### 写入接口

#### 接口方式

- Supabase table insert

#### 逻辑接口名

- `insertTelemetryData`

#### 请求体示例

```json
{
  "user_id": "49d91ddd-a62d-488e-90b1-f80bd5434987",
  "hrv": 72.5,
  "stress_level": 35,
  "distance_meters": 0.8,
  "is_at_desk": true,
  "physio_state": "ready",
  "recorded_at": "2026-04-04T08:30:00Z"
}
```

#### 返回约定

- 成功：返回插入后的记录
- 失败：返回 Supabase 标准错误对象

### 读取接口

#### 逻辑接口名

- `listTelemetryData`
- `getLatestTelemetryData`

#### 推荐查询方式

- 按 `user_id` 过滤
- 按时间倒序
- 支持 `limit`

### 使用方

- 桌面端状态机
- 手机端健康看板
- 后续专注数据分析模块

## 6.2 `todos` 接口规范

### 用途

存储多端同步的待办任务。

### 推荐字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | 否 | 主键 |
| `user_id` | uuid | 是 | 当前用户 ID |
| `task_text` | text | 是 | 任务内容 |
| `is_completed` | bool | 是 | 是否完成 |
| `priority` | int2/int4 | 否 | 优先级 |
| `status` | text | 建议 | `pending / doing / done` |
| `is_active` | bool | 建议 | 当前激活任务 |
| `created_at` | timestamptz | 建议 | 创建时间 |
| `updated_at` | timestamptz | 建议 | 更新时间 |

### 写入接口

#### 逻辑接口名

- `createTodo`
- `updateTodo`
- `completeTodo`
- `setActiveTodo`
- `deleteTodo`

#### 创建示例

```json
{
  "user_id": "49d91ddd-a62d-488e-90b1-f80bd5434987",
  "task_text": "完成产品文档",
  "is_completed": false,
  "priority": 2,
  "status": "pending",
  "is_active": true
}
```

### 查询接口

#### 逻辑接口名

- `listTodos`
- `listActiveTodo`

#### 推荐排序

- `is_active desc`
- `priority desc`
- `updated_at desc`

### 使用方

- 手机端 Todo 页面
- 桌面端面板
- 专注会话绑定逻辑

## 6.3 `focus_sessions` 接口规范

### 用途

记录专注会话，驱动多端同步专注流程。

### 推荐字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | 否 | 主键 |
| `user_id` | uuid | 是 | 当前用户 ID |
| `start_time` | timestamptz | 是 | 开始时间 |
| `end_time` | timestamptz | 建议 | 结束时间 |
| `duration` | int4 | 是 | 时长，单位分钟 |
| `duration_sec` | int4 | 建议 | 时长，单位秒 |
| `status` | text | 是 | `running / completed / canceled` |
| `trigger_source` | text | 建议 | `wearable / desktop / mobile` |
| `todo_id` | uuid | 建议 | 关联任务 |
| `task_title` | text | 建议 | 冗余任务名，便于展示 |
| `start_physio_state` | text | 建议 | 开始时状态 |
| `away_count` | int4 | 建议 | 中途离开次数 |
| `updated_at` | timestamptz | 建议 | 更新时间 |

### 写入接口

#### 逻辑接口名

- `createFocusSession`
- `completeFocusSession`
- `cancelFocusSession`

#### 创建示例

```json
{
  "user_id": "49d91ddd-a62d-488e-90b1-f80bd5434987",
  "start_time": "2026-04-04T08:40:00Z",
  "duration": 25,
  "duration_sec": 1500,
  "status": "running",
  "trigger_source": "wearable",
  "task_title": "完成产品文档"
}
```

#### 完成更新示例

```json
{
  "status": "completed",
  "end_time": "2026-04-04T09:05:00Z",
  "updated_at": "2026-04-04T09:05:00Z"
}
```

### 查询接口

#### 逻辑接口名

- `listFocusSessions`
- `getActiveFocusSession`
- `getLatestCompletedFocusSession`

### 使用方

- 手机端倒计时页面
- 桌面端专注视图
- 专注数据统计页

## 7. Realtime 接口规范

## 7.1 需要启用 Realtime 的表

- `telemetry_data`
- `todos`
- `focus_sessions`

## 7.2 订阅接口定义

### `telemetry_data` 订阅

#### 逻辑接口名

- `subscribeTelemetry`

#### 用途

- 实时刷新压力状态
- 实时刷新是否在桌前
- 驱动桌宠状态变化

### `todos` 订阅

#### 逻辑接口名

- `subscribeTodos`

#### 用途

- 桌面端和手机端任务列表同步
- 更新当前任务状态

### `focus_sessions` 订阅

#### 逻辑接口名

- `subscribeFocusSessions`

#### 用途

- 多端同步开始 / 完成 / 取消事件
- 驱动倒计时 UI

## 8. BLE Sidecar 与后端接口规范

当前 `backend` 文档虽未明确 sidecar JSON 协议，但从架构意图可以推导出应采用标准化事件流。

推荐 sidecar 输出给桌面端的标准事件如下：

### 8.1 遥测事件

```json
{
  "type": "telemetry",
  "deviceId": "band_01",
  "hrv": 72.5,
  "stressScore": 35,
  "distanceMeters": 0.8,
  "presenceState": "near",
  "physioState": "ready",
  "timestamp": "2026-04-04T08:30:00Z"
}
```

### 8.2 物理触发事件

```json
{
  "type": "enter_task",
  "deviceId": "band_01",
  "timestamp": "2026-04-04T08:40:00Z"
}
```

桌面端消费该事件后，再负责将结果写入：

- `telemetry_data`
- `focus_sessions`

## 9. 错误处理规范

### 9.1 通用错误分类

| 类型 | 场景 | 建议处理 |
| :--- | :--- | :--- |
| `AUTH_ERROR` | 用户未登录或 token 失效 | 重新登录 |
| `RLS_FORBIDDEN` | 访问了不属于当前用户的数据 | 拒绝并记录 |
| `VALIDATION_ERROR` | 字段缺失或类型错误 | 客户端修正参数 |
| `REALTIME_ERROR` | 订阅失败 | 自动重连 |
| `NETWORK_ERROR` | 网络异常 | 本地缓存后重试 |

### 9.2 客户端约定

- 桌面端本地优先，不因 Supabase 短时失败而中断当前专注流程
- 手机端订阅失败时，应降级为拉取式刷新
- sidecar 不直接写数据库失败时，应写本地队列重试

## 10. 测试规范建议

当前只有一个单文件测试脚本，建议后续拆成：

- `test_insert_telemetry.py`
- `test_todo_crud.py`
- `test_focus_session_flow.py`
- `test_realtime_subscription.py`
- `test_rls_isolation.py`

推荐测试覆盖：

- 插入成功
- 未登录失败
- 跨用户访问失败
- Realtime 是否能收到更新
- Todo / FocusSession 的完整流程是否打通

## 11. 当前实现风险

### 风险 1：README 与真实实现可能不一致

因为当前 `migrations/` 和 `scripts/` 是空的，README 里描述的表和策略不一定真的已部署。

### 风险 2：测试脚本硬编码配置

[test_supabase.py](/Users/zhangjiayi/.codex/webped/backend/supabase/tests/test_supabase.py) 当前直接写死了 Supabase URL、publishable key 和用户 UUID，不适合作为长期方案。

### 风险 3：接口粒度还偏表结构层

目前后端没有自定义业务 API，客户端实际会直接依赖表字段，这会让 schema 变更影响所有端。

## 12. 推荐后续落地步骤

1. 把本文接口规范落实成正式 migration
2. 给 `backend/supabase` 增加 `.env.example`
3. 把测试脚本改成环境变量驱动
4. 用真实登录用户验证 RLS
5. 在桌面端和手机端统一字段命名
6. 明确 `backend/supabase` 与根目录 `supabase/` 的职责，避免双份 schema

## 13. 一句话总结

当前 `backend` 文件夹清楚定义了 Rovia 后端要做什么：用 Supabase 承接遥测、任务和专注会话，再用 Realtime 把状态同步给桌面端和手机端。本文把这些设计意图进一步整理成了可执行的接口规范，方便后续前后端和 sidecar 统一实现。
