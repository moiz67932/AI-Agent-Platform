import unittest
from types import SimpleNamespace

from services.extraction_service import extract_name_quick
from utils.agent_flow import (
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
        self.assertTrue(resolve_confirmation_intent("This is the number."))

    def test_resolve_delivery_preference_defaults_ambiguous_reply_to_whatsapp(self) -> None:
        self.assertEqual(resolve_delivery_preference("either one is fine"), "whatsapp")
        self.assertEqual(resolve_delivery_preference("Whichever is good."), "whatsapp")
        self.assertEqual(resolve_delivery_preference("send it on whatsapp"), "whatsapp")
        self.assertEqual(resolve_delivery_preference("sms please"), "sms")
        self.assertIsNone(resolve_delivery_preference(""))

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
