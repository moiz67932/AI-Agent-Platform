import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from agent import (
    _infer_expected_slot_from_response,
    _handle_deterministic_confirmation_turn,
    _needs_filler,
    _seed_state_from_recent_context,
)
from config import logger as app_logger
from models.state import PatientState
from utils.call_logger import StructuredLogger
from utils.turn_taking import ExpectedUserSlot, preview_turn


class _FakeSession:
    def __init__(self) -> None:
        self.say_calls: list[tuple[str, dict]] = []

    def say(self, text: str, **kwargs):
        self.say_calls.append((text, kwargs))
        return SimpleNamespace()


class DeterministicTurnTests(unittest.IsolatedAsyncioTestCase):
    async def test_phone_confirmation_fast_lane_books_and_consumes(self) -> None:
        from datetime import datetime

        state = PatientState(
            full_name="Jane Smith",
            reason="Cleaning",
            dt_local=datetime(2026, 3, 12, 10, 0),
        )
        state.time_status = "valid"
        state.phone_pending = "+13105550001"
        state.phone_last4 = "0001"
        state.pending_confirm = "phone"
        state.pending_confirm_field = "phone"
        state.contact_phase_started = True

        session = _FakeSession()

        async def _confirm_phone(*, confirmed: bool):
            state.phone_confirmed = confirmed
            state.phone_e164 = state.phone_pending
            state.using_caller_number = True
            state.confirmed_contact_number_source = "caller_id"
            state.pending_confirm = None
            state.pending_confirm_field = None
            return "Phone saved."

        async def _book():
            state.appointment_booked = True
            state.booking_confirmed = True
            return "Booked for Thursday at 10 AM."

        tools = SimpleNamespace(
            confirm_phone=AsyncMock(side_effect=_confirm_phone),
            confirm_email=AsyncMock(),
            confirm_and_book_appointment=AsyncMock(side_effect=_book),
        )
        cancel_scheduled = Mock()
        interrupt_filler = Mock()
        refresh_memory = AsyncMock()
        mark_direct = Mock()

        result = await _handle_deterministic_confirmation_turn(
            text="Yes, please use that number.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=cancel_scheduled,
            interrupt_filler=interrupt_filler,
            refresh_memory_async=refresh_memory,
            mark_direct_response=mark_direct,
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(tools.confirm_phone.await_count, 1)
        self.assertEqual(tools.confirm_and_book_appointment.await_count, 1)
        self.assertTrue(state.appointment_booked)
        self.assertEqual(session.say_calls[0][0], "Booked for Thursday at 10 AM.")
        cancel_scheduled.assert_called_once()
        interrupt_filler.assert_called_once()
        mark_direct.assert_called_once()

    async def test_phone_confirmation_incomplete_turn_prompts_missing_slot_without_booking(self) -> None:
        from datetime import datetime

        state = PatientState(
            reason="Cleaning",
            dt_local=datetime(2026, 3, 12, 10, 0),
            time_status="valid",
            phone_pending="+13105550001",
            phone_last4="0001",
            pending_confirm="phone",
            pending_confirm_field="phone",
            contact_phase_started=True,
        )
        session = _FakeSession()

        async def _confirm_phone(*, confirmed: bool):
            state.phone_confirmed = confirmed
            state.phone_e164 = state.phone_pending
            state.using_caller_number = True
            state.confirmed_contact_number_source = "caller_id"
            state.pending_confirm = None
            state.pending_confirm_field = None
            return "Phone saved."

        tools = SimpleNamespace(
            confirm_phone=AsyncMock(side_effect=_confirm_phone),
            confirm_email=AsyncMock(),
            confirm_and_book_appointment=AsyncMock(),
        )

        result = await _handle_deterministic_confirmation_turn(
            text="yes",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(tools.confirm_and_book_appointment.await_count, 0)
        self.assertEqual(
            session.say_calls[0][0],
            "Perfect, I'll use this number for your confirmation and reminders. What name should I put on the appointment?",
        )

    async def test_duplicate_confirmation_is_consumed_without_second_action(self) -> None:
        from datetime import datetime

        state = PatientState(
            dt_local=datetime(2026, 3, 12, 10, 0),
            phone_pending="+13105550001",
            pending_confirm="phone",
            pending_confirm_field="phone",
            contact_phase_started=True,
            last_confirm_fingerprint="phone|yes|2026-03-12 10:00:00|+13105550001",
            last_confirm_ts=time.perf_counter(),
        )
        session = _FakeSession()
        tools = SimpleNamespace(
            confirm_phone=AsyncMock(),
            confirm_email=AsyncMock(),
            confirm_and_book_appointment=AsyncMock(),
        )

        result = await _handle_deterministic_confirmation_turn(
            text="yes",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(tools.confirm_phone.await_count, 0)
        self.assertEqual(session.say_calls, [])


class FillerAndStateCaptureTests(unittest.TestCase):
    def test_service_booking_prompt_keeps_expected_service_slot(self) -> None:
        slot = _infer_expected_slot_from_response(
            route=None,
            spoken_text="Sure, John. Can you tell me which service you'd like to book?",
            state=PatientState(full_name="John"),
        )

        self.assertEqual(slot, ExpectedUserSlot.SERVICE)

    def test_alternative_slot_prompt_keeps_expected_time_slot_when_date_context_is_saved(self) -> None:
        slot = _infer_expected_slot_from_response(
            route=None,
            spoken_text=(
                "We close at 5:00 PM on Fridays, so a 60-minute appointment can't start at 9:00 PM. "
                "I have 9:00 AM or 9:15 AM. Would you like one of those?"
            ),
            state=PatientState(
                reason="Teeth whitening",
                dt_text="Friday, March 20",
                time_status="invalid",
            ),
        )

        self.assertEqual(slot, ExpectedUserSlot.TIME)

    def test_seed_state_from_recent_context_recovers_name_and_reason(self) -> None:
        state = PatientState()
        state.remember_user_text("Hi, my name is Sarah")
        state.remember_user_text("I need a cleaning tomorrow at 10.")

        updates = _seed_state_from_recent_context(
            state,
            schedule={"treatment_durations": {"Cleaning": 30}},
        )

        self.assertIn("name=Sarah", updates)
        self.assertIn("reason=Cleaning", updates)
        self.assertEqual(state.full_name, "Sarah")
        self.assertEqual(state.reason, "Cleaning")

    def test_filler_suppressed_for_still_forming_booking_turn(self) -> None:
        self.assertFalse(
            _needs_filler("Um, I was thinking if I could get tomorrow at, uh", state=PatientState())
        )

    def test_filler_allowed_for_lookup_question(self) -> None:
        self.assertTrue(_needs_filler("Do you take Delta Dental?", state=PatientState()))

    def test_clinic_info_fast_path_can_schedule_contextual_filler_bridge(self) -> None:
        snapshot, decision = preview_turn(
            "What is the pricing of teeth whitening?",
            patient_state=PatientState(),
            silence_ms=1200,
        )

        self.assertEqual(snapshot.deterministic_next_step, "clinic_info.answer")
        self.assertEqual(decision.action.value, "fast_path")
        self.assertEqual(decision.deterministic_route, "clinic_info.answer")
        self.assertIn("teeth whitening", decision.filler_text or "")


class LoggingConfigTests(unittest.TestCase):
    def test_app_logger_does_not_propagate(self) -> None:
        self.assertFalse(app_logger.propagate)

    def test_structured_logger_does_not_propagate(self) -> None:
        structured = StructuredLogger(name="test_call_logger")
        self.assertFalse(structured._logger.propagate)


if __name__ == "__main__":
    unittest.main()
