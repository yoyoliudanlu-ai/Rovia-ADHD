# Dual BLE Backend Gateway

该目录实现了你提到的后端硬件接入和同步主链路：

1. 同时连接两路蓝牙设备（手环 + 捏捏）。
2. 读取手环心理数据并做 HRV 算法处理。
3. 读取捏捏压力并做平滑/压力评分处理。
4. 手环 RSSI 低于阈值（默认 `-60 dBm`）时回写提醒到手环。
5. 周期性把 HRV/压力/在位数据同步到 Supabase。

## 关键文件

- `config.py`
  设备名、UUID、RSSI 阈值、扫描节奏等配置。
- `dual_ble_gateway.py`
  双 BLE 连接、通知处理、提醒回写。
- `algorithms.py`
  RMSSD、SDNN、压力映射和融合算法。
- `service.py`
  网关数据和 Supabase 同步编排。
- `run_service.py`
  运行入口。

## 环境变量

必填：

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ADHD_USER_ID`

可选：

- `WRISTBAND_DEVICE_NAME` (默认留空；建议扫描后再选择)
- `WRISTBAND_NOTIFY_CHAR_UUID` (默认 `beb5483e-36e1-4688-b7f5-ea07361b26a8`)
- `WRISTBAND_ALERT_CHAR_UUID` (用于回写提醒；不配置则不回写)
- `SQUEEZE_DEVICE_NAME` (默认留空；建议扫描后再选择)
- `SQUEEZE_NOTIFY_CHAR_UUID`
- `REMINDER_RSSI_THRESHOLD` (默认 `-60`)
- `UPLOAD_INTERVAL_S` (默认 `12`)

## 运行

```bash
python3 -m backend.gateway.run_service
```
