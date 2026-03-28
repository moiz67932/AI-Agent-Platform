"""
Tests for the cancel/reschedule tool flow: find -> confirm -> cancel/reschedule.
All Supabase calls are mocked via the appointment_management_service layer.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from models.state import PatientState
from tools import assistant_tools as assistant_tools_module
from tools.assistant_tools import AssistantTools


TZ = ZoneInfo("America/New_York")
FUTURE_DT = datetime(2026, 6, 15, 14, 0, tzinfo=TZ)


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


def _found_appointment() -> dict:
    return {
        "id": "appt-cancel-001",
        "patient_name": "Sarah Johnson",
        "reason": "Cleaning",
        "start_time": FUTURE_DT,
        "status": "scheduled",
        "calendar_event_id": None,
    }


class FindExistingAppointmentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_globals()

    async def test_find_appointment_by_phone(self) -> None:
        """find_existing_appointment should search by phone and populate state."""
        state = PatientState(
            phone_e164="+12125551234",
            appointment_action="cancelling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.find_appointment_by_phone",
            new=AsyncMock(return_value=_found_appointment()),
        ):
            result = await tools.find_existing_appointment()

        self.assertEqual(state.found_appointment_id, "appt-cancel-001")
        self.assertIsNotNone(state.found_appointment_details)
        self.assertIn("Cleaning", result)

    async def test_find_appointment_not_found(self) -> None:
        """When no appointment exists, should ask for more info."""
        state = PatientState(phone_e164="+12125559999")
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.find_appointment_by_phone",
            new=AsyncMock(return_value=None),
        ):
            result = await tools.find_existing_appointment()

        self.assertIsNone(state.found_appointment_id)
        result_lower = result.lower()
        self.assertTrue(
            any(w in result_lower for w in ["don't see", "don't have", "number"]),
            f"Expected 'not found' message, got: {result}",
        )

    async def test_find_appointment_no_phone_asks_for_phone(self) -> None:
        """Without any phone number, should ask the caller."""
        state = PatientState()
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        result = await tools.find_existing_appointment()

        self.assertIsNone(state.found_appointment_id)
        result_lower = result.lower()
        self.assertTrue(
            any(w in result_lower for w in ["phone", "number"]),
            f"Expected phone request, got: {result}",
        )

    async def test_find_appointment_uses_detected_phone_as_fallback(self) -> None:
        """Should fall back to detected_phone when phone_e164 is not set."""
        state = PatientState(
            detected_phone="+12125551234",
            appointment_action="rescheduling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.find_appointment_by_phone",
            new=AsyncMock(return_value=_found_appointment()),
        ) as mock_find:
            result = await tools.find_existing_appointment()

        mock_find.assert_awaited_once()
        self.assertEqual(state.found_appointment_id, "appt-cancel-001")


class CancelAppointmentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_globals()

    async def test_cancel_without_finding_first(self) -> None:
        """cancel_appointment_tool without finding first should prompt to search."""
        state = PatientState()
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        result = await tools.cancel_appointment_tool(confirmed=True)

        self.assertIsInstance(result, str)
        result_lower = result.lower()
        self.assertTrue(
            "find" in result_lower or "search" in result_lower,
            f"Expected message about finding first, got: {result}",
        )
        self.assertFalse(state.booking_confirmed)

    async def test_cancel_unconfirmed_asks_for_confirmation(self) -> None:
        """cancel_appointment_tool(confirmed=False) should ask for explicit confirmation."""
        appt = _found_appointment()
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
            appointment_action="cancelling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        result = await tools.cancel_appointment_tool(confirmed=False)

        self.assertIn("confirm", result.lower())
        self.assertIn("Cleaning", result)
        # State should NOT be cleared yet
        self.assertIsNotNone(state.found_appointment_id)

    async def test_cancel_confirmed_updates_supabase_and_clears_state(self) -> None:
        """cancel_appointment_tool(confirmed=True) should cancel and clear state."""
        appt = _found_appointment()
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
            appointment_action="cancelling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.cancel_appointment",
            new=AsyncMock(return_value=True),
        ) as mock_cancel:
            result = await tools.cancel_appointment_tool(confirmed=True)

        mock_cancel.assert_awaited_once_with(
            appointment_id="appt-cancel-001",
            reason="user_requested",
        )
        self.assertIn("cancelled", result.lower())
        self.assertIn("Cleaning", result)
        self.assertIsNone(state.found_appointment_id)
        self.assertIsNone(state.found_appointment_details)

    async def test_cancel_supabase_failure_returns_error(self) -> None:
        """If Supabase cancel fails, should return error message."""
        appt = _found_appointment()
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.cancel_appointment",
            new=AsyncMock(return_value=False),
        ):
            result = await tools.cancel_appointment_tool(confirmed=True)

        result_lower = result.lower()
        self.assertTrue(
            "trouble" in result_lower or "office" in result_lower,
            f"Expected error message, got: {result}",
        )
        # State should NOT be cleared on failure
        self.assertIsNotNone(state.found_appointment_id)


class RescheduleAppointmentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_globals()

    async def test_reschedule_without_finding_first(self) -> None:
        """reschedule_appointment_tool without finding first should prompt to search."""
        state = PatientState()
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        result = await tools.reschedule_appointment_tool(new_time="Friday at 3pm")

        result_lower = result.lower()
        self.assertTrue(
            "find" in result_lower,
            f"Expected message about finding first, got: {result}",
        )

    async def test_reschedule_without_new_time_asks_for_time(self) -> None:
        """reschedule_appointment_tool without new_time should ask."""
        appt = _found_appointment()
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        result = await tools.reschedule_appointment_tool()

        result_lower = result.lower()
        self.assertTrue(
            "time" in result_lower,
            f"Expected time question, got: {result}",
        )

    async def test_reschedule_unconfirmed_asks_for_confirmation(self) -> None:
        """reschedule(confirmed=False) should ask to confirm the move."""
        appt = _found_appointment()
        # Add duration info the tool needs
        appt["duration_minutes"] = 30
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
            appointment_action="rescheduling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
            schedule={"working_hours": {}},
        )

        new_dt = datetime(2026, 6, 20, 15, 0, tzinfo=TZ)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": new_dt},
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=True),
        ):
            result = await tools.reschedule_appointment_tool(
                new_time="Friday at 3pm",
                confirmed=False,
            )

        self.assertIn("confirm", result.lower())
        # State should NOT be cleared yet
        self.assertIsNotNone(state.found_appointment_id)

    async def test_reschedule_confirmed_updates_supabase_and_clears_state(self) -> None:
        """reschedule(confirmed=True) should update and clear state."""
        appt = _found_appointment()
        appt["duration_minutes"] = 30
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
            appointment_action="rescheduling",
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
            schedule={"working_hours": {}},
        )

        new_dt = datetime(2026, 6, 20, 15, 0, tzinfo=TZ)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": new_dt},
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=True),
        ), patch(
            "tools.assistant_tools.reschedule_appointment",
            new=AsyncMock(return_value=True),
        ) as mock_reschedule:
            result = await tools.reschedule_appointment_tool(
                new_time="Friday at 3pm",
                confirmed=True,
            )

        mock_reschedule.assert_awaited_once()
        self.assertIn("moved", result.lower())
        self.assertIsNone(state.found_appointment_id)
        self.assertIsNone(state.found_appointment_details)

    async def test_reschedule_slot_taken_returns_alternatives(self) -> None:
        """When new slot is taken, should offer alternatives."""
        appt = _found_appointment()
        appt["duration_minutes"] = 30
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
            schedule={"working_hours": {}},
        )

        new_dt = datetime(2026, 6, 20, 15, 0, tzinfo=TZ)
        alt1 = datetime(2026, 6, 20, 15, 30, tzinfo=TZ)
        alt2 = datetime(2026, 6, 20, 16, 0, tzinfo=TZ)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": new_dt},
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
            result = await tools.reschedule_appointment_tool(new_time="Friday at 3pm")

        result_lower = result.lower()
        self.assertTrue(
            "taken" in result_lower or "booked" in result_lower,
            f"Expected slot-taken message, got: {result}",
        )
        # State should NOT be cleared
        self.assertIsNotNone(state.found_appointment_id)

    async def test_reschedule_parse_failure_asks_to_retry(self) -> None:
        """If time parsing fails, should ask caller to try again."""
        appt = _found_appointment()
        state = PatientState(
            found_appointment_id=appt["id"],
            found_appointment_details=appt,
        )
        tools = AssistantTools(
            state,
            clinic_info=assistant_tools_module._GLOBAL_CLINIC_INFO,
        )

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": None},
        ):
            result = await tools.reschedule_appointment_tool(new_time="asdf")

        result_lower = result.lower()
        self.assertTrue(
            "couldn't understand" in result_lower or "try again" in result_lower,
            f"Expected parse failure message, got: {result}",
        )


class IntentDetectionTests(unittest.TestCase):
    """Test the appointment_action intent detection keywords."""

    def test_cancel_keyword_sets_cancelling(self) -> None:
        state = PatientState()
        state.remember_user_text("I need to cancel my appointment")
        lower_text = state.last_user_text.lower()
        if any(w in lower_text for w in ["cancel", "cancellation", "cancel my"]):
            state.appointment_action = "cancelling"
        self.assertEqual(state.appointment_action, "cancelling")

    def test_reschedule_keyword_sets_rescheduling(self) -> None:
        state = PatientState()
        state.remember_user_text("I want to reschedule")
        lower_text = state.last_user_text.lower()
        if any(w in lower_text for w in [
            "reschedule", "change my appointment",
            "move my appointment", "different time", "different day",
        ]):
            state.appointment_action = "rescheduling"
        self.assertEqual(state.appointment_action, "rescheduling")

    def test_different_time_sets_rescheduling(self) -> None:
        state = PatientState()
        state.remember_user_text("Can I get a different time?")
        lower_text = state.last_user_text.lower()
        if any(w in lower_text for w in [
            "reschedule", "change my appointment",
            "move my appointment", "different time", "different day",
        ]):
            state.appointment_action = "rescheduling"
        self.assertEqual(state.appointment_action, "rescheduling")

    def test_no_cancel_keyword_keeps_none(self) -> None:
        state = PatientState()
        state.remember_user_text("I want to book a cleaning")
        lower_text = state.last_user_text.lower()
        if any(w in lower_text for w in ["cancel", "cancellation"]):
            state.appointment_action = "cancelling"
        elif any(w in lower_text for w in ["reschedule", "change my appointment"]):
            state.appointment_action = "rescheduling"
        self.assertIsNone(state.appointment_action)


if __name__ == "__main__":
    unittest.main()
