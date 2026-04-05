import asyncio
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


class _FakeDevice:
    def __init__(self, name=None):
        self.name = name


class _FakeAdv:
    def __init__(self, local_name=None, rssi=None):
        self.local_name = local_name
        self.rssi = rssi


class _FakeBleakScanner:
    @staticmethod
    async def discover(*, timeout, return_adv):
        return {
            "band": (_FakeDevice(name=None), _FakeAdv(local_name="Band-001", rssi=-52)),
            "squeeze": (_FakeDevice(name=""), _FakeAdv(local_name="NieNie-001", rssi=-61)),
        }


class _FakeBaseModel:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def model_dump(self):
        return dict(self.__dict__)


class DevicesRouteTests(unittest.TestCase):
    def test_scan_devices_uses_advertisement_local_name_when_device_name_missing(self):
        fake_bleak = types.SimpleNamespace(BleakScanner=_FakeBleakScanner)
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=_FakeBaseModel)
        fake_store_module = types.SimpleNamespace(telemetry_store=object())
        fake_ble_runner_module = types.SimpleNamespace(
            ble_runner=types.SimpleNamespace(
                wristband_name="",
                wristband_notify_uuid="",
                squeeze_name="",
                squeeze_notify_uuid="",
                reconfigure=lambda **kwargs: None,
            ),
            _display_name=lambda device, adv=None: (
                (getattr(adv, "local_name", None) or "")
                or (getattr(device, "name", None) or "")
            ).strip(),
        )

        with mock.patch.dict(
            sys.modules,
            {
                "bleak": fake_bleak,
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.store": fake_store_module,
                "backend.api.ble_runner": fake_ble_runner_module,
            },
        ):
            sys.modules.pop("backend.api.routes.devices", None)
            from backend.api.routes.devices import scan_devices

            result = asyncio.run(scan_devices())

        self.assertEqual(
            result["devices"],
            [
                {"name": "Band-001", "rssi": -52},
                {"name": "NieNie-001", "rssi": -61},
            ],
        )

    def test_raw_scan_route_returns_observations_and_connection_diagnostics(self):
        fake_bleak = types.SimpleNamespace(BleakScanner=_FakeBleakScanner)
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=_FakeBaseModel)
        fake_store_module = types.SimpleNamespace(telemetry_store=object())
        fake_ble_runner_module = types.SimpleNamespace(
            ble_runner=types.SimpleNamespace(
                wristband_name="Band-001",
                wristband_notify_uuid="uuid-read",
                squeeze_name="NieNie-001",
                squeeze_notify_uuid="uuid-sq",
                reconfigure=lambda **kwargs: None,
                connection_diagnostics=lambda: {
                    "wristband": {
                        "connected": False,
                        "last_error": "connect timeout",
                        "configured_input_uuid": "uuid-read",
                        "available_characteristics": [
                            {"uuid": "uuid-alt", "properties": ["notify"]}
                        ],
                    },
                    "squeeze": {"connected": True, "last_error": None, "available_characteristics": []},
                },
                scan_diagnostics=lambda limit=50: [
                    {
                        "display_name": "Band-001",
                        "local_name": "Band-001",
                        "service_uuids": ["180D"],
                        "last_seen_at": 123.0,
                        "last_seen_s_ago": 0.4,
                    }
                ],
            ),
            _display_name=lambda device, adv=None: (
                (getattr(adv, "local_name", None) or "")
                or (getattr(device, "name", None) or "")
            ).strip(),
        )

        with mock.patch.dict(
            sys.modules,
            {
                "bleak": fake_bleak,
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.store": fake_store_module,
                "backend.api.ble_runner": fake_ble_runner_module,
            },
        ):
            sys.modules.pop("backend.api.routes.devices", None)
            from backend.api.routes.devices import get_raw_scan_diagnostics

            result = get_raw_scan_diagnostics()

        self.assertEqual(result["selected"]["wristband"], "Band-001")
        self.assertEqual(result["connections"]["wristband"]["last_error"], "connect timeout")
        self.assertEqual(result["connections"]["wristband"]["configured_input_uuid"], "uuid-read")
        self.assertEqual(result["connections"]["wristband"]["available_characteristics"][0]["uuid"], "uuid-alt")
        self.assertEqual(result["observations"][0]["local_name"], "Band-001")

    def test_status_route_includes_selected_name_errors_and_live_metrics(self):
        fake_bleak = types.SimpleNamespace(BleakScanner=_FakeBleakScanner)
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=_FakeBaseModel)
        fake_store_module = types.SimpleNamespace(
            telemetry_store=types.SimpleNamespace(
                wristband_connected=False,
                squeeze_connected=False,
                wristband_name=None,
                squeeze_name=None,
                rssi=-58,
                is_at_desk=True,
                hrv=41,
                pressure_raw=1337,
                wristband_last_seen_s=lambda: 2.4,
                squeeze_last_seen_s=lambda: 1.1,
            )
        )
        fake_ble_runner_module = types.SimpleNamespace(
            ble_runner=types.SimpleNamespace(
                wristband_name="Band-001",
                wristband_notify_uuid="uuid-read",
                squeeze_name="NieNie-001",
                squeeze_notify_uuid="uuid-sq",
                reconfigure=lambda **kwargs: None,
                connection_diagnostics=lambda: {
                    "wristband": {
                        "selected_name": "Band-001",
                        "connected": False,
                        "last_error": "connect timeout",
                        "last_connect_attempt_at": 123.0,
                    },
                    "squeeze": {
                        "selected_name": "NieNie-001",
                        "connected": False,
                        "last_error": None,
                        "last_connect_attempt_at": None,
                    },
                },
            ),
            _display_name=lambda device, adv=None: (
                (getattr(adv, "local_name", None) or "")
                or (getattr(device, "name", None) or "")
            ).strip(),
        )

        with mock.patch.dict(
            sys.modules,
            {
                "bleak": fake_bleak,
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.store": fake_store_module,
                "backend.api.ble_runner": fake_ble_runner_module,
            },
        ):
            sys.modules.pop("backend.api.routes.devices", None)
            from backend.api.routes.devices import get_devices_status

            result = get_devices_status()

        self.assertEqual(result.wristband.selected_name, "Band-001")
        self.assertEqual(result.wristband.state, "discovered")
        self.assertEqual(result.wristband.last_error, "connect timeout")
        self.assertEqual(result.wristband.rssi, -58)
        self.assertEqual(result.wristband.hrv, 41)
        self.assertTrue(result.wristband.is_at_desk)
        self.assertEqual(result.squeeze.selected_name, "NieNie-001")
        self.assertEqual(result.squeeze.state, "offline")
        self.assertEqual(result.squeeze.pressure_raw, 1337)

    def test_disconnect_and_reconnect_routes_delegate_to_ble_runner(self):
        calls = []
        fake_bleak = types.SimpleNamespace(BleakScanner=_FakeBleakScanner)
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=_FakeBaseModel)
        fake_store_module = types.SimpleNamespace(telemetry_store=object())
        fake_ble_runner_module = types.SimpleNamespace(
            ble_runner=types.SimpleNamespace(
                wristband_name="Band-001",
                wristband_notify_uuid="uuid-read",
                squeeze_name="NieNie-001",
                squeeze_notify_uuid="uuid-sq",
                reconfigure=lambda **kwargs: calls.append(("reconfigure", kwargs)),
                trigger_reconnect=lambda device_type="all": calls.append(("reconnect", device_type)),
                connection_diagnostics=lambda: {},
            ),
            _display_name=lambda device, adv=None: (
                (getattr(adv, "local_name", None) or "")
                or (getattr(device, "name", None) or "")
            ).strip(),
        )

        with mock.patch.dict(
            sys.modules,
            {
                "bleak": fake_bleak,
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.store": fake_store_module,
                "backend.api.ble_runner": fake_ble_runner_module,
            },
        ):
            sys.modules.pop("backend.api.routes.devices", None)
            from backend.api.routes.devices import disconnect_device, reconnect_device

            disconnected = disconnect_device(_FakeBaseModel(device_type="wristband"))
            reconnected = reconnect_device(_FakeBaseModel(device_type="squeeze"))

        self.assertEqual(
            calls,
            [
                (
                    "reconfigure",
                    {
                        "wristband_name": "",
                        "squeeze_name": "NieNie-001",
                        "wristband_uuid": "",
                        "squeeze_uuid": "uuid-sq",
                    },
                ),
                ("reconnect", "squeeze"),
            ],
        )
        self.assertEqual(disconnected["device_type"], "wristband")
        self.assertTrue(disconnected["ok"])
        self.assertEqual(reconnected["device_type"], "squeeze")
        self.assertTrue(reconnected["ok"])

    def test_remind_route_forwards_signal_hex(self):
        calls = []
        fake_bleak = types.SimpleNamespace(BleakScanner=_FakeBleakScanner)
        fake_fastapi = types.SimpleNamespace(
            APIRouter=lambda *args, **kwargs: types.SimpleNamespace(
                get=lambda *a, **k: (lambda fn: fn),
                post=lambda *a, **k: (lambda fn: fn),
            ),
            HTTPException=Exception,
        )
        fake_pydantic = types.SimpleNamespace(BaseModel=_FakeBaseModel)
        fake_store_module = types.SimpleNamespace(telemetry_store=object())
        fake_ble_runner_module = types.SimpleNamespace(
            ble_runner=types.SimpleNamespace(
                wristband_name="Band-001",
                wristband_notify_uuid="uuid-read",
                squeeze_name="NieNie-001",
                squeeze_notify_uuid="uuid-sq",
                reconfigure=lambda **kwargs: None,
                connection_diagnostics=lambda: {},
                send_reminder_signal=lambda **kwargs: calls.append(kwargs)
                or {"ok": True, "sent": True},
            ),
            _display_name=lambda device, adv=None: (
                (getattr(adv, "local_name", None) or "")
                or (getattr(device, "name", None) or "")
            ).strip(),
        )

        with mock.patch.dict(
            sys.modules,
            {
                "bleak": fake_bleak,
                "fastapi": fake_fastapi,
                "pydantic": fake_pydantic,
                "backend.api.store": fake_store_module,
                "backend.api.ble_runner": fake_ble_runner_module,
            },
        ):
            sys.modules.pop("backend.api.routes.devices", None)
            from backend.api.routes.devices import send_reminder, DeviceReminderRequest

            result = asyncio.run(
                send_reminder(
                    DeviceReminderRequest(
                        reason="todo_start",
                        require_focus_active=False,
                        signal_hex="02",
                    )
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(
            calls,
            [
                {
                    "reason": "todo_start",
                    "require_focus_active": False,
                    "signal_hex": "02",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
