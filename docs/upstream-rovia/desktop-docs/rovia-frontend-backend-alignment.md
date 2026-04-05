# Rovia 前后端对齐度评估

## 1. 评估结论

当前 Rovia 的前后端对齐度可以概括为：

- 核心业务方向：高对齐
- 数据表名称与主要语义：中高对齐
- 真实字段级实现：中等对齐
- Realtime 联动：部分对齐
- 鉴权与 RLS：低对齐
- 面板数据消费：低到中等对齐

综合来看，我会给当前版本一个 **65 / 100** 的对齐度判断。

这意味着：

- 方向已经对上了，大家说的是同一个产品
- 但前端当前接入方式和 backend 文档假设之间，还有几处会在真实联调时卡住的点

## 2. 评估范围

本次评估主要基于以下内容：

- 前端主进程 Supabase 接入：`src/main/supabase-service.js`
- 前端状态机：`src/main/state-manager.js`
- 面板页面：`src/renderer/panel.html`
- 当前正式 schema：`supabase/migrations/202604041500_init_rovia.sql`
- backend 工作区说明：`backend/supabase/README.md`

## 3. 分项评估

### 3.1 核心实体对齐度：85 / 100

前后端都围绕同样的三张核心表展开：

- `telemetry_data`
- `todos`
- `focus_sessions`

这一点是对齐的，也是当前项目最稳定的共识。

前端在 `src/main/supabase-service.js` 中已经实际读写这三张表，说明不仅 PRD 对齐，代码层面也已经围绕它们展开。

### 3.2 `todos` 对齐度：80 / 100

`todos` 是目前对齐得最好的一块。

前端实际使用的字段包括：

- `id`
- `user_id`
- `title`
- `task_text`
- `status`
- `is_completed`
- `is_active`
- `priority`
- `updated_at`

这些字段和正式 migration 基本一致，见：

- `src/main/supabase-service.js`
- `supabase/migrations/202604041500_init_rovia.sql`

但它和 `backend/supabase/README.md` 的简化表定义并不完全一致。README 只写了：

- `task_text`
- `is_completed`
- `priority`

没有覆盖前端真实依赖的：

- `title`
- `status`
- `is_active`
- `updated_at`

所以结论是：

- 前端和正式 schema 较对齐
- 前端和 `backend/` 目录里的简版文档只算“部分对齐”

### 3.3 `focus_sessions` 对齐度：70 / 100

前端对 `focus_sessions` 的实际写入比 backend README 复杂得多。

前端当前会写入：

- `todo_id`
- `task_title`
- `start_time`
- `end_time`
- `duration`
- `duration_sec`
- `status`
- `trigger_source`
- `start_physio_state`
- `away_count`
- `updated_at`

正式 migration 也支持这些字段，所以：

- 前端和根目录 `supabase/migrations` 是对齐的

但 `backend/supabase/README.md` 只描述了：

- `id`
- `user_id`
- `start_time`
- `duration`
- `status`

也就是说，backend 文档对专注会话的定义还停留在“产品级概念”，没有追上前端已经实现的状态细节。

### 3.4 `telemetry_data` 对齐度：60 / 100

这一块有“方向对齐、字段半对齐”的情况。

对齐的部分：

- 前端会写 `hrv`
- 前端会写 `stress_level`
- 前端会写 `physio_state`
- 前端会写 `is_at_desk`
- 前端会写 `recorded_at`

不对齐的部分：

- backend README 里强调了 `distance_meters`
- 前端当前并没有把 `distance_meters` 写入 Supabase
- 正式 migration 里也没有 `distance_meters` 字段

这说明现在存在一个明显分叉：

1. 产品和 backend 文档认为“距离感知”是核心输入
2. 当前正式 schema 和前端落地里，距离值还没有真正入库

所以如果后面要做手机端距离趋势、离桌统计、蓝牙空间分析，当前实现还不够。

### 3.5 `app_events` 对齐度：50 / 100

前端已经在写 `app_events`：

- `insertPresenceEvent`
- `insertAppEvent`

正式 migration 也已经建了 `app_events` 表。

但 `backend/supabase/README.md` 没有把它列进核心表，也没有描述事件类型规范。

这意味着：

- 前端已经把它当成运行日志表在用
- backend 文档还没有正式承认它的存在

它不是当前 MVP 的主干，但如果不补文档，后面会出现“前端依赖了一个后端没定义的表”的沟通问题。

## 4. 联动机制评估

### 4.1 Realtime 对齐度：45 / 100

文档预期是：

- `telemetry_data` 实时同步
- `todos` 实时同步
- `focus_sessions` 实时同步

但前端当前只真正订阅了 `todos`。

前端状态机初始化时只调用了：

- `fetchTodos()`
- `subscribeTodos()`

没有对：

- `focus_sessions`
- `telemetry_data`

建立 Realtime 订阅。

另外，正式 migration 当前只把以下表加入 publication：

- `todos`
- `focus_sessions`

没有把 `telemetry_data` 加进去。

所以这一块的现实情况是：

- Todo 实时联动：部分跑通
- 专注会话跨端广播：schema 预留了，但前端没真正接收
- 生理 / 距离实时联动：当前仍主要依赖本地 sidecar，不是云端实时回流

### 4.2 本地优先策略对齐度：85 / 100

这一点其实做得不错。

前端状态机已经有很明确的“本地优先、远端失败降级”逻辑：

- 初始化失败会回退到 `local`
- Todo 同步失败会降级到 `local`
- 专注流程不会因为 Supabase 暂时失败而中断

这和产品文档里“Supabase 不可达时当前专注仍可继续”的设计是一致的。

## 5. 鉴权与安全评估

### 5.1 Auth / RLS 对齐度：25 / 100

这是当前最大的不对齐点。

backend 文档和正式 migration 都假设：

```sql
auth.uid() = user_id
```

也就是说，客户端应该使用真实登录用户会话去访问 Supabase。

但前端当前的接入方式是：

- 用 `SUPABASE_ANON_KEY`
- 手动传 `ROVIA_USER_ID`
- 没有登录流程
- `persistSession` 和 `autoRefreshToken` 都关闭

这在本地 demo 阶段可以理解，但一旦开启真实 RLS，就会出现问题：

- `auth.uid()` 为 `null`
- 前端请求即使带了 `user_id`，也过不了 RLS

所以从“能不能接真实后端”这个角度看，这一块目前是低对齐。

## 6. UI 消费层评估

### 6.1 Focus 面板对后端的消费对齐度：40 / 100

面板上虽然已经留出了专注数据页，但从文案看仍然是占位状态：

- “后续接后端展示历史统计”
- “这里可以接入 Supabase / 后端，展示专注时长、完成率、中断次数和趋势”

也就是说：

- UI 结构已经预留
- 真实后端数据还没真正接进来

### 6.2 面板运行完整度：30 / 100

当前还有一个很直接的问题：

- `src/renderer/panel.html` 引用了 `./panel.js`
- 但当前 `src/renderer/` 目录里没有 `panel.js`

这说明就算结构和样式已经存在，面板交互层现在也不是完整状态。这个问题会直接影响你们评估“前端是否已经能吃后端数据”。

## 7. 总体判断

如果我们分两个层次看，会更清楚：

### 7.1 和产品 / 需求层相比

前端和 backend 的方向是比较对齐的。

原因是：

- 都围绕桌宠 + Todo + 专注会话 + 生理状态
- 都以 Supabase 为中心数据层
- 都接受“本地优先、云端同步”的架构

### 7.2 和真实可联调实现相比

当前对齐度还不够高，主要卡在四个点：

1. 前端没有真实 Auth，会被 RLS 挡住。
2. Realtime 目前只真正接了 Todo。
3. backend 文档没有完整覆盖前端实际使用字段。
4. 面板的数据消费和交互脚本还没有闭环。

## 8. 优先级建议

如果目标是尽快让“前端和后端真正跑通”，建议按这个顺序补：

1. 先补前端登录态，解决 `auth.uid()` 和 `user_id` 的一致性问题。
2. 统一 schema 来源，以根目录 `supabase/migrations` 为准，反向更新 `backend/supabase/README.md`。
3. 给前端补 `focus_sessions` Realtime 订阅，明确跨端专注会话同步规则。
4. 决定 `distance_meters` 是否进入正式 schema；如果要，就同步补 migration 和前端写入。
5. 补上 `panel.js`，把 Focus 页真正接到 Supabase 数据。

## 9. 最终结论

当前 Rovia 的前后端不是“没对上”，而是“已经对上产品方向，但还没对上生产级联调要求”。

如果只看方向，我会说已经有 **80% 左右** 的一致性。

如果看“今天能不能直接接真实 Supabase + RLS + Realtime”，那更接近 **50% - 60%**。

综合下来，比较客观的判断是：

- **整体对齐度：65 / 100**
- **适合继续联调，但还不适合直接当成完整前后端闭环**
