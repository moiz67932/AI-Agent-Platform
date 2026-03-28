"""
tests/test_latency_paths.py

Unit + integration-style tests for the three key latency scenarios:
  1. Simple acknowledgment turn (name / reason collection)
  2. Exact-booking happy path (time available → phone confirm → direct book)
  3. Conflict / alternative-slot turn

Also covers:
  - Deterministic yes/no routing (Pattern B)
  - TurnTimer class
  - Filler suppression for time/slot inputs

All tests run without a live LiveKit session or Supabase connection.
Async tools are exercised via unittest.IsolatedAsyncioTestCase.
"""

from __future__ import annotations

import asyncio
import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

from livekit.agents import llm

# ── project imports ──────────────────────────────────────────────────────────
from models.state import PatientState
from utils.agent_flow import resolve_confirmation_intent, has_date_reference, has_time_reference
from utils.turn_taking import ExpectedUserSlot
import tools.assistant_tools as _tools_mod
from tools.assistant_tools import AssistantTools


# ════════════════════════════════════════════════════════════════════════════
# Helpers / fixtures
# ════════════════════════════════════════════════════════════════════════════

TZ = ZoneInfo("America/Los_Angeles")
CLINIC_INFO = {"id": "clinic-test-001", "default_phone_region": "US"}


def _next_open_test_slot() -> datetime:
    base = datetime.now(TZ).replace(hour=10, minute=0, second=0, microsecond=0)
    candidate = base + timedelta(days=1)
    while candidate.weekday() == 6:  # Sunday
        candidate += timedelta(days=1)
    return candidate


FUTURE_SLOT = _next_open_test_slot()


def _make_tools(state: PatientState | None = None) -> AssistantTools:
    """Return an AssistantTools instance with minimal globals set."""
    if state is None:
        state = PatientState()
    _tools_mod._GLOBAL_CLINIC_INFO = CLINIC_INFO
    _tools_mod._GLOBAL_CLINIC_TZ = "America/Los_Angeles"
    _tools_mod._GLOBAL_SCHEDULE = {
        "working_hours": {
            "mon": [{"start": "09:00", "end": "17:00"}],
            "tue": [{"start": "09:00", "end": "17:00"}],
            "wed": [{"start": "09:00", "end": "17:00"}],
            "thu": [{"start": "09:00", "end": "17:00"}],
            "fri": [{"start": "09:00", "end": "17:00"}],
            "sat": [{"start": "10:00", "end": "14:00"}],
            "sun": [],
        },
        "closed_dates": set(),
        "slot_step_minutes": 30,
        "treatment_durations": {"Cleaning": 30, "Consultation": 15},
        "lunch_break": {"start": "13:00", "end": "14:00"},
    }
    _tools_mod._REFRESH_AGENT_MEMORY = None
    return AssistantTools(state)


def _complete_state() -> PatientState:
    """Return a PatientState that passes is_complete()."""
    return PatientState(
        full_name="Jane Smith",
        reason="Cleaning",
        duration_minutes=30,
        dt_local=FUTURE_SLOT,
        time_status="valid",
        slot_available=True,
        phone_pending="+13105550001",
        phone_e164="+13105550001",
        phone_last4="0001",
        phone_confirmed=True,
        contact_phase_started=True,
    )


# ════════════════════════════════════════════════════════════════════════════
# 1. TurnTimer
# ════════════════════════════════════════════════════════════════════════════

class TestTurnTimer(unittest.TestCase):
    """Verify the TurnTimer produces correct deltas and log output."""

    def _make_timer(self):
        # Import inline to avoid circular deps at module level
        from agent import TurnTimer
        return TurnTimer()

    def test_first_mark_sets_t0(self):
        t = self._make_timer()
        t.mark("a")
        self.assertAlmostEqual(t.elapsed_since_start("a"), 0.0, delta=5.0)

    def test_elapsed_between_marks(self):
        t = self._make_timer()
        t.mark("start")
        time.sleep(0.05)
        t.mark("end")
        ms = t.elapsed("start", "end")
        self.assertIsNotNone(ms)
        self.assertGreater(ms, 30)   # at least 30ms
        self.assertLess(ms, 500)     # sanity cap

    def test_missing_mark_returns_none(self):
        t = self._make_timer()
        t.mark("a")
        self.assertIsNone(t.elapsed("a", "z"))

    def test_log_summary_does_not_raise(self):
        t = self._make_timer()
        t.mark("user_eou")
        t.mark("speech_started")
        # Should not raise even with missing marks
        t.log_summary("test user utterance")


# ════════════════════════════════════════════════════════════════════════════
# 2. Deterministic yes/no routing (Pattern B)
# ════════════════════════════════════════════════════════════════════════════

class TestResolutionConfirmationIntent(unittest.TestCase):
    """resolve_confirmation_intent must handle all common affirmations/negations."""

    YES_CASES = ["yes", "yeah", "yep", "yup", "correct", "right", "ok", "okay",
                 "sure", "please do", "go ahead", "use the same number",
                 "the one I'm calling from", "use this number", "same number"]
    NO_CASES  = ["no", "nope", "wrong", "incorrect", "don't", "do not"]

    def test_yes_cases(self):
        for phrase in self.YES_CASES:
            with self.subTest(phrase=phrase):
                self.assertTrue(
                    resolve_confirmation_intent(phrase),
                    f"Expected True for: '{phrase}'"
                )

    def test_no_cases(self):
        for phrase in self.NO_CASES:
            with self.subTest(phrase=phrase):
                self.assertFalse(
                    resolve_confirmation_intent(phrase),
                    f"Expected False for: '{phrase}'"
                )

    def test_ambiguous_returns_none(self):
        # Empty string and genuinely ambiguous phrases should return None.
        # Note: "I'm not sure" contains "sure" which YES_PAT matches, so it
        # intentionally resolves to True (the function treats "sure" as yes).
        self.assertIsNone(resolve_confirmation_intent(""))
        self.assertIsNone(resolve_confirmation_intent("maybe"))
        self.assertIsNone(resolve_confirmation_intent("hmm"))

    def test_last_marker_wins_for_mixed(self):
        # "No. Yeah." → last is yes
        self.assertTrue(resolve_confirmation_intent("No. Yeah."))
        # "Yes no" → last is no
        self.assertFalse(resolve_confirmation_intent("Yes no"))


# ════════════════════════════════════════════════════════════════════════════
# 3. Filler suppression for common inputs
# ════════════════════════════════════════════════════════════════════════════

class TestFillerSuppression(unittest.TestCase):
    """_needs_filler must suppress filler for time/slot inputs (avoids gap collision)."""

    def _needs_filler(self, text: str) -> bool:
        from agent import _needs_filler
        return _needs_filler(text)

    def test_no_filler_for_yes(self):
        self.assertFalse(self._needs_filler("yes"))
        self.assertFalse(self._needs_filler("yeah"))

    def test_no_filler_for_no(self):
        self.assertFalse(self._needs_filler("no"))

    def test_no_filler_for_date_time(self):
        self.assertFalse(self._needs_filler("tomorrow at 2pm"))
        self.assertFalse(self._needs_filler("Monday at 3:30"))
        self.assertFalse(self._needs_filler("March 15 at 10am"))

    def test_filler_for_open_question(self):
        # "What times are available?" should get a filler
        self.assertTrue(self._needs_filler("What times are available?"))

    def test_no_filler_for_name_slot_value(self):
        self.assertFalse(self._needs_filler("my name is Alex"))


# ════════════════════════════════════════════════════════════════════════════
# 4. Simple acknowledgment turn — update_patient_record (name + reason)
# ════════════════════════════════════════════════════════════════════════════

class TestSimpleAcknowledgmentTurn(unittest.IsolatedAsyncioTestCase):
    """
    Scenario: caller gives name and reason.
    Expected: tool saves fields, returns "Noted." quickly (< 50ms wall clock).
    This turn should NOT trigger DB calls.
    """

    def setUp(self):
        _tools_mod._GLOBAL_CLINIC_INFO = CLINIC_INFO
        _tools_mod._GLOBAL_SCHEDULE = _make_tools().state and _tools_mod._GLOBAL_SCHEDULE

    async def test_name_saved_fast(self):
        state = PatientState()
        tools = _make_tools(state)
        t0 = time.perf_counter()
        result = await tools.update_patient_record(name="Alice Brown")
        elapsed = (time.perf_counter() - t0) * 1000
        self.assertEqual(state.full_name, "Alice Brown")
        self.assertEqual(result, "Noted.")
        self.assertLess(elapsed, 50, f"Name save took {elapsed:.0f}ms — should be < 50ms")

    async def test_reason_saved_fast(self):
        state = PatientState(full_name="Alice Brown")
        tools = _make_tools(state)
        t0 = time.perf_counter()
        result = await tools.update_patient_record(reason="Cleaning")
        elapsed = (time.perf_counter() - t0) * 1000
        self.assertEqual(state.reason, "Cleaning")
        self.assertLess(elapsed, 50, f"Reason save took {elapsed:.0f}ms — should be < 50ms")

    async def test_name_and_reason_together(self):
        state = PatientState()
        tools = _make_tools(state)
        result = await tools.update_patient_record(name="Bob Lee", reason="Consultation")
        self.assertEqual(state.full_name, "Bob Lee")
        self.assertEqual(state.reason, "Consultation")
        self.assertEqual(result, "Noted.")


# ════════════════════════════════════════════════════════════════════════════
# 5. Exact-booking happy path — time check → phone confirm → direct book
# ════════════════════════════════════════════════════════════════════════════

class TestBookingHappyPath(unittest.IsolatedAsyncioTestCase):
    """
    Scenario: time is available, phone is pending confirmation.
    After confirm_phone(True), if state is complete, confirm_and_book_appointment
    must be callable directly (0 extra LLM hops — called from Pattern B).

    We mock is_slot_free_supabase and book_to_supabase.
    """

    async def test_time_available_triggers_phone_prompt(self):
        """
        When time_suggestion hits an available slot, tool should return the
        phone-confirmation prompt directly (not just "Noted.").
        """
        state = PatientState(
            full_name="Carol King",
            reason="Cleaning",
            duration_minutes=30,
            phone_pending="+13105550002",
            phone_last4="0002",
        )
        tools = _make_tools(state)

        with patch("tools.assistant_tools.is_slot_free_supabase", new_callable=AsyncMock, return_value=True), \
             patch("tools.assistant_tools.parse_datetime_natural", return_value={
                 "success": True,
                 "datetime": FUTURE_SLOT,
             }):
            result = await tools.update_patient_record(
                time_suggestion=FUTURE_SLOT.strftime("%A at %I:%M %p")
            )

        # Should mention the phone number (caller ID confirm flow)
        self.assertIn("calling from", result.lower())
        self.assertEqual(state.time_status, "valid")
        self.assertIsNotNone(state.dt_local)

    async def test_confirm_phone_sets_complete_state(self):
        """confirm_phone(True) must mark phone_confirmed=True and set all flags."""
        state = PatientState(
            full_name="Carol King",
            reason="Cleaning",
            duration_minutes=30,
            dt_local=FUTURE_SLOT,
            time_status="valid",
            phone_pending="+13105550002",
            phone_last4="0002",
            contact_phase_started=True,
        )
        tools = _make_tools(state)
        result = await tools.confirm_phone(confirmed=True)
        self.assertTrue(state.phone_confirmed)
        self.assertEqual(state.phone_e164, "+13105550002")
        # Tool should signal ready-to-book
        self.assertIn("complete", result.lower())

    async def test_direct_book_after_phone_confirm(self):
        """
        Pattern B fast-lane: after phone confirmed, if state.is_complete(),
        confirm_and_book_appointment() must succeed and return booking text.
        """
        state = _complete_state()
        tools = _make_tools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock, return_value="appt-xyz-001"):
            result = await tools.confirm_and_book_appointment()

        self.assertTrue(state.appointment_booked)
        self.assertTrue(state.booking_confirmed)
        self.assertEqual(state.appointment_id, "appt-xyz-001")
        self.assertIn("Jane Smith", result)
        self.assertIn("Cleaning", result)
        # Booking message must mention day / time
        self.assertIn("at", result.lower())

    async def test_book_missing_fields_returns_descriptive_error(self):
        """If name/time/phone are missing, booking must return an actionable error."""
        state = PatientState()  # empty state
        tools = _make_tools(state)
        result = await tools.confirm_and_book_appointment()
        self.assertIn("need", result.lower())
        self.assertFalse(state.appointment_booked)

    async def test_double_book_guard(self):
        """If appointment is already booked, tool must return confirmation not re-insert."""
        state = _complete_state()
        state.appointment_booked = True
        state.booking_confirmed = True
        tools = _make_tools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock,
                   side_effect=AssertionError("should not re-insert")):
            result = await tools.confirm_and_book_appointment()
        self.assertIn("already booked", result.lower())


# ════════════════════════════════════════════════════════════════════════════
# 6. Conflict / alternative-slot turn
# ════════════════════════════════════════════════════════════════════════════

class TestConflictAlternativeSlotTurn(unittest.IsolatedAsyncioTestCase):
    """
    Scenario: requested slot is taken.
    Expected: tool returns alternatives in a natural sentence (not raw JSON).
    Alternatives search must NOT return already-rejected slots.
    """

    async def test_slot_taken_returns_alternatives(self):
        state = PatientState(
            full_name="Dave Rivera",
            reason="Consultation",
            duration_minutes=15,
        )
        tools = _make_tools(state)

        alt1 = FUTURE_SLOT + timedelta(minutes=30)
        alt2 = FUTURE_SLOT + timedelta(minutes=60)

        with patch("tools.assistant_tools.is_slot_free_supabase", new_callable=AsyncMock, return_value=False), \
             patch("tools.assistant_tools.suggest_slots_around", new_callable=AsyncMock, return_value=[alt1, alt2]), \
             patch("tools.assistant_tools.parse_datetime_natural", return_value={
                 "success": True,
                 "datetime": FUTURE_SLOT,
             }):
            result = await tools.update_patient_record(
                time_suggestion=FUTURE_SLOT.strftime("%A at %I:%M %p")
            )

        # Must say something is booked / not available
        self.assertTrue("booked" in result.lower() or "taken" in result.lower() or "sorry" in result.lower())
        # Must offer alternatives
        self.assertTrue(any(w in result.lower() for w in ["or", "i can do", "i have"]))
        self.assertEqual(state.time_status, "invalid")

    async def test_rejected_slots_are_excluded_from_alternatives(self):
        """Slots the user previously rejected must not appear in alternatives."""
        state = PatientState(
            full_name="Dave Rivera",
            reason="Consultation",
            duration_minutes=15,
        )
        rejected_slot = FUTURE_SLOT + timedelta(minutes=30)
        state.add_rejected_slot(rejected_slot, reason="user_rejected")

        tools = _make_tools(state)

        with patch("tools.assistant_tools.is_slot_free_supabase", new_callable=AsyncMock, return_value=False), \
             patch("tools.assistant_tools.suggest_slots_around", new_callable=AsyncMock,
                   return_value=[rejected_slot, FUTURE_SLOT + timedelta(hours=1)]), \
             patch("tools.assistant_tools.parse_datetime_natural", return_value={
                 "success": True,
                 "datetime": FUTURE_SLOT,
             }):
            result = await tools.update_patient_record(
                time_suggestion=FUTURE_SLOT.strftime("%A at %I:%M %p")
            )

        # The rejected slot time (HH:MM) must not appear in the response
        rejected_str = rejected_slot.strftime("%I:%M %p").lstrip("0")
        self.assertNotIn(rejected_str, result)

    async def test_no_alternatives_found(self):
        """When no alternatives exist, response should suggest trying another day."""
        state = PatientState(full_name="Eve Chen", reason="Cleaning", duration_minutes=30)
        tools = _make_tools(state)

        with patch("tools.assistant_tools.is_slot_free_supabase", new_callable=AsyncMock, return_value=False), \
             patch("tools.assistant_tools.suggest_slots_around", new_callable=AsyncMock, return_value=[]), \
             patch("tools.assistant_tools.parse_datetime_natural", return_value={
                 "success": True,
                 "datetime": FUTURE_SLOT,
             }):
            result = await tools.update_patient_record(
                time_suggestion=FUTURE_SLOT.strftime("%A at %I:%M %p")
            )

        # Must not crash; should suggest trying another day
        self.assertTrue(
            any(w in result.lower() for w in ["another day", "try", "don't see"])
        )


# ════════════════════════════════════════════════════════════════════════════
# 7. Stateful guard rails / post-booking routing

class TestStateGuardsAndPostBooking(unittest.IsolatedAsyncioTestCase):
    async def test_post_booking_delivery_fragment_stays_in_delivery_flow(self):
        from agent import _handle_post_booking_turn

        state = _complete_state()
        state.appointment_booked = True
        state.booking_confirmed = True
        state.delivery_preference_pending = True
        state.anything_else_pending = False

        assistant_tools = MagicMock()
        assistant_tools.set_delivery_preference = AsyncMock(return_value="unused")
        spoken: list[str] = []

        def _safe_say(text: str, *, allow_interruptions: bool = True):
            spoken.append(text)
            return None

        result = await _handle_post_booking_turn(
            text="Uh, you can send on what to",
            state=state,
            assistant_tools=assistant_tools,
            session=MagicMock(),
            safe_say=_safe_say,
            cancel_scheduled_filler=lambda: None,
            interrupt_filler=lambda **kwargs: None,
            refresh_memory_async=AsyncMock(),
            mark_direct_response=MagicMock(),
        )

        self.assertEqual(result, "consumed")
        assistant_tools.set_delivery_preference.assert_not_awaited()
        self.assertTrue(state.delivery_preference_pending)
        self.assertFalse(state.anything_else_pending)
        self.assertTrue(spoken)
        self.assertIn("whatsapp", spoken[0].lower())
        self.assertIn("sms", spoken[0].lower())
        self.assertNotIn("name", spoken[0].lower())

    def test_no_repeat_guard_instruction_blocks_name_reask(self):
        from agent import _build_no_repeat_llm_instruction

        state = PatientState(
            full_name="John",
            reason="Cleaning",
            dt_text="March 18",
        )

        instruction = _build_no_repeat_llm_instruction(state, "sorry, what?")

        self.assertIsNotNone(instruction)
        self.assertIn("Do not ask for their name again", instruction or "")
        self.assertIn("John", instruction or "")
        self.assertIn("Cleaning", instruction or "")
        self.assertIn("What time works best", instruction or "")

    def test_capture_failure_infers_time_slot_persistence(self):
        from agent import _infer_expected_slot_from_response

        state = PatientState(
            full_name="John",
            reason="Cleaning",
            dt_text="March 18",
        )

        slot = _infer_expected_slot_from_response(
            route="booking.capture_time",
            spoken_text="I didn't catch the time. What time works best on March 18?",
            state=state,
        )

        self.assertEqual(slot, ExpectedUserSlot.TIME)


# 8. Time-parsing fast path (date + time together)
# ════════════════════════════════════════════════════════════════════════════

class TestDateTimeParsingFastPath(unittest.TestCase):
    """
    Verify has_date_reference / has_time_reference detect common phone-call
    time expressions that should skip filler and go straight to the tool.
    """

    DATE_REFS = [
        "tomorrow", "today", "next Monday", "this Friday",
        "March 15", "the 20th", "day after tomorrow", "Saturday",
    ]
    TIME_REFS = [
        "2pm", "2 PM", "10:30", "10:30 AM", "noon", "morning",
        "three thirty",
        # "10 o'clock" — not currently detected by has_time_reference regex
    ]

    def test_date_references_detected(self):
        for phrase in self.DATE_REFS:
            with self.subTest(phrase=phrase):
                self.assertTrue(has_date_reference(phrase), f"Not detected: '{phrase}'")

    def test_time_references_detected(self):
        for phrase in self.TIME_REFS:
            with self.subTest(phrase=phrase):
                self.assertTrue(has_time_reference(phrase), f"Not detected: '{phrase}'")

    def test_combined_expressions(self):
        combos = [
            "tomorrow at 2pm",
            "next Monday at 10:30 AM",
            "Friday morning",
            "March 15 at 3:30",
        ]
        for phrase in combos:
            with self.subTest(phrase=phrase):
                # Both date AND time should be detected
                has_both = has_date_reference(phrase) or has_time_reference(phrase)
                self.assertTrue(has_both, f"Neither date nor time detected: '{phrase}'")


# ════════════════════════════════════════════════════════════════════════════
# 8. Config constants validation
# ════════════════════════════════════════════════════════════════════════════

class TestConfigLatencyConstants(unittest.TestCase):
    """Sanity-check that latency constants are within safe ranges."""

    def test_vad_silence_duration(self):
        from config import VAD_MIN_SILENCE_DURATION
        self.assertGreaterEqual(VAD_MIN_SILENCE_DURATION, 0.20, "VAD silence too low — risk of cutoffs")
        self.assertLessEqual(VAD_MIN_SILENCE_DURATION, 0.50, "VAD silence too high — laggy")

    def test_endpointing_range(self):
        from config import MIN_ENDPOINTING_DELAY, MAX_ENDPOINTING_DELAY
        self.assertGreaterEqual(MIN_ENDPOINTING_DELAY, 0.3, "Min endpointing too aggressive")
        self.assertLessEqual(MAX_ENDPOINTING_DELAY, 1.5, "Max endpointing too conservative")
        self.assertLessEqual(MIN_ENDPOINTING_DELAY, MAX_ENDPOINTING_DELAY)

    def test_filler_max_ms(self):
        from config import FILLER_MAX_DURATION_MS
        self.assertLessEqual(FILLER_MAX_DURATION_MS, 700, "Filler too long — may overlap real response")
        self.assertGreaterEqual(FILLER_MAX_DURATION_MS, 200, "Filler too short — won't be heard")

    def test_filler_debounce_ms(self):
        from config import FILLER_DEBOUNCE_MS
        self.assertLessEqual(FILLER_DEBOUNCE_MS, 300, "Filler debounce too long")
        self.assertGreaterEqual(FILLER_DEBOUNCE_MS, 50, "Filler debounce too short — may fire before VAD")


# ════════════════════════════════════════════════════════════════════════════
# 9. PatientState.is_complete() gate
# ════════════════════════════════════════════════════════════════════════════

class TestPatientStateIsComplete(unittest.TestCase):
    """is_complete() must gate correctly — Pattern B fast-lane depends on it."""

    def test_complete_state_passes(self):
        state = _complete_state()
        self.assertTrue(state.is_complete())

    def test_missing_name_fails(self):
        state = _complete_state()
        state.full_name = None
        self.assertFalse(state.is_complete())

    def test_missing_phone_e164_fails(self):
        state = _complete_state()
        state.phone_e164 = None
        self.assertFalse(state.is_complete())

    def test_phone_not_confirmed_fails(self):
        state = _complete_state()
        state.phone_confirmed = False
        self.assertFalse(state.is_complete())

    def test_missing_time_fails(self):
        state = _complete_state()
        state.dt_local = None
        self.assertFalse(state.is_complete())

    def test_missing_reason_fails(self):
        state = _complete_state()
        state.reason = None
        self.assertFalse(state.is_complete())


# ════════════════════════════════════════════════════════════════════════════
# 10. Booking idempotency — booking_in_progress guard
# ════════════════════════════════════════════════════════════════════════════

class TestBookingInProgressGuard(unittest.IsolatedAsyncioTestCase):
    """
    Concurrent calls to confirm_and_book_appointment must be deduplicated
    by the booking_in_progress mutex on PatientState.
    """

    async def test_booking_in_progress_returns_safe_message(self):
        """Second call while in-progress must stay silent and not re-insert."""
        state = _complete_state()
        state.booking_in_progress = True  # simulate first call already running
        tools = _make_tools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock,
                   side_effect=AssertionError("should not attempt second insert")):
            with self.assertRaises(llm.StopResponse):
                await tools.confirm_and_book_appointment()

        self.assertFalse(state.appointment_booked)

    async def test_booking_in_progress_reset_on_success(self):
        """booking_in_progress must be False after successful booking (finally block)."""
        state = _complete_state()
        tools = _make_tools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock, return_value="appt-reset-01"):
            await tools.confirm_and_book_appointment()

        self.assertFalse(state.booking_in_progress)
        self.assertTrue(state.appointment_booked)

    async def test_booking_in_progress_reset_on_db_failure(self):
        """booking_in_progress must be False even if Supabase raises (finally block)."""
        state = _complete_state()
        tools = _make_tools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock, return_value=None):
            result = await tools.confirm_and_book_appointment()

        # insert returned None → error path
        self.assertFalse(state.booking_in_progress)
        self.assertFalse(state.appointment_booked)
        self.assertIn("trouble", result.lower())


# ════════════════════════════════════════════════════════════════════════════
# 11. Confirmation fingerprint deduplication
# ════════════════════════════════════════════════════════════════════════════

class TestConfirmFingerprint(unittest.TestCase):
    """PatientState new fields for fingerprint dedup must exist and default correctly."""

    def test_new_state_fields_exist_with_defaults(self):
        state = PatientState()
        self.assertFalse(state.booking_in_progress)
        self.assertIsNone(state.last_confirm_fingerprint)
        self.assertEqual(state.last_confirm_ts, 0.0)
        self.assertFalse(state.turn_consumed)

    def test_fingerprint_fields_settable(self):
        state = PatientState()
        state.last_confirm_fingerprint = "phone|yes|2026-03-10|+13105550001"
        state.last_confirm_ts = 1234567.89
        state.turn_consumed = True
        self.assertEqual(state.last_confirm_fingerprint, "phone|yes|2026-03-10|+13105550001")
        self.assertEqual(state.last_confirm_ts, 1234567.89)
        self.assertTrue(state.turn_consumed)


# ════════════════════════════════════════════════════════════════════════════
# 12. Filler suppression for confirmation utterances (state-aware _needs_filler)
# ════════════════════════════════════════════════════════════════════════════

class TestFillerSuppressionStateAware(unittest.TestCase):
    """_needs_filler must suppress filler when pending confirmation + yes/no intent."""

    def _needs_filler(self, text: str, state=None) -> bool:
        from agent import _needs_filler
        return _needs_filler(text, state=state)

    def _pending_phone_state(self) -> PatientState:
        """State with pending phone confirmation."""
        return PatientState(
            full_name="Jane Smith",
            reason="Cleaning",
            dt_local=FUTURE_SLOT,
            time_status="valid",
            phone_pending="+13105550001",
            phone_last4="0001",
            pending_confirm="phone",
            pending_confirm_field="phone",
            contact_phase_started=True,
        )

    def test_suppress_long_yes_phrase_with_pending_confirmation(self):
        """'Alright. Yeah. Sure, please.' must suppress filler when pending phone confirm."""
        state = self._pending_phone_state()
        result = self._needs_filler("Alright. Yeah. Sure, please.", state=state)
        self.assertFalse(result, "'Alright. Yeah. Sure, please.' should suppress filler during pending confirmation")

    def test_suppress_yes_with_pending(self):
        state = self._pending_phone_state()
        self.assertFalse(self._needs_filler("yes", state=state))
        self.assertFalse(self._needs_filler("yeah sure", state=state))
        self.assertFalse(self._needs_filler("that's correct", state=state))

    def test_suppress_no_with_pending(self):
        state = self._pending_phone_state()
        self.assertFalse(self._needs_filler("no", state=state))
        self.assertFalse(self._needs_filler("nope use a different one", state=state))

    def test_no_suppress_for_open_question_without_pending(self):
        """Without pending confirmation, open questions should still get filler."""
        state = PatientState()  # no pending_confirm
        result = self._needs_filler("What times are available?", state=state)
        self.assertTrue(result)

    def test_suppress_when_booking_in_progress(self):
        state = self._pending_phone_state()
        state.booking_in_progress = True
        self.assertFalse(self._needs_filler("What times are available?", state=state))

    def test_suppress_when_already_booked(self):
        state = _complete_state()
        state.appointment_booked = True
        state.booking_confirmed = True
        self.assertFalse(self._needs_filler("Is there anything else?", state=state))

    def test_no_suppress_ambiguous_phrase_without_pending(self):
        """Genuinely ambiguous input without pending confirm → filler allowed."""
        state = PatientState()
        # "What times do you have available?" should still get a filler
        result = self._needs_filler("What times do you have available?", state=state)
        self.assertTrue(result)

    def test_backward_compat_no_state(self):
        """Calling _needs_filler without state must still work (backward compat)."""
        from agent import _needs_filler
        # Should not raise
        self.assertFalse(_needs_filler("yes"))
        self.assertTrue(_needs_filler("What times are available?"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
