import unittest


class ParserTests(unittest.TestCase):
    def test_parse_wristband_two_byte_payload_maps_bpm_and_focus_state(self):
        from backend.gateway.parsers import parse_wristband

        parsed = parse_wristband(bytes([72, 1]))

        self.assertEqual(parsed["metrics_status"], "ready")
        self.assertEqual(parsed["bpm"], 72.0)
        self.assertEqual(parsed["focus"], 100)
        self.assertTrue(parsed["focus_active"])
        self.assertIsNone(parsed["hrv"])
        self.assertIsNone(parsed["sdnn"])

    def test_parse_wristband_zero_bpm_treats_value_as_invalid(self):
        from backend.gateway.parsers import parse_wristband

        parsed = parse_wristband(bytes([0, 0]))

        self.assertEqual(parsed["metrics_status"], "ready")
        self.assertIsNone(parsed["bpm"])
        self.assertEqual(parsed["focus"], 0)
        self.assertFalse(parsed["focus_active"])

    def test_parse_wristband_implausibly_low_bpm_is_treated_as_invalid(self):
        from backend.gateway.parsers import parse_wristband

        parsed = parse_wristband(bytes([2, 1]))

        self.assertEqual(parsed["metrics_status"], "ready")
        self.assertIsNone(parsed["bpm"])
        self.assertEqual(parsed["focus"], 100)
        self.assertTrue(parsed["focus_active"])


if __name__ == "__main__":
    unittest.main()
