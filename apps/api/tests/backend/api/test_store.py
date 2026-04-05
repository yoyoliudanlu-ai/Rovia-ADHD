from backend.api.store import TelemetryStore


def test_update_wristband_derives_focus_from_continuous_hrv_values():
    store = TelemetryStore()
    for hrv in [40.0, 41.0, 39.5, 40.5, 41.2, 40.3]:
        store.update_wristband({"metrics_status": "ready", "hrv": hrv, "bpm": 72.0})

    assert store.hrv == 40.3
    assert store.focus is not None
    assert store.focus >= 70


def test_update_wristband_lower_noisy_hrv_leads_to_lower_focus():
    calm = TelemetryStore()
    tense = TelemetryStore()

    for hrv in [40.0, 41.0, 39.5, 40.5, 41.2, 40.3]:
        calm.update_wristband({"metrics_status": "ready", "hrv": hrv})
    for hrv in [18.0, 30.0, 21.0, 28.0, 19.0, 26.0]:
        tense.update_wristband({"metrics_status": "ready", "hrv": hrv})

    assert calm.focus is not None and tense.focus is not None
    assert calm.focus > tense.focus


def test_stress_level_prefers_squeeze_sensor_value():
    store = TelemetryStore()
    store.update_wristband({"metrics_status": "ready", "stress_level": 22})
    store.update_squeeze({"pressure_raw": 1024, "stress_level": 68})

    assert store.fused_stress() == 68
