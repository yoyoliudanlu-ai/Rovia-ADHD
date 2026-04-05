"""BLE 数据包解析器

设备可能同时存在读数据特征和写命令特征。
填写说明：拿到真实数据后，按实际格式实现 parse_wristband / parse_squeeze。

当前实现：
- 先尝试 JSON（固件发 UTF-8 JSON 字符串）
- 再尝试二进制（固件发定长字节结构）
- 都失败则返回空 dict
"""

from __future__ import annotations

import json
import math
import struct


# ── 手环 ──────────────────────────────────────────────────────
#
# 已确认当前手环格式：
#   数据长度 2 字节
#   byte[0] HRV (SDNN) 值，单位 ms（0-255）
#   byte[1] 专注状态（0x00=关闭，0x01=开启）
#
# 专注度算法：sigmoid(sdnn, midpoint=50, k=0.08)
#   SDNN 20ms → 12%，SDNN 50ms → 50%，SDNN 80ms → 88%
#
def parse_wristband(data: bytes) -> dict:
    """
    返回字段（有值则为 float/int，无则为 None）：
      hrv, focus, stress_level, metrics_status
    """
    # ── JSON 尝试（固件升级为 JSON 时自动生效） ────────────────
    try:
        text = data.decode("utf-8", errors="ignore").strip()
        if text:
            raw = json.loads(text)
            status = raw.get("status")
            if status:
                return {"metrics_status": str(status)}
            hrv = _f(raw.get("rmssd") or raw.get("hrv"))
            focus = _i(raw.get("focus")) if raw.get("focus") is not None else (
                _hrv_to_focus(hrv) if hrv is not None else None
            )
            focus_active_raw = raw.get("focus_active")
            if focus_active_raw is None and raw.get("focus_state") is not None:
                focus_active_raw = raw.get("focus_state")
            focus_active = (
                bool(focus_active_raw)
                if focus_active_raw is not None
                else bool(focus) if focus is not None else None
            )
            return {
                "metrics_status": "ready",
                "hrv":          hrv,
                "sdnn":         _f(raw.get("sdnn")),
                "focus":        focus,
                "focus_active": focus_active,
                "stress_level": _i(raw.get("stress") or raw.get("stress_level")) or (
                    _hrv_to_stress(hrv) if hrv is not None else None
                ),
            }
    except Exception:
        pass

    # ── 二进制（已确认：2 字节 sdnn_ms + focus_state） ───────────
    try:
        if len(data) >= 2:
            sdnn_ms     = float(data[0])   # byte[0] = HRV SDNN in ms
            focus_state = int(data[1])     # byte[1] = 0x00 off / 0x01 on
            focus_active = focus_state == 0x01
            sdnn_value  = sdnn_ms if sdnn_ms > 0 else None
            focus       = _hrv_to_focus(sdnn_value) if sdnn_value is not None else 0
            # byte[1] 专注开关为 off 时强制归零
            if not focus_active:
                focus = 0
            return {
                "metrics_status": "ready",
                "hrv":          None,
                "sdnn":         sdnn_value,
                "focus":        focus,
                "focus_active": focus_active,
                "stress_level": _hrv_to_stress(sdnn_value) if sdnn_value is not None else None,
            }
    except Exception:
        pass

    return {}


# ── 捏捏 ──────────────────────────────────────────────────────
#
# TODO: 同上，按实际数据格式替换。
#
# 如果固件发 JSON：{"pressure":2048,"squeeze":1,"battery":85}
#   → json_attempt 直接能用。
#
# 如果固件发二进制，例如 4 字节：
#   uint16 pressure_adc + uint8 squeeze_count + uint8 battery
#   → 取消注释 binary_attempt 并按实际 struct 格式调整。
#
def parse_squeeze(data: bytes) -> dict:
    """
    返回字段（有值则为 float/int，无则为 None）：
      pressure_raw, pressure_norm (0-1), stress_level, squeeze_count, battery

    已确认 NieNie-001 格式：
      UUID beb5483e-36e1-4688-b7f5-ea0734b5e494
      2 字节 uint16 LE = 压力 ADC 值（未捏 ≈ 1，捏满 ≈ 4095）
    如果固件后续升级为 4 字节（uint16 pressure + uint8 count + uint8 battery），
    直接改 struct.unpack_from("<HBB", data) 那段即可。
    """
    # ── 二进制（已确认：2 字节 uint16 LE） ────────────────────
    try:
        if len(data) >= 4:
            # 兼容未来 4 字节扩展：pressure + squeeze_count + battery
            pressure_raw, squeeze_count, battery = struct.unpack_from("<HBB", data)
            return _build_squeeze_result(pressure_raw, squeeze_count, battery)
        if len(data) >= 2:
            pressure_raw = int.from_bytes(data[:2], "little")
            return _build_squeeze_result(pressure_raw)
        if len(data) == 1:
            return _build_squeeze_result(float(data[0]))
    except Exception:
        pass

    # ── JSON 兜底（以防固件升级为 JSON） ──────────────────────
    try:
        text = data.decode("utf-8", errors="ignore").strip()
        if text:
            raw = json.loads(text)
            pressure = _f(raw.get("pressure") or raw.get("squeeze_pressure") or raw.get("adc"))
            if pressure is not None:
                return _build_squeeze_result(
                    pressure_raw=pressure,
                    squeeze_count=_i(raw.get("squeeze") or raw.get("count")),
                    battery=_i(raw.get("battery") or raw.get("bat")),
                )
    except Exception:
        pass

    return {}


# ── 内部工具 ──────────────────────────────────────────────────

def _build_squeeze_result(
    pressure_raw: float,
    squeeze_count: int | None = None,
    battery: int | None = None,
) -> dict:
    norm = max(0.0, min(1.0, pressure_raw / 4095.0))
    stress = int(round((norm ** 0.85) * 100))
    return {
        "pressure_raw":  pressure_raw,
        "pressure_norm": round(norm, 4),
        "stress_level":  stress,
        "squeeze_count": squeeze_count,
        "battery":       battery,
    }


def _hrv_to_focus(sdnn_ms: float) -> int:
    """
    HRV (SDNN, ms) → 专注度 (0-100)

    使用 sigmoid 曲线，中点 50ms（成年人 SDNN 平均基线），斜率 k=0.08：
      focus = 100 / (1 + e^(-0.08 × (sdnn - 50)))

    参考范围：
      <20ms → ~9%   低专注 / 高应激
       50ms → 50%   基线
       70ms → 80%   较好专注
       90ms → 93%   优秀专注
    """
    if sdnn_ms <= 0:
        return 0
    score = 100.0 / (1.0 + math.exp(-0.08 * (sdnn_ms - 50)))
    return max(0, min(100, int(round(score))))


def _hrv_to_stress(hrv_ms: float) -> int:
    """HRV → 压力值 (0-100)，与专注度互补。"""
    return 100 - _hrv_to_focus(hrv_ms)


def _f(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _i(v) -> int | None:
    try:
        return int(v) if v is not None else None
    except Exception:
        return None
