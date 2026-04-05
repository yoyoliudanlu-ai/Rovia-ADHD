"""Signal processing helpers for HRV and squeeze-pressure telemetry."""

from __future__ import annotations

import math
from statistics import fmean, pstdev
from typing import Sequence


def compute_rmssd(rr_intervals_ms: Sequence[float]) -> float | None:
    """Compute RMSSD from RR intervals (ms)."""
    if rr_intervals_ms is None or len(rr_intervals_ms) < 2:
        return None
    diffs_sq = []
    for prev, curr in zip(rr_intervals_ms[:-1], rr_intervals_ms[1:]):
        d = float(curr) - float(prev)
        diffs_sq.append(d * d)
    if not diffs_sq:
        return None
    return round(math.sqrt(fmean(diffs_sq)), 2)


def compute_sdnn(rr_intervals_ms: Sequence[float]) -> float | None:
    """Compute SDNN from RR intervals (ms)."""
    if rr_intervals_ms is None or len(rr_intervals_ms) < 2:
        return None
    return round(float(pstdev(float(v) for v in rr_intervals_ms)), 2)


def focus_from_hrv_window(
    hrv_values: Sequence[float],
    baseline_values: Sequence[float] | None = None,
) -> int | None:
    """Estimate a 0-100 focus score from recent HRV level + stability."""
    if hrv_values is None or len(hrv_values) < 3:
        return None

    recent = [float(v) for v in hrv_values if v is not None and float(v) > 0]
    if len(recent) < 3:
        return None

    baseline_pool = [
        float(v)
        for v in (baseline_values or recent)
        if v is not None and float(v) > 0
    ]
    if not baseline_pool:
        baseline_pool = recent

    mean_hrv = fmean(recent)
    baseline = max(fmean(baseline_pool), 1.0)
    variability = pstdev(recent) if len(recent) >= 2 else 0.0
    coeff_var = variability / max(mean_hrv, 1.0)

    ratio = mean_hrv / baseline
    level_score = _linear_score(ratio, floor=0.55, ceiling=1.05)
    stability_score = _linear_score(0.32 - coeff_var, floor=0.0, ceiling=0.24)

    score = int(round((level_score * 0.7) + (stability_score * 0.3)))
    return max(0, min(100, score))


def stress_from_rmssd(rmssd: float | None, baseline_rmssd: float = 42.0) -> int | None:
    """Map RMSSD to 0-100 stress score (higher RMSSD -> lower stress)."""
    if rmssd is None or rmssd <= 0:
        return None
    ratio = rmssd / baseline_rmssd
    # Logistic mapping gives smoother high/low tails than linear conversion.
    stress = 100.0 / (1.0 + math.exp(3.2 * (ratio - 1.0)))
    return max(0, min(100, int(round(stress))))


def normalize_pressure(raw: float, raw_min: float = 0.0, raw_max: float = 4095.0) -> float:
    """Normalize raw pressure into [0,1]."""
    if raw_max <= raw_min:
        raise ValueError("raw_max must be greater than raw_min")
    x = (float(raw) - raw_min) / (raw_max - raw_min)
    return max(0.0, min(1.0, x))


def smooth_ema(previous: float | None, current: float, alpha: float = 0.28) -> float:
    """Exponential moving average smoothing."""
    if previous is None:
        return float(current)
    a = max(0.0, min(1.0, float(alpha)))
    return (a * float(current)) + ((1.0 - a) * float(previous))


def stress_from_pressure(normalized_pressure: float) -> int:
    """Map normalized pressure to 0-100 stress score."""
    p = max(0.0, min(1.0, float(normalized_pressure)))
    # Slightly convex curve: low pressure is calm, high pressure ramps quickly.
    return int(round((p ** 0.85) * 100.0))


def fuse_stress(
    hrv_stress: int | None,
    pressure_stress: int | None,
    hrv_weight: float = 0.65,
) -> int | None:
    """Fuse HRV-derived stress and squeeze-pressure stress."""
    if hrv_stress is None and pressure_stress is None:
        return None
    if hrv_stress is None:
        return int(pressure_stress)
    if pressure_stress is None:
        return int(hrv_stress)

    w = max(0.0, min(1.0, float(hrv_weight)))
    merged = (float(hrv_stress) * w) + (float(pressure_stress) * (1.0 - w))
    return max(0, min(100, int(round(merged))))


def _linear_score(value: float, *, floor: float, ceiling: float) -> int:
    if ceiling <= floor:
        raise ValueError("ceiling must be greater than floor")
    ratio = (float(value) - floor) / (ceiling - floor)
    clipped = max(0.0, min(1.0, ratio))
    return int(round(clipped * 100.0))
