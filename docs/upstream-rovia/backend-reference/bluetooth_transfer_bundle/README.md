# 蓝牙传输整理包

这个文件夹现在只保留最小蓝牙传输链路。

## 保留内容

- `backend/api/ble_runner.py`
  - BLE 扫描、连接、读写、自动重连、在位判定
- `backend/api/store.py`
  - 内存态遥测缓存
- `backend/api/ws.py`
  - WebSocket 广播器
- `backend/api/routes/devices.py`
  - 设备状态、扫描、配置接口
- `backend/api/routes/telemetry.py`
  - 遥测快照和历史接口
- `backend/gateway/parsers.py`
  - 手环 / 捏捏原始数据解析

## 当前数据流

1. `ble_runner.py` 扫描并连接手环与捏捏
2. 原始字节流进入 `parse_wristband()` / `parse_squeeze()`
3. 解析结果写入 `store.py`
4. `ws.py` 对外广播实时消息
5. `devices.py` / `telemetry.py` 提供调试和读取接口

## 当前协议口径

### 手环

- 支持 JSON 字符串
- 支持 2 字节二进制：
  - `byte[0] = SDNN(ms)`
  - `byte[1] = focus_state`

### 捏捏

- 按 `uint16 little-endian` 解析压力原始值
- 输出字段：
  - `pressure_raw`
  - `pressure_norm`
  - `stress_level`

## 不再保留

- FastAPI 入口
- Supabase 封装
- 调试脚本
- 前端参考 BLE 线程
- 其他和最小蓝牙传输链路无关的文件
