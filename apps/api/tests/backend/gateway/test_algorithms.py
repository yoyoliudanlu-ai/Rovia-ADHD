from backend.gateway.algorithms import (
    compute_rmssd,
    compute_sdnn,
    focus_from_hrv_window,
    fuse_stress,
    normalize_pressure,
    smooth_ema,
    stress_from_pressure,
    stress_from_rmssd,
)


def test_compute_rmssd_from_rr():
    rr = [810, 790, 805, 795, 800]
    rmssd = compute_rmssd(rr)
    assert rmssd is not None
    assert 12.0 <= rmssd <= 20.0


def test_compute_sdnn_from_rr():
    rr = [780, 800, 820, 790, 810]
    sdnn = compute_sdnn(rr)
    assert sdnn is not None
    assert 13.0 <= sdnn <= 16.5


def test_stress_from_rmssd_inverse_relation():
    high_hrv = stress_from_rmssd(70.0)
    low_hrv = stress_from_rmssd(18.0)
    assert high_hrv is not None and low_hrv is not None
    assert high_hrv < low_hrv


def test_pressure_pipeline():
    norm = normalize_pressure(2048, 0, 4095)
    assert 0.49 <= norm <= 0.51
    smoothed = smooth_ema(None, norm)
    assert abs(smoothed - norm) < 1e-9
    stress = stress_from_pressure(norm)
    assert 50 <= stress <= 60


def test_fuse_stress():
    assert fuse_stress(None, None) is None
    assert fuse_stress(80, None) == 80
    assert fuse_stress(None, 20) == 20
    mixed = fuse_stress(80, 20, hrv_weight=0.5)
    assert mixed == 50


def test_focus_from_hrv_window_rewards_higher_and_stable_hrv():
    baseline = [40.0] * 24
    focused = focus_from_hrv_window([39.0, 40.0, 41.0, 40.0, 39.5, 40.5], baseline)
    distracted = focus_from_hrv_window([18.0, 30.0, 21.0, 28.0, 19.0, 26.0], baseline)
    assert focused is not None and distracted is not None
    assert focused > distracted
    assert focused >= 75
    assert distracted <= 45


def test_focus_from_hrv_window_requires_enough_samples():
    assert focus_from_hrv_window([35.0, 36.0], [40.0, 41.0, 42.0]) is None
