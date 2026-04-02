import unittest
from datetime import date, datetime
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from models.state import PatientState
from tools import assistant_tools as assistant_tools_module
from tools.assistant_tools import (
    AssistantTools,
    _phone_confirmation_question,
    prune_clinic_response_for_tts,
)


class AssistantToolsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        assistant_tools_module._GLOBAL_CLINIC_INFO = {
            "id": "clinic-123",
            "default_phone_region": "US",
        }
        assistant_tools_module._GLOBAL_SCHEDULE = {"working_hours": {}}
        assistant_tools_module._REFRESH_AGENT_MEMORY = None

    async def test_update_patient_record_returns_noted_for_new_name(self) -> None:
        state = PatientState()
        tools = AssistantTools(state)

        result = await tools.update_patient_record(name="john doe")

        self.assertEqual(result, "Noted.")
        self.assertEqual(state.full_name, "John Doe")

    async def test_update_patient_record_skips_redundant_name_and_reason(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Teeth whitening",
            duration_minutes=60,
        )
        tools = AssistantTools(state)

        with patch(
            "tools.assistant_tools.get_duration_for_service",
            side_effect=AssertionError("redundant reason should not be reprocessed"),
        ):
            result = await tools.update_patient_record(
                name="john doe",
                reason="teeth whitening",
            )

        self.assertEqual(result, "Noted.")
        self.assertEqual(state.full_name, "John Doe")
        self.assertEqual(state.reason, "Teeth whitening")
        self.assertEqual(state.duration_minutes, 60)

    async def test_update_patient_record_ignores_unsupported_name_overwrite(self) -> None:
        state = PatientState(full_name="John Abraham", last_user_text="Yes. You sure?")
        tools = AssistantTools(state)

        result = await tools.update_patient_record(name="Sarah")

        self.assertEqual(result, "Noted.")
        self.assertEqual(state.full_name, "John Abraham")

    async def test_confirm_phone_signals_booking_when_everything_else_is_ready(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Cleaning",
            dt_local=datetime(2026, 3, 10, 15, 30),
            time_status="valid",
            phone_pending="+13105551234",
            phone_last4="1234",
        )
        tools = AssistantTools(state)

        result = await tools.confirm_phone(confirmed=True)

        self.assertEqual(result, "Phone saved. All info complete. Book now.")
        self.assertTrue(state.phone_confirmed)
        self.assertEqual(state.phone_e164, "+13105551234")

    async def test_update_patient_record_applies_duration_alias_for_detoxing_appointment(self) -> None:
        state = PatientState()
        tools = AssistantTools(state)

        result = await tools.update_patient_record(reason="Detoxing appointment")

        self.assertEqual(result, "Noted.")
        self.assertEqual(state.reason, "Detoxing appointment")
        self.assertEqual(state.duration_minutes, 60)

    def test_phone_confirmation_question_mentions_confirmations_and_reminders_for_caller_id(self) -> None:
        state = PatientState(phone_source="sip")

        question = _phone_confirmation_question(state, "+13105551234")

        self.assertEqual(
            question,
            "Can I use the number you're calling from for your appointment confirmation and reminders?",
        )

    def test_phone_confirmation_question_for_spoken_number_avoids_repeating_digits(self) -> None:
        state = PatientState(phone_source="user_spoken", phone_last4="1234")

        question = _phone_confirmation_question(state, "+13105551234")

        self.assertEqual(question, "Is this the right number to send your confirmation to?")

    def test_tool_descriptions_steer_time_updates_away_from_slot_search(self) -> None:
        update_desc = AssistantTools.update_patient_record.info.description
        slots_desc = AssistantTools.get_available_slots_v2.info.description

        # Case-insensitive: description says "Checks availability automatically"
        self.assertIn("checks availability automatically", update_desc.lower())
        # Description says "Do NOT use when patient gives a specific date/time"
        self.assertTrue(
            "do not use" in slots_desc.lower() or "do not" in slots_desc.lower(),
            f"Expected slot search tool to discourage use when time given, got: {slots_desc!r}"
        )

    async def test_update_patient_record_date_only_requests_time(self) -> None:
        state = PatientState(reason="Cleaning", duration_minutes=30)
        tools = AssistantTools(state)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"date_only": True, "parsed_date": date(2026, 3, 14)},
        ):
            result = await tools.update_patient_record(time_suggestion="tomorrow")

        self.assertIn("What time works best for you?", result)
        self.assertEqual(state.dt_text, "tomorrow")
        self.assertEqual(state.time_status, "pending")

    async def test_update_patient_record_full_datetime_available_prompts_for_phone_confirmation(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Teeth whitening",
            duration_minutes=60,
            detected_phone="+13105551234",
            phone_last4="1234",
            phone_source="sip",
        )
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-123", "default_phone_region": "US"},
            schedule={"working_hours": {}},
        )
        parsed_dt = datetime(2026, 3, 14, 10, 15, tzinfo=ZoneInfo("America/New_York"))

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
            result = await tools.update_patient_record(time_suggestion="tomorrow at ten fifteen AM")

        self.assertIn("Can I use the number you're calling from", result)
        self.assertEqual(state.pending_confirm, "phone")
        self.assertTrue(state.slot_available)
        self.assertEqual(state.dt_local, parsed_dt)

    async def test_update_patient_record_time_only_uses_known_date_context(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Cleaning",
            duration_minutes=30,
            dt_text="March 18",
        )
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-123", "default_phone_region": "US"},
            schedule={"working_hours": {}},
        )
        parsed_dt = datetime(2026, 3, 18, 13, 0, tzinfo=ZoneInfo("America/New_York"))

        def _parse_side_effect(text: str, tz_hint: str | None = None):
            normalized = " ".join(text.lower().split())
            if "march 18" in normalized and "one pm" in normalized:
                return {"datetime": parsed_dt}
            return {
                "datetime": None,
                "needs_clarification": True,
                "clarification_type": "missing_day",
                "message": "String does not contain a date: at one pm.",
            }

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            side_effect=_parse_side_effect,
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=True),
        ):
            result = await tools.update_patient_record(time_suggestion="At one PM.")

        self.assertEqual(state.dt_local, parsed_dt)
        self.assertIn("March 18", state.dt_text or "")
        self.assertNotIn("didn't catch", result.lower())

    async def test_unavailable_time_with_alternatives_preserves_date_only_context(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Teeth whitening",
            duration_minutes=60,
        )
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-123", "default_phone_region": "US"},
            schedule={"working_hours": {}},
        )
        requested_dt = datetime(2026, 3, 20, 21, 0, tzinfo=ZoneInfo("America/New_York"))
        alternatives = [
            datetime(2026, 3, 20, 9, 0, tzinfo=ZoneInfo("America/New_York")),
            datetime(2026, 3, 20, 9, 15, tzinfo=ZoneInfo("America/New_York")),
        ]

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={"datetime": requested_dt},
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(
                False,
                "We close at 5:00 PM on Fridays, so a 60-minute appointment can't start at 9:00 PM.",
            ),
        ), patch(
            "tools.assistant_tools.get_next_available_slots",
            new=AsyncMock(return_value=alternatives),
        ):
            result = await tools.update_patient_record(time_suggestion="tomorrow at nine PM")

        self.assertIn("9:00 AM", result)
        self.assertIn("9:15 AM", result)
        self.assertEqual(state.dt_text, "Friday, March 20")
        self.assertEqual(state.time_status, "invalid")
        self.assertIsNone(state.dt_local)

    async def test_time_only_follow_up_after_alternative_prompt_ignores_stale_rejected_time(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Teeth whitening",
            duration_minutes=60,
            dt_text="Friday, March 20",
            time_status="invalid",
        )
        state.recent_user_texts = [
            "I would like to book it tomorrow at nine PM.",
            "Nine AM. Sorry.",
            "Nine AM.",
        ]
        tools = AssistantTools(
            state,
            clinic_info={"id": "clinic-123", "default_phone_region": "US"},
            schedule={"working_hours": {}},
        )
        parsed_dt = datetime(2026, 3, 20, 9, 0, tzinfo=ZoneInfo("America/New_York"))
        stale_dt = datetime(2026, 3, 20, 21, 0, tzinfo=ZoneInfo("America/New_York"))

        def _parse_side_effect(text: str, tz_hint: str | None = None):
            normalized = " ".join(text.lower().split())
            if "friday, march 20 at 9 am" in normalized:
                return {"datetime": parsed_dt}
            if "tomorrow at nine pm" in normalized:
                return {"datetime": stale_dt}
            return {
                "datetime": None,
                "needs_clarification": False,
                "clarification_type": "",
                "message": "parse_failed",
            }

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            side_effect=_parse_side_effect,
        ), patch(
            "tools.assistant_tools.is_within_working_hours",
            return_value=(True, None),
        ), patch(
            "tools.assistant_tools.is_slot_free_supabase",
            new=AsyncMock(return_value=True),
        ):
            result = await tools.update_patient_record(time_suggestion="9 AM")

        self.assertEqual(state.dt_local, parsed_dt)
        self.assertEqual(state.dt_local.hour, 9)
        self.assertIn("Friday at 9:00 AM", result)

    async def test_time_parse_failure_preserves_known_date_and_reasks_time(self) -> None:
        state = PatientState(
            full_name="John Doe",
            reason="Cleaning",
            duration_minutes=30,
            dt_text="March 18",
        )
        tools = AssistantTools(state)

        with patch(
            "tools.assistant_tools.parse_datetime_natural",
            return_value={
                "datetime": None,
                "needs_clarification": False,
                "clarification_type": "",
                "message": "parse_failed",
            },
        ):
            result = await tools.update_patient_record(time_suggestion="At")

        self.assertEqual(state.dt_text, "March 18")
        self.assertEqual(state.time_status, "pending")
        self.assertIn("What time works best", result)
        self.assertIn("March 18", result)

    async def test_update_patient_record_normalizes_name_before_booking_payload(self) -> None:
        state = PatientState(
            reason="Cleaning",
            duration_minutes=30,
            dt_local=datetime(2026, 3, 18, 13, 0, tzinfo=ZoneInfo("America/New_York")),
            time_status="valid",
            slot_available=True,
            phone_e164="+13105551234",
            phone_confirmed=True,
        )
        tools = AssistantTools(state, clinic_info={"id": "clinic-123", "default_phone_region": "US"})

        await tools.update_patient_record(name="John.")

        with patch(
            "tools.assistant_tools.book_to_supabase",
            new=AsyncMock(return_value="appt-123"),
        ) as book_mock:
            await tools.confirm_and_book_appointment()

        self.assertEqual(state.full_name, "John")
        self.assertEqual(book_mock.await_args.kwargs["patient_state"].full_name, "John")

    async def test_search_clinic_info_uses_knowledge_bank_for_pricing(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Teeth whitening pricing",
                    "body": "Teeth whitening is $299 for a single in-office session. It usually takes about an hour.",
                }
            ],
        )

        result = await tools.search_clinic_info("Can I get to know the pricing of teeth whitening?")

        self.assertIn("$299", result)
        self.assertEqual(result, "Teeth whitening is $299.")

    async def test_search_clinic_info_humanizes_compact_service_pricing_without_llm(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Teeth whitening pricing",
                    "body": "Teeth whitening: $280 (30 minutes).",
                    "category": "Pricing",
                }
            ],
        )

        result = await tools.search_clinic_info("What is the pricing of teeth whitening?")

        self.assertEqual(result, "Teeth whitening is $280.")

    async def test_search_clinic_info_prefers_pricing_article_over_policy_for_whitening(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Cancellation",
                    "body": "We require 24-hour notice. Late cancels may incur a $50 fee.",
                    "category": "Policy",
                },
                {
                    "title": "Whitening",
                    "body": "Zoom! In-office whitening is $450. Home trays are $250.",
                    "category": "Pricing",
                },
            ],
        )

        result = await tools.search_clinic_info("What is the pricing of teeth whitening?")

        self.assertIn("$450", result)
        self.assertIn("$250", result)
        self.assertNotIn("24-hour notice", result)

    async def test_search_clinic_info_scopes_multi_service_pricing_to_requested_service(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Service pricing",
                    "body": (
                        "We offer two professional whitening options: an in-office treatment for $450 that "
                        "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                        "whitening experience. Root canal therapy is $800 for anterior teeth and $1,100 for "
                        "molars. Custom-fitted night guards are $550."
                    ),
                    "category": "Pricing",
                }
            ],
        )

        result = await tools.search_clinic_info("What is the pricing of teeth whitening?")

        self.assertIn("$450", result)
        self.assertIn("$250", result)
        self.assertNotIn("Root canal", result)
        self.assertNotIn("night guards", result)

    async def test_search_clinic_info_scopes_single_paragraph_pricing_to_requested_service(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Service pricing",
                    "body": (
                        "We offer two professional whitening options: an in-office treatment for $450 that "
                        "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                        "whitening experience, root canal therapy is $800 for anterior teeth and $1,100 for "
                        "molars, and custom-fitted night guards are $550."
                    ),
                    "category": "Pricing",
                }
            ],
        )

        result = await tools.search_clinic_info(
            "Yeah. Actually, I wanted to know pricing of teeth whitening as well."
        )

        self.assertIn("$450", result)
        self.assertIn("$250", result)
        self.assertNotIn("Root canal", result)
        self.assertNotIn("night guards", result)

    async def test_search_clinic_info_allows_pricing_questions_to_match_service_category(self) -> None:
        state = PatientState(reason="Root canal")
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Root Canal",
                    "body": "Molar root canals are $1,100. Anterior root canals are $800.",
                    "category": "Services",
                }
            ],
        )

        result = await tools.search_clinic_info("How much is a root canal?")

        self.assertIn("$1,100", result)

    async def test_search_clinic_info_routes_payment_questions_to_payment_category(self) -> None:
        state = PatientState()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Methods",
                    "body": "We accept Cash, Visa, MC, Amex, and CareCredit financing.",
                    "category": "Payment",
                },
                {
                    "title": "Providers",
                    "body": "In-network with Delta Dental, Aetna, Cigna, MetLife, BCBS PPO.",
                    "category": "Insurance",
                },
            ],
        )

        result = await tools.search_clinic_info("What payment methods do you accept?")

        self.assertIn("Visa", result)
        self.assertNotIn("Delta Dental", result)

    async def test_search_clinic_info_uses_custom_humanizer_for_general_faq(self) -> None:
        state = PatientState()
        humanizer = AsyncMock(
            return_value="We accept cash, Visa, MasterCard, Amex, and CareCredit."
        )
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Methods",
                    "body": "We accept Cash, Visa, MC, Amex, and CareCredit financing.",
                    "category": "Payment",
                }
            ],
            clinic_answer_humanizer=humanizer,
        )

        result = await tools.search_clinic_info("What payment methods do you accept?")

        self.assertEqual(
            result,
            "We accept cash, Visa, MasterCard, Amex, and CareCredit.",
        )
        humanizer.assert_awaited_once()
        asked_question, raw_answer, fallback_service = humanizer.await_args.args
        self.assertEqual(asked_question, "What payment methods do you accept?")
        self.assertIn("CareCredit", raw_answer)
        self.assertIsNone(fallback_service)

    async def test_search_clinic_info_returns_full_staff_details_without_cutting_off_title(self) -> None:
        state = PatientState()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Dr. Moiz",
                    "body": "Dr. Moiz graduated from UCLA with 15+ years experience.",
                    "category": "Staff",
                }
            ],
        )

        result = await tools.search_clinic_info("What is the name of the doctor?")

        self.assertIn("Dr. Moiz", result)
        self.assertIn("15+ years experience", result)
        self.assertNotEqual(result.strip(), "Dr.")

    async def test_search_clinic_info_asks_for_clarification_when_pricing_service_is_unclear(self) -> None:
        state = PatientState()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Cleaning",
                    "body": "Standard cleaning is $125. New patient special is $99.",
                    "category": "Pricing",
                },
                {
                    "title": "Whitening",
                    "body": "Zoom! In-office whitening is $450. Home trays are $250.",
                    "category": "Pricing",
                },
            ],
        )

        result = await tools.search_clinic_info("What is the pricing of whitepaper?")

        self.assertEqual(result, "Which service would you like pricing for?")
        self.assertNotIn("$125", result)

    async def test_answer_clinic_question_uses_fresh_service_context_for_duration_follow_up(self) -> None:
        state = PatientState(reason="Teeth whitening")
        tools = AssistantTools(
            state,
            settings={
                "config_json": {
                    "services": [
                        {"name": "Teeth whitening", "price": 280, "duration": 30, "enabled": True},
                        {"name": "Root canal", "price": 800, "duration": 90, "enabled": True},
                    ]
                }
            },
        )

        state.remember_user_text("How much is teeth whitening?")
        first = await tools.answer_clinic_question("How much is teeth whitening?")
        state.remember_user_text("How long does it take?")
        result = await tools.answer_clinic_question("How long does it take?")

        self.assertEqual(first, "Teeth whitening is $280.")
        self.assertEqual(result, "Teeth whitening usually takes about 30 minutes.")

    async def test_answer_clinic_question_falls_back_when_humanizer_errors(self) -> None:
        state = PatientState()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Methods",
                    "body": "We accept Cash, Visa, MC, Amex, and CareCredit financing.",
                    "category": "Payment",
                }
            ],
            clinic_answer_humanizer=AsyncMock(side_effect=RuntimeError("formatter unavailable")),
        )

        result = await tools.answer_clinic_question(
            "What payment methods do you accept?",
            include_follow_up=True,
        )

        self.assertIsNotNone(result)
        self.assertIn("We accept Cash, Visa, MC, Amex, and CareCredit financing.", result or "")
        self.assertIn("Is there anything else I can help you with today?", result or "")

    def test_prune_clinic_response_for_tts_scopes_pricing_to_requested_service(self) -> None:
        pruned = prune_clinic_response_for_tts(
            "The price for teeth whitening?",
            (
                "We offer two professional whitening options: an in-office treatment for $450 that "
                "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                "whitening experience. Root canal therapy is $800 for anterior (front) teeth and "
                "$1,100 for molars. We offer custom-fitted night guards for patients who grind their "
                "teeth (bruxism), priced at $550."
            ),
            [
                {
                    "title": "Service pricing",
                    "body": (
                        "We offer two professional whitening options: an in-office treatment for $450 that "
                        "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                        "whitening experience. Root canal therapy is $800 for anterior (front) teeth and "
                        "$1,100 for molars. We offer custom-fitted night guards for patients who grind their "
                        "teeth (bruxism), priced at $550."
                    ),
                    "category": "Pricing",
                }
            ],
            fallback_service="Teeth whitening",
        )

        self.assertIn("$450", pruned)
        self.assertIn("$250", pruned)
        self.assertNotIn("Root canal", pruned)
        self.assertNotIn("night guards", pruned)

    def test_prune_clinic_response_for_tts_preserves_anything_else_follow_up(self) -> None:
        pruned = prune_clinic_response_for_tts(
            "The price for teeth whitening?",
            (
                "We offer two professional whitening options: an in-office treatment for $450 that "
                "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                "whitening experience. Root canal therapy is $800. Is there anything else I can help "
                "you with today?"
            ),
            [
                {
                    "title": "Service pricing",
                    "body": (
                        "We offer two professional whitening options: an in-office treatment for $450 that "
                        "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                        "whitening experience. Root canal therapy is $800."
                    ),
                    "category": "Pricing",
                }
            ],
            fallback_service="Teeth whitening",
        )

        self.assertIn("Is there anything else I can help you with today?", pruned)
        self.assertNotIn("Root canal", pruned)


if __name__ == "__main__":
    unittest.main()
