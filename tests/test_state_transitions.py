"""
Unit tests for PatientState transitions and helper methods.
No external deps — pure dataclass behavior.
"""

import unittest
from datetime import datetime, timezone

from models.state import PatientState, contact_phase_allowed


class InitialStateTests(unittest.TestCase):
    def test_initial_state_has_no_slots_filled(self) -> None:
        state = PatientState()
        self.assertIsNone(state.full_name)
        self.assertIsNone(state.reason)
        self.assertIsNone(state.dt_local)
        self.assertFalse(state.phone_confirmed)
        self.assertFalse(state.booking_confirmed)
        self.assertIsNone(state.appointment_action)
        self.assertIsNone(state.found_appointment_id)
        self.assertIsNone(state.found_appointment_details)

    def test_default_duration_is_60(self) -> None:
        state = PatientState()
        self.assertEqual(state.duration_minutes, 60)

    def test_default_time_status_is_pending(self) -> None:
        state = PatientState()
        self.assertEqual(state.time_status, "pending")


class MissingSlotsTests(unittest.TestCase):
    def test_missing_slots_returns_all_for_empty_state(self) -> None:
        state = PatientState()
        missing = state.missing_slots()
        self.assertIn("full_name", missing)
        self.assertIn("reason", missing)
        self.assertIn("datetime", missing)
        self.assertIn("phone", missing)

    def test_missing_slots_after_name_captured(self) -> None:
        state = PatientState(full_name="Sarah Johnson")
        missing = state.missing_slots()
        self.assertNotIn("full_name", missing)
        self.assertIn("reason", missing)

    def test_missing_slots_after_phone_set_but_unconfirmed(self) -> None:
        state = PatientState(phone_e164="+12125551234")
        missing = state.missing_slots()
        self.assertIn("phone_confirmed", missing)
        self.assertNotIn("phone", missing)

    def test_missing_slots_after_phone_confirmed(self) -> None:
        state = PatientState(
            phone_e164="+12125551234",
            phone_confirmed=True,
        )
        missing = state.missing_slots()
        self.assertNotIn("phone", missing)
        self.assertNotIn("phone_confirmed", missing)


class IsCompleteTests(unittest.TestCase):
    def test_is_complete_when_all_required_fields_set(self) -> None:
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
            phone_confirmed=True,
            phone_e164="+12125551234",
        )
        self.assertTrue(state.is_complete())

    def test_is_not_complete_without_phone(self) -> None:
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
        )
        self.assertFalse(state.is_complete())

    def test_is_not_complete_without_name(self) -> None:
        state = PatientState(
            reason="Cleaning",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
            phone_confirmed=True,
            phone_e164="+12125551234",
        )
        self.assertFalse(state.is_complete())

    def test_is_not_complete_without_datetime(self) -> None:
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            phone_confirmed=True,
            phone_e164="+12125551234",
        )
        self.assertFalse(state.is_complete())


class SlotSummaryTests(unittest.TestCase):
    def test_slot_summary_format(self) -> None:
        state = PatientState(full_name="Sarah")
        summary = state.slot_summary()
        self.assertIsInstance(summary, str)
        self.assertIn("Sarah", summary)

    def test_slot_summary_with_complete_state(self) -> None:
        state = PatientState(
            full_name="Sarah Johnson",
            reason="Cleaning",
            phone_confirmed=True,
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
        )
        summary = state.slot_summary()
        self.assertIn("Sarah Johnson", summary)
        self.assertIn("Cleaning", summary)
        self.assertIn("confirmed", summary)

    def test_slot_summary_with_empty_state(self) -> None:
        state = PatientState()
        summary = state.slot_summary()
        self.assertIn("?", summary)


class RejectedSlotsTests(unittest.TestCase):
    def test_rejected_slot_is_tracked(self) -> None:
        state = PatientState()
        dt = datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc)
        state.add_rejected_slot(dt, reason="slot_taken")
        self.assertTrue(state.is_slot_rejected(dt))

    def test_non_rejected_slot_is_not_tracked(self) -> None:
        state = PatientState()
        dt1 = datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc)
        dt2 = datetime(2026, 6, 15, 15, 0, tzinfo=timezone.utc)
        state.add_rejected_slot(dt1)
        self.assertFalse(state.is_slot_rejected(dt2))


class RememberUserTextTests(unittest.TestCase):
    def test_remember_user_text_tracks_history(self) -> None:
        state = PatientState()
        state.remember_user_text("Hello this is John")
        state.remember_user_text("I want a cleaning")
        self.assertEqual(len(state.recent_user_texts), 2)
        self.assertEqual(state.last_user_text, "I want a cleaning")

    def test_remember_user_text_ignores_blank(self) -> None:
        state = PatientState()
        state.remember_user_text("   ")
        self.assertEqual(len(state.recent_user_texts), 0)
        self.assertIsNone(state.last_user_text)

    def test_remember_user_text_caps_at_max(self) -> None:
        state = PatientState()
        for i in range(15):
            state.remember_user_text(f"utterance {i}")
        self.assertEqual(len(state.recent_user_texts), 10)

    def test_recent_user_context_respects_limit(self) -> None:
        state = PatientState()
        state.remember_user_text("first")
        state.remember_user_text("second")
        state.remember_user_text("third")
        ctx = state.recent_user_context(limit=1)
        self.assertEqual(ctx, "third")


class ContactPhaseGatingTests(unittest.TestCase):
    def test_contact_phase_not_allowed_initially(self) -> None:
        state = PatientState()
        self.assertFalse(contact_phase_allowed(state))

    def test_contact_phase_allowed_with_name_and_valid_time(self) -> None:
        state = PatientState(
            full_name="Sarah",
            time_status="valid",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
        )
        self.assertTrue(contact_phase_allowed(state))

    def test_contact_phase_allowed_with_fallback_flag(self) -> None:
        state = PatientState(contact_phase_started=True)
        self.assertTrue(contact_phase_allowed(state))

    def test_contact_phase_allowed_with_caller_id_accepted(self) -> None:
        state = PatientState(caller_id_accepted=True)
        self.assertTrue(contact_phase_allowed(state))


class AppointmentActionFieldTests(unittest.TestCase):
    def test_appointment_action_defaults_to_none(self) -> None:
        state = PatientState()
        self.assertIsNone(state.appointment_action)

    def test_appointment_action_can_be_set_to_cancelling(self) -> None:
        state = PatientState()
        state.appointment_action = "cancelling"
        self.assertEqual(state.appointment_action, "cancelling")

    def test_appointment_action_can_be_set_to_rescheduling(self) -> None:
        state = PatientState()
        state.appointment_action = "rescheduling"
        self.assertEqual(state.appointment_action, "rescheduling")


class DetailedStateForPromptTests(unittest.TestCase):
    def test_detailed_state_shows_missing_fields(self) -> None:
        state = PatientState()
        prompt = state.detailed_state_for_prompt()
        self.assertIn("NAME: ?", prompt)
        self.assertIn("REASON: ?", prompt)
        self.assertIn("TIME: ?", prompt)

    def test_detailed_state_shows_captured_name(self) -> None:
        state = PatientState(full_name="Sarah Johnson")
        prompt = state.detailed_state_for_prompt()
        self.assertIn("Sarah Johnson", prompt)

    def test_detailed_state_shows_booked_status(self) -> None:
        state = PatientState(
            full_name="Sarah",
            booking_confirmed=True,
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
        )
        prompt = state.detailed_state_for_prompt()
        self.assertIn("BOOKED!", prompt)

    def test_detailed_state_shows_ready_to_book_when_complete(self) -> None:
        state = PatientState(
            full_name="Sarah",
            reason="Cleaning",
            dt_local=datetime(2026, 6, 15, 14, 0, tzinfo=timezone.utc),
            time_status="valid",
            phone_e164="+12125551234",
            phone_confirmed=True,
        )
        prompt = state.detailed_state_for_prompt()
        self.assertIn("READY TO BOOK", prompt)


if __name__ == "__main__":
    unittest.main()
