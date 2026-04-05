import importlib
import os
import sys
import unittest
from unittest import mock


class ServerStartupTests(unittest.TestCase):
    def test_server_imports_without_bleak_when_ble_runner_disabled(self):
        with mock.patch.dict(os.environ, {"ENABLE_BLE_RUNNER": "0"}, clear=False):
            sys.modules.pop("backend.api.server", None)
            sys.modules.pop("backend.api.ble_runner", None)

            server = importlib.import_module("backend.api.server")

        self.assertIsNotNone(server.app)


if __name__ == "__main__":
    unittest.main()
