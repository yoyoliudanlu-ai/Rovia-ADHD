# Migration Notes

## Purpose

这次整理的目标是把当前分散在不同目录和不同仓库里的能力，收拢到 `workspace/` 这个统一入口下。

## Imported Subtrees

### `apps/desktop`

来源：

- `/tmp/rovia_ref`

处理方式：

- 保留 Electron 桌面端运行结构
- 保留 `src/`、`sidecar/`、根级 `package.json`
- 将上游自带的 `backend`、`supabase`、`docs` 等参考资料挪到 `docs/upstream-rovia`

### `apps/api`

来源：

- 当前仓库的 `backend/`
- 当前仓库的 `tests/backend/`

处理方式：

- 直接复制为综合项目的 API 层
- 保留 FastAPI、gateway、supabase、backend tests

### `hardware/zclaw`

来源：

- `/Volumes/ORICO/项目/zclaw`

处理方式：

- 复制源代码、脚本、文档、测试
- 排除 `.git`、`node_modules`、`build`、`__pycache__`
- 保持独立设备层，不改其构建方式

## Intentionally Not Merged Yet

- 原仓库里的 `frontend/desktop_pet`
- 原仓库里的 `frontend/mobile_app`
- `zclaw` 内部逻辑并入 `apps/api`
- `Rovia` 的 Electron 状态机和旧 PyQt 状态机合并

## Active vs Reference

当前综合项目中的活跃入口：

- `workspace/apps/desktop`
- `workspace/apps/api`
- `workspace/hardware/zclaw`
- `workspace/hardware/nienie`
- `workspace/hardware/nienie_band`

当前综合项目中的参考资料：

- `workspace/docs/upstream-rovia`

这些参考资料保留是为了后续比对上游实现，不应视为当前主运行路径。

## Additional Hardware Uploads

后续新增的硬件代码统一放在 `workspace/hardware/` 下按项目分目录维护。  
当前已包含：

- `nienie/`（捏捏模块 sketch）
- `nienie_band/`（手环模块 sketch）
