import unittest
from types import SimpleNamespace

from services.extraction_service import extract_name_quick
from utils.agent_flow import (
    build_time_parse_candidates,
    ensure_caller_phone_pending,
    is_active_filler_event,
    resolve_confirmation_intent,
    resolve_delivery_preference,
    store_detected_phone,
)


class AgentFlowTests(unittest.TestCase):
    def test_extract_name_quick_reads_standalone_name_from_recent_fragments(self) -> None:
        self.assertEqual(extract_name_quick("PM. Yeah. John Abraham."), "John Abraham")

    def test_extract_name_quick_ignores_service_guidance_phrase(self) -> None:
        self.assertIsNone(extract_name_quick("I am asking about root canal."))
        self.assertIsNone(extract_name_quick("Hydro Fisher"))
        self.assertIsNone(extract_name_quick("WhatsApp"))

    def test_store_detected_phone_seeds_pending_patient_number(self) -> None:
        state = SimpleNamespace(
            detected_phone=None,
            phone_pending=None,
            phone_confirmed=False,
            phone_e164=None,
            phone_last4=None,
            phone_source=None,
        )

        stored = store_detected_phone(state, "+923351897839", "7839")

        self.assertEqual(stored, "+923351897839")
        self.assertEqual(state.detected_phone, "+923351897839")
        self.assertEqual(state.phone_pending, "+923351897839")
        self.assertEqual(state.phone_last4, "7839")
        self.assertEqual(state.phone_source, "sip")

    def test_ensure_caller_phone_pending_promotes_detected_phone(self) -> None:
        state = SimpleNamespace(
            detected_phone="+13105551234",
            phone_pending=None,
            phone_last4=None,
            phone_source=None,
        )

        promoted = ensure_caller_phone_pending(state)

        self.assertEqual(promoted, "+13105551234")
        self.assertEqual(state.phone_pending, "+13105551234")
        self.assertEqual(state.phone_last4, "1234")
        self.assertEqual(state.phone_source, "sip")

    def test_resolve_confirmation_intent_uses_last_explicit_marker(self) -> None:
        self.assertTrue(resolve_confirmation_intent("No. Yep."))
        self.assertFalse(resolve_confirmation_intent("Yep, no."))

    def test_resolve_confirmation_intent_understands_calling_from_phrase(self) -> None:
        self.assertTrue(resolve_confirmation_intent("Use the number I'm calling from."))
        self.assertTrue(resolve_confirmation_intent("The number you're calling from."))
        self.assertTrue(resolve_confirmation_intent("Use the current phone."))
        self.assertTrue(resolve_confirmation_intent("This is the number."))

    def test_resolve_confirmation_intent_matches_caller_last4(self) -> None:
        self.assertTrue(
            resolve_confirmation_intent("Use the number ending in 8914.", caller_e164="+13105558914")
        )
        self.assertIsNone(
            resolve_confirmation_intent("Use the number ending in 1234.", caller_e164="+13105558914")
        )

    def test_resolve_confirmation_intent_rejects_alternate_number_phrases(self) -> None:
        self.assertFalse(resolve_confirmation_intent("No, use another number."))
        self.assertFalse(resolve_confirmation_intent("Not this number."))

    def test_resolve_delivery_preference_defaults_ambiguous_reply_to_whatsapp(self) -> None:
        self.assertEqual(resolve_delivery_preference("either one is fine"), "whatsapp")
        self.assertEqual(resolve_delivery_preference("Whichever is good."), "whatsapp")
        self.assertEqual(resolve_delivery_preference("send it on whatsapp"), "whatsapp")
        self.assertEqual(resolve_delivery_preference("sms please"), "sms")
        self.assertEqual(resolve_delivery_preference("email me"), "email")
        self.assertIsNone(resolve_delivery_preference(""))

    def test_time_parse_candidates_do_not_mix_service_context_into_full_datetime(self) -> None:
        candidates = build_time_parse_candidates(
            "First of May at 1 PM",
            recent_context="hydro fisher First of May at 1 PM",
            previous_text=None,
        )

        self.assertEqual(candidates[0], "First of May at 1 PM")
        self.assertNotIn("hydro fisher First of May at 1 PM", candidates[:1])

    def test_is_active_filler_event_detects_same_handle_even_without_text(self) -> None:
        self.assertTrue(
            is_active_filler_event(
                "",
                "Got it.",
                ["Okay.", "Got it."],
                same_handle=True,
            )
        )

    def test_is_active_filler_event_detects_matching_text_prefix(self) -> None:
        self.assertTrue(
            is_active_filler_event(
                "Got it. Let me check that for you.",
                "Got it.",
                ["Okay.", "Got it."],
            )
        )


if __name__ == "__main__":
    unittest.main()
