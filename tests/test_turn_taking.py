import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from models.state import PatientState
from utils.turn_taking import (
    CompletionLabel,
    ExpectedUserSlot,
    PolicyAction,
    StreamingTurnTracker,
    TurnTakingConfig,
    build_policy_decision,
    format_policy_log,
    format_tracker_log,
    preview_turn,
)


class TurnTakingPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = TurnTakingConfig(
            short_pause_ms=900,
            continuation_wait_ms=650,
            low_confidence_threshold=0.6,
            deterministic_fast_path_enabled=True,
            lookup_filler_delay_ms=260,
            expected_slot_continuation_wait_ms=850,
            expected_slot_weak_fragment_max_tokens=8,
            expected_slot_enable_date_time_fast_path=True,
        )

    def test_mid_thought_self_intro_pause_waits_then_fast_paths_booking(self) -> None:
        state = PatientState()
        tracker = StreamingTurnTracker(self.config)
        tracker.start_new_turn()

        first = tracker.ingest_transcript(
            "Hello. This is",
            is_final=True,
            patient_state=state,
            silence_ms=250,
        )
        first_decision = build_policy_decision(first, state, self.config)

        self.assertEqual(first.completion_label, CompletionLabel.LIKELY_CONTINUING)
        self.assertEqual(first_decision.action, PolicyAction.WAIT)
        self.assertIsNone(first_decision.filler_text)
        self.assertIn("pattern:self_intro_prefix", first.completion_reasons)

        second = tracker.ingest_transcript(
            "John. I wanted to book a teeth whitening appointment.",
            is_final=True,
            patient_state=state,
            silence_ms=650,
        )
        second_decision = build_policy_decision(second, state, self.config)

        self.assertEqual(second.completion_label, CompletionLabel.COMPLETE_AND_ACTIONABLE)
        self.assertEqual(second_decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(second.caller_name, "John")
        self.assertEqual(second.service, "Teeth whitening")
        self.assertIn("What day and time would you like", second_decision.response_text or "")
        self.assertIn("John", second_decision.response_text or "")

    def test_booking_with_service_only_asks_for_date_and_time(self) -> None:
        snapshot, decision = preview_turn(
            "I want to book a cleaning.",
            config=self.config,
        )

        self.assertEqual(snapshot.service, "Cleaning")
        self.assertEqual(snapshot.completion_label, CompletionLabel.COMPLETE_AND_ACTIONABLE)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(
            decision.response_text,
            "Sure. What day and time would you like for your cleaning appointment?",
        )

    def test_booking_with_service_and_date_only_asks_for_time(self) -> None:
        snapshot, decision = preview_turn(
            "I want to book a cleaning tomorrow.",
            config=self.config,
        )

        self.assertEqual(snapshot.service, "Cleaning")
        self.assertEqual(snapshot.preferred_date, "tomorrow")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(
            decision.response_text,
            "Sure. What time works best for your cleaning appointment?",
        )

    def test_ambiguous_issue_gets_safe_clarification(self) -> None:
        snapshot, decision = preview_turn(
            "I need to come in for something with my tooth.",
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "general_issue")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(
            decision.response_text,
            "Sure. Can you tell me a little more about the issue?",
        )

    def test_lookup_question_routes_to_backend_lookup_with_bridge(self) -> None:
        state = PatientState(phone_pending="+13105551234", phone_last4="1234")
        snapshot, decision = preview_turn(
            "Do I already have an appointment next week?",
            patient_state=state,
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "appointment_lookup")
        self.assertEqual(decision.action, PolicyAction.LOOKUP)
        self.assertEqual(decision.lookup_tool, "find_existing_appointment")
        self.assertEqual(decision.filler_text, "Let me check that for you.")

    def test_pricing_question_routes_to_clinic_info_answer(self) -> None:
        state = PatientState(reason="Teeth whitening")
        snapshot, decision = preview_turn(
            "Can I get to know the pricing of teeth whitening?",
            patient_state=state,
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "clinic_info")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "clinic_info.answer")

    def test_service_list_filler_does_not_reuse_stale_service(self) -> None:
        state = PatientState(reason="Teeth whitening")
        snapshot, decision = preview_turn(
            "Can you tell me the list of services that you provide?",
            patient_state=state,
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "clinic_info")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.filler_text, "Sure, let me pull the services we offer for you.")

    def test_pricing_fragment_routes_to_clinic_info_answer(self) -> None:
        state = PatientState(reason="Teeth whitening")
        snapshot, decision = preview_turn(
            "I want to know the price of the whitening.",
            patient_state=state,
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "clinic_info")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "clinic_info.answer")

    def test_duplicate_ack_is_suppressed_after_filler(self) -> None:
        snapshot, decision = preview_turn(
            "I want to book a cleaning.",
            filler_spoken=True,
            config=self.config,
        )

        self.assertTrue(snapshot.filler_spoken_for_turn)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(
            decision.response_text,
            "What day and time would you like for your cleaning appointment?",
        )

    def test_expected_date_time_slot_weak_fragment_waits_without_repeating_question(self) -> None:
        state = PatientState(full_name="John", reason="Teeth whitening")
        tracker = StreamingTurnTracker(self.config)
        tracker.start_new_turn()
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)

        snapshot = tracker.ingest_transcript(
            "I would like to book it",
            is_final=True,
            patient_state=state,
            silence_ms=900,
        )
        decision = build_policy_decision(snapshot, state, self.config)

        self.assertEqual(snapshot.expected_user_slot, "date_time")
        self.assertEqual(snapshot.expected_slot_status, "unsatisfied")
        self.assertEqual(snapshot.completion_label, CompletionLabel.LIKELY_CONTINUING)
        self.assertEqual(decision.action, PolicyAction.WAIT)
        self.assertNotEqual(decision.deterministic_route, "booking.ask_date_time")
        self.assertIn("expected_slot_unsatisfied", snapshot.completion_reasons)

    def test_expected_service_slot_service_only_answer_advances_booking(self) -> None:
        state = PatientState(full_name="John")
        snapshot, decision = preview_turn(
            "teeth whitening",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.SERVICE.value,
            config=self.config,
        )

        self.assertEqual(snapshot.service, "Teeth whitening")
        self.assertEqual(snapshot.expected_slot_status, "satisfied")
        self.assertEqual(snapshot.completion_label, CompletionLabel.COMPLETE_AND_ACTIONABLE)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.ask_date_time")
        self.assertIn("What day and time would you like", decision.response_text or "")

    def test_expected_name_slot_accepts_short_name_despite_existing_booking_context(self) -> None:
        state = PatientState(
            reason="Teeth whitening",
            dt_local=datetime(2026, 4, 3, 15, 0, tzinfo=ZoneInfo("America/New_York")),
            dt_text="tomorrow at 3pm",
        )
        snapshot, decision = preview_turn(
            "Max",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.NAME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.expected_slot_status, "satisfied")
        self.assertEqual(snapshot.completion_label, CompletionLabel.COMPLETE_AND_ACTIONABLE)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_name")
        self.assertTrue("slot:name_captured" in snapshot.completion_reasons or snapshot.caller_name == "Max")

    def test_expected_date_time_slot_hesitation_fragment_waits(self) -> None:
        state = PatientState(full_name="John", reason="Cleaning")
        tracker = StreamingTurnTracker(self.config)
        tracker.start_new_turn()
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)

        snapshot = tracker.ingest_transcript(
            "Um, I would like to book it on",
            is_final=True,
            patient_state=state,
            silence_ms=900,
        )
        decision = build_policy_decision(snapshot, state, self.config)

        self.assertEqual(snapshot.expected_slot_status, "unsatisfied")
        self.assertEqual(snapshot.completion_label, CompletionLabel.LIKELY_CONTINUING)
        self.assertEqual(decision.action, PolicyAction.WAIT)
        self.assertIsNone(decision.deterministic_route)

    def test_partial_date_with_dangling_at_waits_then_reasks_time(self) -> None:
        state = PatientState(full_name="John", reason="Cleaning")
        snapshot, decision = preview_turn(
            "eighteenth of March at",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.DATE_TIME.value,
            config=self.config,
        )
        after_wait = build_policy_decision(
            snapshot,
            state,
            self.config,
            after_continuation_wait=True,
        )

        self.assertEqual(snapshot.expected_slot_status, "partial_date")
        self.assertEqual(snapshot.completion_label, CompletionLabel.LIKELY_CONTINUING)
        self.assertEqual(decision.action, PolicyAction.WAIT)
        self.assertEqual(after_wait.action, PolicyAction.FAST_PATH)
        self.assertEqual(after_wait.deterministic_route, "booking.reask_time")
        self.assertIn("What time works best", after_wait.response_text or "")

    def test_expected_date_time_slot_full_answer_routes_to_capture_datetime(self) -> None:
        state = PatientState(full_name="John", reason="Teeth whitening")
        snapshot, decision = preview_turn(
            "tomorrow at ten fifteen AM",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.DATE_TIME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.expected_slot_status, "satisfied")
        self.assertEqual(snapshot.completion_label, CompletionLabel.COMPLETE_AND_ACTIONABLE)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_datetime")

    def test_expected_date_time_slot_month_phrase_does_not_fall_back_to_ask_time(self) -> None:
        state = PatientState(full_name="John", reason="Teeth whitening")
        snapshot, decision = preview_turn(
            "Um, I would like to book it on seventeenth of March at two PM.",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.DATE_TIME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.expected_slot_status, "satisfied")
        self.assertEqual(snapshot.preferred_time, None)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_datetime")

    def test_expected_date_time_slot_date_only_answer_routes_to_capture_date(self) -> None:
        state = PatientState(reason="Cleaning")
        snapshot, decision = preview_turn(
            "tomorrow",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.DATE_TIME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.expected_slot_status, "partial_date")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_date")

    def test_expected_time_slot_time_only_answer_routes_to_capture_time(self) -> None:
        state = PatientState(reason="Cleaning", dt_text="tomorrow")
        snapshot, decision = preview_turn(
            "10:15 AM",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.TIME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.expected_slot_status, "satisfied")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_time")

    def test_clinic_info_interrupts_expected_time_slot(self) -> None:
        state = PatientState(reason="Teeth whitening", dt_text="Friday, April 03")
        snapshot, decision = preview_turn(
            "I don't want to book. I just want the pricing for teeth whitening.",
            patient_state=state,
            expected_user_slot=ExpectedUserSlot.TIME.value,
            config=self.config,
        )

        self.assertEqual(snapshot.intent, "clinic_info")
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "clinic_info.answer")

    def test_low_confidence_text_falls_back_to_llm(self) -> None:
        snapshot, decision = preview_turn(
            "Maybe later.",
            config=self.config,
        )

        self.assertEqual(decision.action, PolicyAction.LLM)
        self.assertIsNone(decision.deterministic_route)
        self.assertEqual(snapshot.intent, None)

    def test_log_formatters_include_classifier_and_policy_fields(self) -> None:
        snapshot, decision = preview_turn(
            "I want to book a cleaning.",
            config=self.config,
        )

        tracker_log = format_tracker_log(snapshot)
        policy_log = format_policy_log(decision)

        self.assertIn("intent=booking", tracker_log)
        self.assertIn("service=Cleaning", tracker_log)
        self.assertIn("action=fast_path", policy_log)
        self.assertIn("policy:deterministic_fast_path", policy_log)
        self.assertIn("expected_slot=", tracker_log)


class NameSlotTests(unittest.TestCase):
    """Bug: bare-name reply after agent asks 'What name should I put on the appointment?' was not captured."""

    def setUp(self) -> None:
        self.config = TurnTakingConfig(
            short_pause_ms=900,
            continuation_wait_ms=650,
            low_confidence_threshold=0.6,
            deterministic_fast_path_enabled=True,
            expected_slot_enable_date_time_fast_path=True,
        )

    def _tracker_with_name_slot(self) -> StreamingTurnTracker:
        tracker = StreamingTurnTracker(self.config)
        tracker.set_expected_user_slot(ExpectedUserSlot.NAME)
        return tracker

    def test_bare_name_satisfies_name_slot(self) -> None:
        tracker = self._tracker_with_name_slot()
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("John", is_final=True, patient_state=PatientState(), silence_ms=1200)
        self.assertEqual(snap.expected_slot_status, "satisfied")
        decision = build_policy_decision(snap, PatientState(), self.config)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_name")

    def test_two_word_name_satisfies_name_slot(self) -> None:
        tracker = self._tracker_with_name_slot()
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("John Smith", is_final=True, patient_state=PatientState(), silence_ms=1200)
        self.assertEqual(snap.expected_slot_status, "satisfied")

    def test_name_slot_unsatisfied_for_date_text(self) -> None:
        tracker = self._tracker_with_name_slot()
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("tomorrow", is_final=True, patient_state=PatientState(), silence_ms=1200)
        # "tomorrow" has a date reference — should NOT satisfy the name slot
        self.assertEqual(snap.expected_slot_status, "unsatisfied")

    def test_name_slot_cleared_after_no_name_slot_set(self) -> None:
        tracker = StreamingTurnTracker(self.config)
        self.assertIsNone(tracker.expected_user_slot)
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("John", is_final=True, patient_state=PatientState(), silence_ms=1200)
        # No expected slot → should NOT get capture_name fast-path
        decision = build_policy_decision(snap, PatientState(), self.config)
        self.assertNotEqual(decision.deterministic_route, "booking.capture_name")


class TimeReferenceRegressionTests(unittest.TestCase):
    """Bug: 'At 2 p.m.' and '2 p.m' were not detected as time references."""

    def test_at_2_pm_dotted_detected(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertTrue(has_time_reference("At 2 p.m."))

    def test_2_pm_no_trailing_dot_detected(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertTrue(has_time_reference("2 p.m"))

    def test_2_pm_plain_detected(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertTrue(has_time_reference("2pm"))

    def test_at_2pm_detected(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertTrue(has_time_reference("at 2pm"))

    def test_wednesday_not_time(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertFalse(has_time_reference("Wednesday"))

    def test_john_not_time(self) -> None:
        from utils.agent_flow import has_time_reference
        self.assertFalse(has_time_reference("John"))

    def test_at_2pm_satisfies_time_slot(self) -> None:
        """After fix, 'at 2pm' should satisfy expected_slot=TIME rather than wait as continuation."""
        config = TurnTakingConfig(
            short_pause_ms=900,
            continuation_wait_ms=650,
            low_confidence_threshold=0.6,
            deterministic_fast_path_enabled=True,
            expected_slot_enable_date_time_fast_path=True,
        )
        tracker = StreamingTurnTracker(config)
        tracker.set_expected_user_slot(ExpectedUserSlot.TIME)
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("At 2 p.m.", is_final=True, patient_state=PatientState(), silence_ms=1200)
        self.assertEqual(snap.expected_slot_status, "satisfied")
        decision = build_policy_decision(snap, PatientState(), config)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_time")

    def test_2pm_dotted_satisfies_time_slot(self) -> None:
        config = TurnTakingConfig(
            short_pause_ms=900,
            continuation_wait_ms=650,
            low_confidence_threshold=0.6,
            deterministic_fast_path_enabled=True,
            expected_slot_enable_date_time_fast_path=True,
        )
        tracker = StreamingTurnTracker(config)
        tracker.set_expected_user_slot(ExpectedUserSlot.TIME)
        tracker.start_new_turn()
        snap = tracker.ingest_transcript("2 p.m", is_final=True, patient_state=PatientState(), silence_ms=1200)
        self.assertEqual(snap.expected_slot_status, "satisfied")


class ConflictAfterSlotTests(unittest.TestCase):
    """Bug: After 'We are closed on Wednesdays. Would you like to try another time?'
    expected_slot was cleared, then 'this Thursday at 2pm' had no fast-path.
    """

    def setUp(self) -> None:
        self.config = TurnTakingConfig(
            short_pause_ms=900,
            continuation_wait_ms=650,
            low_confidence_threshold=0.6,
            deterministic_fast_path_enabled=True,
            expected_slot_enable_date_time_fast_path=True,
        )

    def test_thursday_at_2pm_satisfies_date_time_slot(self) -> None:
        tracker = StreamingTurnTracker(self.config)
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)
        tracker.start_new_turn()
        snap = tracker.ingest_transcript(
            "Then do it on this Thursday at 2pm",
            is_final=True,
            patient_state=PatientState(),
            silence_ms=1200,
        )
        self.assertEqual(snap.expected_slot_status, "satisfied")
        decision = build_policy_decision(snap, PatientState(), self.config)
        self.assertEqual(decision.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision.deterministic_route, "booking.capture_datetime")

    def test_time_only_follow_up_with_date_context_in_state(self) -> None:
        """'At 2 p.m.' after date context exists in state → partial_time or satisfied for DATE_TIME."""
        from datetime import datetime
        from zoneinfo import ZoneInfo
        state = PatientState()
        state.dt_text = "this Thursday"
        # No dt_local yet — date referenced but time not resolved

        tracker = StreamingTurnTracker(self.config)
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)
        tracker.start_new_turn()
        snap = tracker.ingest_transcript(
            "At 2 p.m.",
            is_final=True,
            patient_state=state,
            silence_ms=1200,
        )
        # has_time=True, has_date=False, _state_has_date=True → partial_time
        self.assertIn(snap.expected_slot_status, {"partial_time", "satisfied"})
        decision = build_policy_decision(snap, state, self.config)
        self.assertIn(decision.deterministic_route, {"booking.capture_time", "booking.capture_datetime"})

    def test_full_booking_flow_with_conflict_and_alternative(self) -> None:
        """Simulates: book → conflict on Wednesday → rebook Thursday at 2pm."""
        tracker = StreamingTurnTracker(self.config)
        state = PatientState()
        state.reason = "Teeth whitening"

        # Turn 1: user books with Wednesday
        tracker.start_new_turn()
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)
        snap1 = tracker.ingest_transcript(
            "Do it tomorrow at 2pm", is_final=True, patient_state=state, silence_ms=1200
        )
        self.assertEqual(snap1.expected_slot_status, "satisfied")

        # Simulate: agent responds with conflict → sets DATE_TIME expected slot
        # (The real code does this via _infer_expected_slot_from_response)
        tracker.set_expected_user_slot(ExpectedUserSlot.DATE_TIME)

        # Turn 2: user gives new slot
        tracker.start_new_turn()
        snap2 = tracker.ingest_transcript(
            "Then do it on this Thursday at 2pm", is_final=True, patient_state=state, silence_ms=1200
        )
        self.assertEqual(snap2.expected_slot_status, "satisfied")
        decision2 = build_policy_decision(snap2, state, self.config)
        self.assertEqual(decision2.action, PolicyAction.FAST_PATH)
        self.assertEqual(decision2.deterministic_route, "booking.capture_datetime")


if __name__ == "__main__":
    unittest.main()
