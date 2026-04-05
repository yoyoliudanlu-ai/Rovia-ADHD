"""
遥测数据接口

GET  /api/telemetry/latest     → 最新实时快照（内存，不经 Supabase）
GET  /api/telemetry/history    → 历史记录（Supabase 分页）
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Query

from ..store import telemetry_store

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


def _user_id() -> str:
    return os.getenv("ADHD_USER_ID", "")


@router.get("/latest")
def get_latest():
    """
    返回当前内存快照，字段说明：

    wristband:
      sdnn          float | null   HRV SDNN（ms），手环直接上报
      hrv           float | null   HRV RMSSD（ms），固件升级后使用
      focus         int | null     基于 SDNN 滑动窗口的专注评分 0-100
      stress_level  int | null     融合压力评分（65% HRV + 35% 捏捏）
      metrics_status str           "ready" | "offline"

    squeeze:
      pressure_raw  float | null   原始 ADC 值（0-4095）
      pressure_norm float | null   归一化压力 0-1
      stress_level  int | null     捏捏用力强度映射的压力评分 0-100
      squeeze_count int | null     捏握次数（固件支持时）
      battery       int | null     电量百分比（固件支持时）

    presence:
      rssi          float | null   手环 RSSI（dBm）
      distance_m    float | null   估算距离（米）
      is_at_desk    bool           是否在桌前

    meta:
      updated_at    float          Unix timestamp（最后更新时间）
    """
    return telemetry_store.snapshot()


@router.get("/history")
def get_history(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    从 Supabase 拉取历史遥测，按 created_at 倒序。
    字段：id, user_id, hrv, stress_level, distance_meters, is_at_desk, created_at
    """
    uid = _user_id()
    if not uid:
        return {"data": [], "total": 0, "error": "ADHD_USER_ID not configured"}
    try:
        from backend.supabase.client import get_supabase_client
        client = get_supabase_client()
        result = (
            client.table("telemetry_data")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        data = list(getattr(result, "data", result) or [])
        return {"data": data, "total": len(data)}
    except Exception as e:
        return {"data": [], "total": 0, "error": str(e)}
