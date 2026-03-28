"""
Integration tests for the full booking flow: name -> service -> time -> phone -> book.
All external calls (Supabase, slot checking) are mocked.
"""

import unittest
from datetime import datetime, date
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from models.state import PatientState
from tools import assistant_tools as assistant_tools_module
from tools.assistant_tools import AssistantTools


TZ = ZoneInfo("America/New_York")


def _configure_globals() -> None:
    assistant_tools_module._GLOBAL_CLINIC_INFO = {
        "id": "clinic-test-123",
        "name": "Test Dental Clinic",
        "organization_id": "org-test-456",
        "default_phone_region": "US",
        "timezone": "America/New_York",
    }
    assistant_tools_module._GLOBAL_SCHEDULE = {"working_hours": {}}
    assistant_tools_module._GLOBAL_CLINIC_TZ = "America/New_York"
    assistant_tools_module._REFRESH_AGENT_MEMORY = None


class BookingHappyPathTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_globals()

    async def test_complete_booking_happy_path(self) -> None:
        """Full happy path: name -> service -> datetime -> phone confirmation -> book."""
        state = PatientState()
        clinic_info = {
            "id": "clinic-test-123",
            "organization_id": "org-test-456",
            "default_phone_region": "US",
        }
        tools = AssistantTools(
            state,
            clinic_info=clinic_info,
            schedule={"working_hours": {}},
        )

        # Step 1: Name capture
        result = await tools.update_patient_record(name="Sarah Johnson")
        self.assertEqual(state.full_name, "Sarah Johnson")

        # Step 2: Service capture
        result = await tools.update_patient_record(reason="Cleaning")
        self.assertEqual(state.reason, "Cleaning")
        self.assertGreater(state.duration_minutes, 0)

        # Step 3: Time capture — mock parsing + availability
        parsed_dt = datetime(2026, 6, 15, 14, 0, tzinfo=TZ)
        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": parsed_dt},
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=True),
        ):
            # Pre-populate detected phone so caller ID flow triggers
            state.detected_phone = "+12125551234"
            state.phone_last4 = "1234"
            state.phone_source = "sip"
            result = await tools.update_patient_record(time_suggestion="next Thursday at 2pm")

        self.assertEqual(state.dt_local, parsed_dt)
        self.assertTrue(state.slot_available)

        # Step 4: Phone confirmation
        result = await tools.confirm_phone(confirmed=True)
        self.assertTrue(state.phone_confirmed)
        self.assertEqual(state.phone_e164, "+12125551234")

        # Step 5: Book
        with patch(
            "tools.assistant_tools.book_to_supabase",
            new=AsyncMock(return_value="appt-test-001"),
        ):
            result = await tools.confirm_and_book_appointment()

        self.assertTrue(state.booking_confirmed)
        self.assertTrue(state.appointment_booked)
        self.assertEqual(state.appointment_id, "appt-test-001")
        self.assertIn("Sarah Johnson", result)

    async def test_name_normalization(self) -> None:
        """Names should be stripped and title-cased."""
        state = PatientState()
        tools = AssistantTools(state)

        await tools.update_patient_record(name="  sarah johnson  ")
        self.assertIsNotNone(state.full_name)
        self.assertEqual(state.full_name, state.full_name.strip())
        self.assertEqual(state.full_name, "Sarah Johnson")

    async def test_reason_sets_duration(self) -> None:
        """Setting a reason should also set duration_minutes from the schedule."""
        state = PatientState()
        tools = AssistantTools(state, schedule={"working_hours": {}})

        await tools.update_patient_record(reason="Cleaning")
        self.assertEqual(state.reason, "Cleaning")
        self.assertIsNotNone(state.duration_minutes)
        self.assertGreater(state.duration_minutes, 0)


class BookingEdgeCaseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_globals()

    async def test_date_without_time_prompts_for_time(self) -> None:
        """When caller gives date but no time, agent should ask for time."""
        state = PatientState(reason="Cleaning", duration_minutes=30)
        tools = AssistantTools(state)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"date_only": True, "parsed_date": date(2026, 6, 15)},
        ):
            result = await tools.update_patient_record(time_suggestion="next Thursday")

        self.assertIn("What time works best for you?", result)
        self.assertEqual(state.time_status, "pending")

    async def test_slot_taken_returns_alternatives(self) -> None:
        """When requested slot is taken, agent should return alternative times."""
        state = PatientState(
            full_name="Test User",
            reason="Cleaning",
            duration_minutes=30,
        )
        clinic_info = {"id": "clinic-test-123", "default_phone_region": "US"}
        tools = AssistantTools(state, clinic_info=clinic_info, schedule={"working_hours": {}})

        requested_dt = datetime(2026, 6, 15, 14, 0, tzinfo=TZ)
        alt1 = datetime(2026, 6, 15, 15, 0, tzinfo=TZ)
        alt2 = datetime(2026, 6, 15, 15, 30, tzinfo=TZ)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": requested_dt},
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=False),
        ), patch(
            "tools.assistant_tools.suggest_slots_around",
            new=AsyncMock(return_value=[alt1, alt2]),
        ):
            result = await tools.update_patient_record(time_suggestion="Thursday at 2pm")

        result_lower = result.lower()
        self.assertTrue(
            any(w in result_lower for w in ["booked", "taken", "can do", "i have"]),
            f"Expected alternatives in response, got: {result}",
        )
        self.assertIn("3:00 PM", result)

    async def test_phone_confirmation_declined_asks_for_alternative(self) -> None:
        """When caller declines caller ID, agent should ask for alternative number."""
        state = PatientState(
            phone_pending="+12125551234",
            phone_last4="1234",
            phone_source="sip",
            contact_phase_started=True,
        )
        tools = AssistantTools(state)

        result = await tools.confirm_phone(confirmed=False)

        self.assertFalse(state.phone_confirmed)
        self.assertIsNone(state.phone_e164)
        result_lower = result.lower()
        self.assertTrue(
            any(w in result_lower for w in ["number", "instead"]),
            f"Expected question about alternative number, got: {result}",
        )

    async def test_booking_without_complete_state_fails_gracefully(self) -> None:
        """Calling confirm_and_book with incomplete state should return missing info message."""
        state = PatientState(full_name="Test User")
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-test-123", "default_phone_region": "US"},
        )

        result = await tools.confirm_and_book_appointment()

        self.assertIsInstance(result, str)
        self.assertFalse(state.booking_confirmed)
        self.assertIn("still need", result.lower())

    async def test_booking_supabase_failure_returns_retry_message(self) -> None:
        """If Supabase write fails, agent should ask caller to try again (not crash)."""
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            duration_minutes=30,
            phone_confirmed=True,
            phone_e164="+12125551234",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=TZ),
            time_status="valid",
            slot_available=True,
        )
        tools = AssistantTools(
            state,
            clinic_info={
                "id": "clinic-test-123",
                "organization_id": "org-test-456",
                "default_phone_region": "US",
            },
        )

        with patch(
            "tools.assistant_tools.book_to_supabase",
            new=AsyncMock(return_value=None),
        ):
            result = await tools.confirm_and_book_appointment()

        # Should return a message (not raise), and NOT mark as booked
        self.assertIsInstance(result, str)
        self.assertFalse(state.booking_confirmed)
        self.assertIn("trouble", result.lower())

    async def test_duplicate_booking_is_idempotent(self) -> None:
        """Calling confirm_and_book when already booked should return existing info."""
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=TZ),
            appointment_booked=True,
            booking_confirmed=True,
            appointment_id="appt-already-booked",
        )
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-test-123", "default_phone_region": "US"},
        )

        result = await tools.confirm_and_book_appointment()

        self.assertIn("already booked", result.lower())


if __name__ == "__main__":
    unittest.main()
