import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from models.state import PatientState
from services.database_service import _normalize_appointment_source, book_to_supabase


class _FakeAppointmentsTable:
    def __init__(self) -> None:
        self.insert_payload = None

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def execute(self):
        return SimpleNamespace(data=[{"id": "appt-123"}])


class _FakeSupabase:
    def __init__(self, table: _FakeAppointmentsTable) -> None:
        self._table = table
        self.last_table_name = None

    def table(self, name: str):
        self.last_table_name = name
        return self._table


async def _inline_to_thread(func, /, *args, **kwargs):
    return func(*args, **kwargs)


class DatabaseServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_book_to_supabase_omits_duration_column_but_keeps_reserved_window(self) -> None:
        table = _FakeAppointmentsTable()
        fake_supabase = _FakeSupabase(table)
        state = PatientState(
            full_name="John",
            phone_e164="+923351897839",
            reason="Teeth whitening",
            dt_local=datetime(2026, 1, 15, 15, 0, tzinfo=ZoneInfo("America/New_York")),
            duration_minutes=60,
        )
        clinic_info = {"id": "clinic-123", "organization_id": "org-123"}

        with patch("services.database_service.supabase", fake_supabase), patch(
            "services.database_service.asyncio.to_thread",
            side_effect=_inline_to_thread,
        ), patch("utils.slot_cache.invalidate_slot_cache"):
            appt_id = await book_to_supabase(
                clinic_info,
                patient_state=state,
                calendar_event_id=None,
            )

        self.assertEqual(appt_id, "appt-123")
        self.assertEqual(fake_supabase.last_table_name, "appointments")
        self.assertIsNotNone(table.insert_payload)
        self.assertNotIn("duration_minutes", table.insert_payload)
        self.assertEqual(table.insert_payload["reason"], "Teeth whitening")
        self.assertEqual(table.insert_payload["source"], "ai")

        start_dt = datetime.fromisoformat(table.insert_payload["start_time"])
        end_dt = datetime.fromisoformat(table.insert_payload["end_time"])
        self.assertEqual(int((end_dt - start_dt).total_seconds() // 60), 60)
        self.assertEqual(start_dt.utcoffset().total_seconds(), -5 * 3600)

    def test_invalid_appointment_source_falls_back_to_ai(self) -> None:
        self.assertEqual(_normalize_appointment_source("voice_agent"), "ai")
        self.assertEqual(_normalize_appointment_source("AI"), "ai")


if __name__ == "__main__":
    unittest.main()
