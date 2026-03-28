import unittest
from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

from utils.agent_flow import build_time_parse_candidates
from utils.contact_utils import parse_datetime_natural


class _FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        base = datetime(2026, 3, 7, 12, 0, 0, tzinfo=ZoneInfo("America/New_York"))
        if tz is None:
            return base.replace(tzinfo=None)
        return base.astimezone(tz)


class TimeParsingTests(unittest.TestCase):
    def test_recent_context_beats_model_paraphrase_for_time_candidates(self) -> None:
        candidates = build_time_parse_candidates(
            "tomorrow at 2pm",
            recent_context="I would like to come on tenth March at two PM.",
        )

        self.assertEqual(candidates[0], "I would like to come on tenth March at two PM.")

    def test_previous_date_is_combined_with_time_only_reply(self) -> None:
        candidates = build_time_parse_candidates(
            "2 PM",
            previous_text="this monday",
        )

        self.assertEqual(candidates[0], "this monday at 2 PM")

    @mock.patch("utils.contact_utils.datetime", _FixedDateTime)
    def test_parse_day_after_tomorrow(self) -> None:
        result = parse_datetime_natural("day after tomorrow at 2 pm", tz_hint="America/New_York")

        self.assertTrue(result["success"])
        self.assertEqual(result["datetime"].date().isoformat(), "2026-03-09")
        self.assertEqual(result["datetime"].hour, 14)

    @mock.patch("utils.contact_utils.datetime", _FixedDateTime)
    def test_parse_this_monday(self) -> None:
        result = parse_datetime_natural("this monday at 2 pm", tz_hint="America/New_York")

        self.assertTrue(result["success"])
        self.assertEqual(result["datetime"].date().isoformat(), "2026-03-09")
        self.assertEqual(result["datetime"].hour, 14)

    @mock.patch("utils.contact_utils.datetime", _FixedDateTime)
    def test_parse_next_saturday(self) -> None:
        result = parse_datetime_natural("next saturday at 10 am", tz_hint="America/New_York")

        self.assertTrue(result["success"])
        self.assertEqual(result["datetime"].date().isoformat(), "2026-03-14")
        self.assertEqual(result["datetime"].hour, 10)

    @mock.patch("utils.contact_utils.datetime", _FixedDateTime)
    def test_parse_ordinal_month_phrase(self) -> None:
        result = parse_datetime_natural("tenth march at two pm", tz_hint="America/New_York")

        self.assertTrue(result["success"])
        self.assertEqual(result["datetime"].date().isoformat(), "2026-03-10")
        self.assertEqual(result["datetime"].hour, 14)


if __name__ == "__main__":
    unittest.main()
