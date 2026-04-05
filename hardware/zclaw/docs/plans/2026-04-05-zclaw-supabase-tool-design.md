# zclaw Supabase Todo 查询设计

## 目标

把 Supabase 查询能力做进 `zclaw` 固件本体，让用户能通过微信或其他 `zclaw` 输入通道直接询问：

- 查一下我的 todos
- 我有哪些未完成任务
- 最近创建了哪些任务

首版只实现 `todos` 读取工具，不实现写入，也不做定时提醒/日报周报。

## 范围

本次交付只包含：

1. 一个新的内置工具，用于从 Supabase 查询 `todos`。
2. 新的 NVS 配置键和 `scripts/provision.sh` 参数，用于存储 Supabase 连接和字段映射。
3. 工具注册、测试和 README 说明。

不包含：

- 自动提醒
- 定时日报/周报
- 任意 SQL
- 任意表读写

## 方案

### 方案 A：让 LLM 直接访问 Supabase

不可行。`zclaw` 当前没有给 LLM 暴露 HTTP 任意访问能力，也不应直接放开。

### 方案 B：新增专用 `supabase_list_todos` 固件工具

优点：

- 最符合 `zclaw` 现有工具模型
- 可控、可测
- 能限制访问范围和输出体积

缺点：

- 首版能力较窄，只支持 `todos`

推荐采用方案 B。

## 数据流

1. 用户通过微信给 `zclaw` 发消息。
2. `zclaw` 的 LLM 根据工具描述，决定调用 `supabase_list_todos`。
3. 工具从 NVS 读取：
   - Supabase URL
   - API key
   - `todos` 表名
   - `user_id` 字段名
   - 当前用户 UUID
   - 任务文本/完成状态/创建时间等字段映射
4. 工具发起 HTTPS GET 到 Supabase REST API。
5. 工具把查询结果压缩成短文本返回给 LLM。
6. LLM 再用自然语言回复用户。

## 工具行为

首版工具入参尽量简单：

- `filter`: `all | open | completed`
- `limit`: 1-10

工具默认按创建时间倒序返回，并优先展示：

- 任务文本
- 完成状态
- 创建时间
- id

如果配置缺失或网络失败，返回明确错误。

## 配置项

新增 NVS 键：

- Supabase URL
- Supabase key
- 表名
- 用户字段名
- 用户 UUID
- 文本字段名
- 完成字段名
- 创建时间字段名

首版不要求配置到期字段。

## 测试

主机测试覆盖：

- 工具注册存在
- 配置缺失时报错
- Supabase 请求 URL 构造正确
- 工具输出格式正确
- `filter=open` / `filter=completed` 过滤逻辑正确
