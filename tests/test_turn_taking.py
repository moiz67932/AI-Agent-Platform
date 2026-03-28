import unittest

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


if __name__ == "__main__":
    unittest.main()
