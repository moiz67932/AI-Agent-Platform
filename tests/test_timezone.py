import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from config import BOOKING_TZ


class BookingTimezoneTests(unittest.TestCase):
    def test_booking_tz_is_eastern(self) -> None:
        tz = ZoneInfo(BOOKING_TZ)
        self.assertEqual(BOOKING_TZ, "America/New_York")
        dt = datetime(2026, 1, 15, 15, 0, tzinfo=tz)
        self.assertEqual(dt.utcoffset().total_seconds(), -5 * 3600)

    def test_booking_tz_is_edt_in_summer(self) -> None:
        tz = ZoneInfo(BOOKING_TZ)
        dt = datetime(2026, 7, 15, 15, 0, tzinfo=tz)
        self.assertEqual(dt.utcoffset().total_seconds(), -4 * 3600)


if __name__ == "__main__":
    unittest.main()
