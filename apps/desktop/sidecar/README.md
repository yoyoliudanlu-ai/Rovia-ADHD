# Rovia BLE Sidecar

这个 sidecar 负责做四件事：

- 同时连接两个蓝牙设备：手环 + 捏捏
- 处理手环 RSSI、HRV 和捏捏压力数据
- 将标准化事件通过 WebSocket 发给 Electron 桌面端
- 可选把 HRV / 压力 / 距离等遥测数据直接同步到 Supabase

## 1. 当前能力

### 手环

- 连接 BLE 手环
- 订阅心率 / RR interval 数据 characteristic
- 兼容 ADHD 手环默认 JSON：`{"bpm","rmssd","sdnn","focus"}`
- 用 RMSSD 算法计算 HRV
- 用扫描 RSSI 估算距离
- 当 RSSI 低于 `-60` 左右时，向手环写提醒 payload
- 可选监听手环按键事件，触发 `enter_task`

### 捏捏

- 连接 BLE 捏捏设备
- 订阅压力 characteristic
- 做归一化 + EMA 平滑
- 输出 `pressureValue / pressureLevel`
- 压力超过阈值时可触发 `enter_task`

### Supabase

- 遥测数据写入 `telemetry_data`
- 事件可写入 `app_events`
- Todo 同步仍由桌面端现有 SupabaseService 负责

## 2. 环境变量

先复制模板：

```bash
cp sidecar/.env.example sidecar/.env
```

关键字段：

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TEST_USER_ID=

ROVIA_BAND_ADDRESS=
ROVIA_BAND_NAME=
ROVIA_BAND_MEASUREMENT_CHAR_UUID=beb5483e-36e1-4688-b7f5-ea07361b26a8
ROVIA_BAND_TRIGGER_CHAR_UUID=
ROVIA_BAND_WRITE_CHAR_UUID=
ROVIA_BAND_DATA_FORMAT=json
ROVIA_BAND_VALUE_KIND=heart_rate
ROVIA_BAND_RSSI_THRESHOLD=-60

ROVIA_SQUEEZE_ADDRESS=
ROVIA_SQUEEZE_NAME=
ROVIA_SQUEEZE_MEASUREMENT_CHAR_UUID=de80aa2a-7f77-4a2c-9f95-3dd9f6f7f0a1
ROVIA_SQUEEZE_TRIGGER_CHAR_UUID=
ROVIA_SQUEEZE_DATA_FORMAT=ascii-number
```

推荐做法：

- sidecar 直写 Supabase：优先使用 `SUPABASE_SERVICE_ROLE_KEY`
- 如果只能用 `ANON KEY`：需要补 `TEST_USER_EMAIL / TEST_USER_PASSWORD`
- 如果先只想验证硬件链路：可以不开启 Supabase，只跑 WebSocket 输出

## 3. 运行

### 模拟模式

```bash
cd sidecar
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python gateway.py --simulate
```

### 真机模式

```bash
cd sidecar
source .venv/bin/activate
python gateway.py
```

默认 WebSocket 地址：

- `ws://127.0.0.1:8765`

## 4. WebSocket 事件

### telemetry

```json
{
  "type": "telemetry",
  "deviceId": "band+squeeze",
  "sourceDevice": "band+squeeze",
  "heartRate": 72.3,
  "hrv": 42.3,
  "sdnn": 20.5,
  "focusScore": 68,
  "stressScore": 67,
  "pressureValue": 58.1,
  "pressureLevel": "firm",
  "wearableRssi": -61,
  "distanceMeters": 1.07,
  "presenceState": "near",
  "physioState": "unknown",
  "recordedAt": "2026-04-04T10:00:00Z",
  "syncedBySidecar": true
}
```

### enter_task

```json
{
  "type": "enter_task",
  "deviceId": "nini_01",
  "source": "squeeze_pressure",
  "pressureValue": 88.6,
  "pressureLevel": "squeeze",
  "timestamp": "2026-04-04T10:00:00Z"
}
```

### band_alert

```json
{
  "type": "band_alert",
  "message": "手环距离提醒已触发，当前 RSSI -63",
  "wearableRssi": -63,
  "distanceMeters": 1.35,
  "delivered": true,
  "timestamp": "2026-04-04T10:00:00Z"
}
```

## 5. HRV 与压力处理说明

### HRV

- 当前使用 `RMSSD` 作为 MVP HRV 算法
- 输入优先使用 RR interval
- 如果设备只给心率，则用心率反推 RR interval 作为简化输入
- 如果手环发的是 ADHD 当前固件默认 JSON：
  - `{"bpm":72.3,"rmssd":34.1,"sdnn":20.5,"focus":68}`
  - 直接使用 `ROVIA_BAND_DATA_FORMAT=json`
- 如果手环发的是 `timestamp + value`：
  - `ROVIA_BAND_VALUE_KIND=heart_rate` 表示 value 是心率
  - `ROVIA_BAND_VALUE_KIND=rr_ms` 表示 value 是 RR 间期毫秒值

### 压力

- 先按 `raw_min / raw_max` 做归一化
- 再用 `EMA` 平滑去抖
- 输出 `idle / light / firm / squeeze` 四档
- 如果捏捏只发一个数值，默认使用 `ROVIA_SQUEEZE_DATA_FORMAT=ascii-number`

## 6. 接真机时要填什么

最关键的是这三类信息：

1. 设备标识：`ADDRESS` 或 `NAME`
2. 读数据的 characteristic UUID
3. 手环提醒写入用的 characteristic UUID + payload

如果设备用标准 Heart Rate Measurement characteristic，可以直接把：

- `ROVIA_BAND_DATA_FORMAT=heart-rate-measurement`

如果厂商自定义协议：

- 手环是 `时间戳 + 数值`：优先用 `json-timestamp-value`
- 捏捏是单值：优先用 `ascii-number`
- 也可切到 `json`
- 或 `rr-ms-u16`
- 或给我设备的通知 payload，我再帮你把 parser 对上

## 7. 当前边界

这版代码已经把结构搭好了，但仍有两块依赖真机参数：

- 每个设备的 characteristic UUID
- 手环提醒写入 payload 的协议定义

换句话说，现在已经不是“没有实现”，而是“差设备协议参数”。只要你给到 UUID 和样例 payload，就能继续落成真机版。
