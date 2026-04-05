import asyncio
import importlib
import os
import sys
import time
import types
import unittest
from unittest import mock


class _FakeChar:
    def __init__(self, uuid: str, properties: list[str]):
        self.uuid = uuid
        self.properties = properties


class _FakeService:
    def __init__(self, characteristics):
        self.characteristics = characteristics


class _FakeDevice:
    def __init__(self, name=None):
        self.name = name


class _FakeAdv:
    def __init__(self, local_name=None):
        self.local_name = local_name


class _FakeClient:
    def __init__(self, services, read_values=None):
        self._services = services
        self.services = []
        self.started = []
        self.is_connected = False
        self.read_values = read_values or {}
        self.read_calls = []
        self.write_calls = []

    async def get_services(self):
        self.services = self._services
        return self._services

    async def start_notify(self, uuid, handler):
        self.started.append(str(uuid))

    async def read_gatt_char(self, uuid):
        key = str(uuid)
        self.read_calls.append(key)
        return self.read_values.get(key, b"")

    async def connect(self):
        self.is_connected = True

    async def disconnect(self):
        self.is_connected = False

    async def write_gatt_char(self, uuid, data, response=False):
        self.write_calls.append((str(uuid), bytes(data), bool(response)))


class _LegacyClient:
    def __init__(self, services):
        self.services = services
        self.started = []
        self.is_connected = True

    async def start_notify(self, uuid, handler):
        self.started.append(str(uuid))


class _FakeStore:
    def __init__(self):
        self.wristband_connected = False
        self.wristband_name = None
        self.squeeze_connected = False
        self.squeeze_name = None
        self.last_wristband = None
        self.last_squeeze = None
        self.last_presence = None

    def update_presence(self, rssi, distance_m, is_at_desk):
        self.last_presence = {
            "rssi": rssi,
            "distance_m": distance_m,
            "is_at_desk": is_at_desk,
        }
        return None

    def set_wristband_connected(self, name=None):
        self.wristband_connected = True
        self.wristband_name = name

    def set_squeeze_connected(self, name=None):
        self.squeeze_connected = True
        self.squeeze_name = name

    def update_wristband(self, _parsed):
        self.wristband_connected = True
        self.last_wristband = _parsed

    def update_squeeze(self, _parsed):
        self.squeeze_connected = True
        self.last_squeeze = _parsed

    def set_wristband_disconnected(self):
        self.wristband_connected = False

    def set_squeeze_disconnected(self):
        self.squeeze_connected = False

    def fused_stress(self):
        return None


class BleRunnerTests(unittest.TestCase):
    def _import_ble_runner(self, *, services=None, read_values=None, parse_wristband=None, parse_squeeze=None):
        fake_store = _FakeStore()
        fake_fastapi = types.SimpleNamespace(WebSocket=object)
        fake_ws_module = types.SimpleNamespace(
            broadcaster=types.SimpleNamespace(broadcast_sync=lambda *args, **kwargs: None)
        )
        fake_store_module = types.SimpleNamespace(telemetry_store=fake_store)
        fake_parsers_module = types.SimpleNamespace(
            parse_wristband=parse_wristband or (lambda _payload: {}),
            parse_squeeze=parse_squeeze or (lambda _payload: {}),
        )
        fake_bleak = types.SimpleNamespace(
            BleakClient=lambda _device: _FakeClient(services or [], read_values=read_values),
            BleakScanner=object,
        )

        with mock.patch.dict(
            sys.modules,
            {
                "fastapi": fake_fastapi,
                "backend.api.ws": fake_ws_module,
                "backend.api.store": fake_store_module,
                "backend.gateway.parsers": fake_parsers_module,
                "bleak": fake_bleak,
            },
        ):
            sys.modules.pop("backend.api.ble_runner", None)
            module = importlib.import_module("backend.api.ble_runner")

        return module, fake_store

    def test_auto_subscribe_loads_services_before_iterating(self):
        module, _fake_store = self._import_ble_runner(
            services=[
                _FakeService(
                    [
                        _FakeChar("0000180f-0000-1000-8000-00805f9b34fb", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea07361b26a8", ["notify"]),
                    ]
                )
            ]
        )

        client = _FakeClient(
            [
                _FakeService(
                    [
                        _FakeChar("0000180f-0000-1000-8000-00805f9b34fb", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea07361b26a8", ["notify"]),
                    ]
                )
            ]
        )

        asyncio.run(module.BleRunner._subscribe_notify(client, "", lambda *_: None))

        self.assertEqual(
            client.started,
            ["beb5483e-36e1-4688-b7f5-ea07361b26a8"],
        )

    def test_successful_wristband_connect_marks_connected_before_first_payload(self):
        module, fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner.wristband_name = "Band-001"
        runner._wb_device = object()

        async def _fake_resolve(_client, _preferred_input_uuid="", _preferred_write_uuid=""):
            return module.IoCharacteristics(notify_uuid="notify-uuid")

        with mock.patch.object(module.BleRunner, "_resolve_io_characteristics", new=staticmethod(_fake_resolve)):
            asyncio.run(runner._ensure_wristband())

        self.assertTrue(fake_store.wristband_connected)
        self.assertEqual(fake_store.wristband_name, "Band-001")

    def test_reconfigure_with_blank_uuid_clears_preferred_input_uuid(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner.wristband_notify_uuid = "beb5483e-36e1-4688-b7f5-ea0734b5e499"
        runner.squeeze_notify_uuid = "beb5483e-36e1-4688-b7f5-ea0734b5e494"

        runner.reconfigure("Band-001", "NieNie-001", "", "")

        self.assertEqual(runner.wristband_notify_uuid, "")
        self.assertEqual(runner.squeeze_notify_uuid, "")

    def test_resolve_io_characteristics_separates_read_and_write_channels(self):
        module, _fake_store = self._import_ble_runner(
            services=[
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e499", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e500", ["write"]),
                    ]
                )
            ]
        )
        client = _FakeClient(
            [
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e499", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e500", ["write"]),
                    ]
                )
            ]
        )

        channels = asyncio.run(module.BleRunner._resolve_io_characteristics(client, ""))

        self.assertEqual(channels.read_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e499")
        self.assertIsNone(channels.notify_uuid)
        self.assertEqual(channels.write_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e500")

    def test_resolve_io_characteristics_requires_configured_input_uuid_to_exist(self):
        module, _fake_store = self._import_ble_runner(
            services=[
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e495", ["notify"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e496", ["write"]),
                    ]
                )
            ]
        )
        client = _FakeClient(
            [
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e495", ["notify"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e496", ["write"]),
                    ]
                )
            ]
        )

        with self.assertRaisesRegex(RuntimeError, "Preferred input uuid not found"):
            asyncio.run(
                module.BleRunner._resolve_io_characteristics(
                    client,
                    preferred_input_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e499",
                )
            )

    def test_read_only_wristband_channel_is_polled_and_parsed(self):
        module, fake_store = self._import_ble_runner(
            services=[
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e499", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e500", ["write"]),
                    ]
                )
            ],
            read_values={"beb5483e-36e1-4688-b7f5-ea0734b5e499": bytes([72, 1])},
            parse_wristband=lambda payload: {
                "metrics_status": "ready",
                "bpm": payload[0],
                "focus": 100 if payload[1] == 1 else 0,
            },
        )
        runner = module.BleRunner()
        runner.wristband_name = "Band-001"
        runner._wb_device = object()

        asyncio.run(runner._ensure_wristband())
        asyncio.run(runner._poll_read_characteristics_once())

        self.assertTrue(fake_store.wristband_connected)
        self.assertEqual(fake_store.last_wristband["bpm"], 72)
        self.assertEqual(fake_store.last_wristband["focus"], 100)

    def test_notify_and_read_characteristic_is_polled_as_fallback(self):
        module, fake_store = self._import_ble_runner(
            services=[
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e495", ["notify", "read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e496", ["write"]),
                    ]
                )
            ],
            read_values={"beb5483e-36e1-4688-b7f5-ea0734b5e495": bytes([88, 1])},
            parse_wristband=lambda payload: {
                "metrics_status": "ready",
                "bpm": payload[0],
                "focus": 100 if payload[1] == 1 else 0,
            },
        )
        runner = module.BleRunner()
        runner.wristband_name = "Band-001"
        runner._wb_device = object()

        asyncio.run(runner._ensure_wristband())
        asyncio.run(runner._poll_read_characteristics_once())

        self.assertEqual(fake_store.last_wristband["bpm"], 88)
        self.assertEqual(runner._wb_io.notify_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e495")
        self.assertEqual(runner._wb_io.read_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e495")

    def test_notify_active_characteristic_skips_read_polling_when_recent_packet_exists(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner._wb_client = _FakeClient([], read_values={"beb5483e-36e1-4688-b7f5-ea0734b5e495": bytes([88, 1])})
        runner._wb_client.is_connected = True
        runner._wb_io = module.IoCharacteristics(
            notify_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
            read_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
        )
        runner._wb_data_ts = time.time()

        asyncio.run(runner._poll_read_characteristics_once())

        self.assertEqual(runner._wb_client.read_calls, [])

    def test_recent_focus_only_packet_blocks_read_fallback_when_notify_stream_is_alive(self):
        module, fake_store = self._import_ble_runner(
            parse_wristband=lambda payload: {
                "metrics_status": "ready",
                "bpm": payload[0] if payload[0] >= 30 else None,
                "focus": 100 if payload[1] == 1 else 0,
            }
        )
        runner = module.BleRunner()
        runner._wb_client = _FakeClient([], read_values={"beb5483e-36e1-4688-b7f5-ea0734b5e495": bytes([77, 1])})
        runner._wb_client.is_connected = True
        runner._wb_io = module.IoCharacteristics(
            notify_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
            read_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
        )

        runner._on_wristband(0, bytearray(bytes([0, 1])))
        asyncio.run(runner._poll_read_characteristics_once())

        self.assertEqual(runner._wb_client.read_calls, [])
        self.assertIsNone(fake_store.last_wristband["bpm"])

    def test_notify_characteristic_uses_read_polling_after_packets_go_stale(self):
        module, fake_store = self._import_ble_runner(
            parse_wristband=lambda payload: {
                "metrics_status": "ready",
                "bpm": payload[0],
            }
        )
        runner = module.BleRunner()
        runner._wb_client = _FakeClient([], read_values={"beb5483e-36e1-4688-b7f5-ea0734b5e495": bytes([77, 1])})
        runner._wb_client.is_connected = True
        runner._wb_io = module.IoCharacteristics(
            notify_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
            read_uuid="beb5483e-36e1-4688-b7f5-ea0734b5e495",
        )
        runner._wb_data_ts = 0.0

        asyncio.run(runner._poll_read_characteristics_once())

        self.assertEqual(runner._wb_client.read_calls, ["beb5483e-36e1-4688-b7f5-ea0734b5e495"])
        self.assertEqual(fake_store.last_wristband["bpm"], 77)

    def test_display_name_uses_advertisement_local_name_fallback(self):
        module, _fake_store = self._import_ble_runner()

        name = module._display_name(_FakeDevice(name=None), _FakeAdv(local_name="Band-001"))

        self.assertEqual(name, "Band-001")

    def test_scan_diagnostics_include_local_name_service_uuids_and_last_seen(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        device = _FakeDevice(name=None)
        device.address = "AA:BB:CC"
        adv = _FakeAdv(local_name="Band-001")
        adv.rssi = -58
        adv.service_uuids = ["180D", "180F"]

        runner._record_scan_observation(device, adv)
        diagnostics = runner.scan_diagnostics()

        self.assertEqual(diagnostics[0]["local_name"], "Band-001")
        self.assertEqual(diagnostics[0]["service_uuids"], ["180D", "180F"])
        self.assertIn("last_seen_s_ago", diagnostics[0])

    def test_presence_hysteresis_treats_minus_57_as_at_desk(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()

        self.assertTrue(runner._update_presence_from_rssi(-57))
        self.assertTrue(runner._is_at_desk)
        self.assertFalse(runner._update_presence_from_rssi(-64))
        self.assertFalse(runner._is_at_desk)

    def test_connected_wristband_keeps_last_presence_when_advertisements_stop(self):
        module, fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner._wb_client = _FakeClient([])
        runner._wb_client.is_connected = True
        runner._wb_rssi = -57
        runner._is_at_desk = True

        runner._publish_presence(wb_alive=False)

        self.assertEqual(
            fake_store.last_presence,
            {"rssi": -57, "distance_m": 0.83, "is_at_desk": True},
        )

    def test_leave_transition_writes_hex_02_to_wristband(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner._wb_client = _FakeClient([])
        runner._wb_client.is_connected = True
        runner.wristband_write_uuid = "write-uuid"

        asyncio.run(runner._maybe_send_leave_signal(True, False))

        self.assertEqual(runner._wb_client.write_calls, [("write-uuid", b"\x02", False)])

    def test_supabase_sync_maps_focus_and_pressure_fields(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        inserted = []
        runner._supabase_repo = types.SimpleNamespace(
            insert_telemetry=lambda **kwargs: inserted.append(kwargs)
        )
        module.telemetry_store = types.SimpleNamespace(
            snapshot=lambda: {
                "wristband": {"hrv": 41.2, "bpm": 72.0, "focus": 84},
                "squeeze": {"pressure_raw": 2048.0, "stress_level": 57},
                "presence": {"distance_m": 0.82, "is_at_desk": True},
            }
        )

        with mock.patch.dict(os.environ, {"ADHD_USER_ID": "u1"}):
            runner._maybe_sync_supabase()

        self.assertEqual(inserted[0]["user_id"], "u1")
        self.assertEqual(inserted[0]["focus_score"], 84)
        self.assertEqual(inserted[0]["squeeze_pressure"], 2048.0)
        self.assertEqual(inserted[0]["stress_level"], 57)

    def test_connection_diagnostics_include_available_characteristics(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner.wristband_name = "Band-001"
        runner.wristband_notify_uuid = "beb5483e-36e1-4688-b7f5-ea0734b5e499"
        runner._wb_available_chars = [
            {"uuid": "beb5483e-36e1-4688-b7f5-ea0734b5e495", "properties": ["notify"]},
            {"uuid": "beb5483e-36e1-4688-b7f5-ea0734b5e496", "properties": ["write"]},
        ]

        diagnostics = runner.connection_diagnostics()

        self.assertEqual(
            diagnostics["wristband"]["configured_input_uuid"],
            "beb5483e-36e1-4688-b7f5-ea0734b5e499",
        )
        self.assertEqual(
            diagnostics["wristband"]["available_characteristics"][0]["uuid"],
            "beb5483e-36e1-4688-b7f5-ea0734b5e495",
        )

    def test_disconnect_keeps_last_characteristic_diagnostics(self):
        module, _fake_store = self._import_ble_runner()
        runner = module.BleRunner()
        runner._wb_available_chars = [
            {"uuid": "beb5483e-36e1-4688-b7f5-ea0734b5e495", "properties": ["notify"]}
        ]

        asyncio.run(runner._disconnect("wristband"))

        self.assertEqual(
            runner.connection_diagnostics()["wristband"]["available_characteristics"][0]["uuid"],
            "beb5483e-36e1-4688-b7f5-ea0734b5e495",
        )

    def test_connected_client_is_not_dropped_only_because_advertisement_went_stale(self):
        module, _fake_store = self._import_ble_runner()
        client = _FakeClient([])
        client.is_connected = True

        self.assertFalse(module._should_drop_connection(False, client))
        self.assertFalse(module._should_drop_connection(True, client))

    def test_disconnected_client_can_be_dropped_when_advertisement_is_stale(self):
        module, _fake_store = self._import_ble_runner()
        client = _FakeClient([])
        client.is_connected = False

        self.assertTrue(module._should_drop_connection(False, client))

    def test_resolve_io_characteristics_supports_legacy_clients_without_get_services(self):
        module, _fake_store = self._import_ble_runner()
        client = _LegacyClient(
            [
                _FakeService(
                    [
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e499", ["read"]),
                        _FakeChar("beb5483e-36e1-4688-b7f5-ea0734b5e500", ["write"]),
                    ]
                )
            ]
        )

        channels = asyncio.run(module.BleRunner._resolve_io_characteristics(client, ""))

        self.assertEqual(channels.read_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e499")
        self.assertEqual(channels.write_uuid, "beb5483e-36e1-4688-b7f5-ea0734b5e500")


if __name__ == "__main__":
    unittest.main()
