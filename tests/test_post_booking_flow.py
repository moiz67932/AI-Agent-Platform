import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

from agent import (
    _build_no_repeat_llm_instruction,
    _handle_exit_intent_turn,
    _handle_post_booking_turn,
    _micro_ack_decision,
    _session_say,
)
from models.state import PatientState
from tools import assistant_tools as assistant_tools_module
from tools.assistant_tools import AssistantTools


TZ = ZoneInfo("America/Los_Angeles")
FUTURE_SLOT = datetime.now(TZ).replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=2)


class _FakeSpeechHandle:
    def __init__(self) -> None:
        self.wait_for_playout = AsyncMock()


class _FakeSession:
    def __init__(self) -> None:
        self.say_calls: list[tuple[str, dict, _FakeSpeechHandle]] = []

    def say(self, text: str, **kwargs):
        handle = _FakeSpeechHandle()
        self.say_calls.append((text, kwargs, handle))
        return handle


def _configure_tools_globals() -> None:
    assistant_tools_module._GLOBAL_CLINIC_INFO = {
        "id": "clinic-123",
        "default_phone_region": "US",
    }
    assistant_tools_module._GLOBAL_SCHEDULE = {"working_hours": {}}
    assistant_tools_module._GLOBAL_CLINIC_TZ = "America/Los_Angeles"
    assistant_tools_module._REFRESH_AGENT_MEMORY = None


def _booked_state() -> PatientState:
    return PatientState(
        full_name="Jane Smith",
        reason="Cleaning",
        dt_local=FUTURE_SLOT,
        time_status="valid",
        slot_available=True,
        phone_pending="+13105550001",
        phone_e164="+13105550001",
        phone_last4="0001",
        phone_confirmed=True,
        contact_phase_started=True,
        appointment_booked=True,
        booking_confirmed=True,
        appointment_id="appt-123",
        using_caller_number=True,
        confirmed_contact_number_source="caller_id",
    )


class MicroAckDecisionTests(unittest.TestCase):
    def test_first_turn_opening_request_gets_micro_ack(self) -> None:
        state = PatientState()
        utterance = "Hi, this is John. I want to book a teeth whitening appointment."
        state.remember_user_text(utterance)

        ack, reason = _micro_ack_decision(utterance, state=state)

        self.assertEqual(ack, "Absolutely.")
        self.assertIsNone(reason)

    def test_capture_turn_is_suppressed(self) -> None:
        state = PatientState()
        utterance = "Tomorrow at 1 PM."
        state.remember_user_text(utterance)

        ack, reason = _micro_ack_decision(utterance, state=state)

        self.assertIsNone(ack)
        self.assertEqual(reason, "capture_turn")

    def test_confirmation_turn_is_suppressed(self) -> None:
        state = PatientState(
            pending_confirm="phone",
            pending_confirm_field="phone",
        )
        utterance = "Yes, use this number."
        state.remember_user_text(utterance)

        ack, reason = _micro_ack_decision(utterance, state=state)

        self.assertIsNone(ack)
        self.assertEqual(reason, "confirmation_turn")


class PostBookingFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _configure_tools_globals()

    def test_session_say_defaults_direct_responses_into_chat_context(self) -> None:
        session = _FakeSession()

        _session_say(session, "Booked for Tuesday at 2 PM.")

        self.assertEqual(session.say_calls[0][0], "Booked for Tuesday at 2 PM.")
        self.assertTrue(session.say_calls[0][1]["add_to_chat_ctx"])

    def test_post_booking_llm_guard_keeps_delivery_flow_and_blocks_re_greeting(self) -> None:
        state = _booked_state()
        state.delivery_preference_pending = True

        instruction = _build_no_repeat_llm_instruction(
            state,
            "Uh, what type would work?",
        )

        self.assertIsNotNone(instruction)
        self.assertIn("Do not greet, welcome, or introduce yourself again.", instruction or "")
        self.assertIn("Would you like that on WhatsApp, or by SMS on this number?", instruction or "")
        self.assertIn("answer it briefly before asking for anything else", instruction or "")

    async def test_whatsapp_choice_is_handled_deterministically(self) -> None:
        state = _booked_state()
        state.delivery_preference_pending = True
        session = _FakeSession()
        tools = AssistantTools(state)

        result = await _handle_post_booking_turn(
            text="Yeah, WhatsApp is fine.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(state.delivery_channel, "whatsapp")
        self.assertTrue(state.anything_else_pending)
        self.assertEqual(
            session.say_calls[0][0],
            "Perfect, I'll send it on WhatsApp. Is there anything else I can help you with today?",
        )

    async def test_sms_choice_is_handled_deterministically(self) -> None:
        state = _booked_state()
        state.delivery_preference_pending = True
        session = _FakeSession()
        tools = AssistantTools(state)

        result = await _handle_post_booking_turn(
            text="No WhatsApp, send a text instead.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(state.delivery_channel, "sms")
        self.assertTrue(state.anything_else_pending)
        self.assertEqual(
            session.say_calls[0][0],
            "No problem, I'll send it by SMS. Is there anything else I can help you with today?",
        )

    async def test_ambiguous_delivery_reply_defaults_cleanly_to_whatsapp(self) -> None:
        state = _booked_state()
        state.delivery_preference_pending = True
        session = _FakeSession()
        tools = AssistantTools(state)

        result = await _handle_post_booking_turn(
            text="Whichever is good.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertEqual(state.delivery_channel, "whatsapp")
        self.assertTrue(state.anything_else_pending)
        self.assertEqual(
            session.say_calls[0][0],
            "Perfect, I'll send it on WhatsApp. Is there anything else I can help you with today?",
        )

    async def test_delivery_side_question_uses_knowledge_bank_and_returns_to_delivery_prompt(self) -> None:
        state = _booked_state()
        state.delivery_preference_pending = True
        session = _FakeSession()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Teeth whitening pricing",
                    "body": "Teeth whitening is $299 for a single in-office session. It usually takes about an hour.",
                }
            ],
        )

        result = await _handle_post_booking_turn(
            text="Can I get to know the pricing of teeth whitening?",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.delivery_preference_pending)
        self.assertFalse(state.anything_else_pending)
        self.assertIn("$299", session.say_calls[0][0])
        self.assertIn("Would you like that on WhatsApp, or by SMS on this number?", session.say_calls[0][0])

    async def test_delivery_side_follow_up_uses_booked_service_context(self) -> None:
        state = _booked_state()
        state.reason = "Teeth whitening"
        state.delivery_preference_pending = True
        session = _FakeSession()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Service pricing",
                    "body": (
                        "We offer two professional whitening options: an in-office treatment for $450 that "
                        "delivers immediate results, or custom take-home trays for $250 for a more gradual "
                        "whitening experience. Root canal therapy is $800 for anterior teeth and $1,100 for "
                        "molars."
                    ),
                    "category": "Pricing",
                }
            ],
        )

        result = await _handle_post_booking_turn(
            text="What type is better?",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.delivery_preference_pending)
        self.assertIn("whitening options", session.say_calls[0][0])
        self.assertNotIn("Root canal", session.say_calls[0][0])
        self.assertIn("Would you like that on WhatsApp, or by SMS on this number?", session.say_calls[0][0])

    async def test_booking_with_known_delivery_asks_anything_else(self) -> None:
        state = _booked_state()
        state.appointment_booked = False
        state.booking_confirmed = False
        state.delivery_channel = "whatsapp"
        tools = AssistantTools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock, return_value="appt-xyz-001"):
            result = await tools.confirm_and_book_appointment()

        self.assertIn("Is there anything else I can help you with today?", result)
        self.assertTrue(state.anything_else_pending)
        self.assertIn("this number", result)
        self.assertNotIn(state.phone_e164 or "", result)

    async def test_booking_delivery_question_avoids_repeating_full_number(self) -> None:
        state = _booked_state()
        state.appointment_booked = False
        state.booking_confirmed = False
        tools = AssistantTools(state)

        with patch("tools.assistant_tools.book_to_supabase", new_callable=AsyncMock, return_value="appt-xyz-002"):
            result = await tools.confirm_and_book_appointment()

        self.assertTrue(state.delivery_preference_pending)
        self.assertIn("Would you like that on WhatsApp, or by SMS on this number?", result)
        self.assertNotIn(state.phone_e164 or "", result)

    async def test_final_closing_path_sends_goodbye_and_schedules_disconnect(self) -> None:
        state = _booked_state()
        state.anything_else_pending = True
        session = _FakeSession()
        tools = AssistantTools(state)
        schedule_auto_disconnect = Mock()

        result = await _handle_post_booking_turn(
            text="No, that's all.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=schedule_auto_disconnect,
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.final_goodbye_sent)
        self.assertEqual(
            session.say_calls[0][0],
            "Wonderful. You're all set — we'll see you then. Have a great day.",
        )
        schedule_auto_disconnect.assert_called_once()

    async def test_post_booking_pricing_question_uses_knowledge_bank_and_reasks_anything_else(self) -> None:
        state = _booked_state()
        state.anything_else_pending = True
        session = _FakeSession()
        tools = AssistantTools(
            state,
            knowledge_articles=[
                {
                    "title": "Teeth whitening pricing",
                    "body": "Teeth whitening is $299 for a single in-office session. It usually takes about an hour.",
                }
            ],
        )

        result = await _handle_post_booking_turn(
            text="Can I get to know the pricing of teeth whitening?",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.anything_else_pending)
        self.assertIn("$299", session.say_calls[0][0])
        self.assertIn("Is there anything else I can help you with today?", session.say_calls[0][0])

    async def test_auto_disconnect_is_cancelled_when_user_resumes(self) -> None:
        state = _booked_state()
        state.final_goodbye_sent = True
        session = _FakeSession()
        tools = AssistantTools(state)
        cancel_auto_disconnect = Mock()

        result = await _handle_post_booking_turn(
            text="Actually, can I ask one more thing?",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=Mock(),
            cancel_auto_disconnect=cancel_auto_disconnect,
        )

        self.assertEqual(result, "none")
        self.assertFalse(state.final_goodbye_sent)
        cancel_auto_disconnect.assert_called_once()

    async def test_user_goodbye_after_final_close_reschedules_disconnect(self) -> None:
        state = _booked_state()
        state.final_goodbye_sent = True
        session = _FakeSession()
        tools = AssistantTools(state)
        schedule_auto_disconnect = Mock()

        result = await _handle_post_booking_turn(
            text="Bye.",
            state=state,
            assistant_tools=tools,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=schedule_auto_disconnect,
            cancel_auto_disconnect=Mock(),
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.user_goodbye_detected)
        schedule_auto_disconnect.assert_called_once_with(None)

    async def test_exit_intent_turn_speaks_goodbye_and_schedules_disconnect(self) -> None:
        state = _booked_state()
        session = _FakeSession()
        schedule_auto_disconnect = Mock()

        result = await _handle_exit_intent_turn(
            text="Thank you so much. Bye.",
            state=state,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=schedule_auto_disconnect,
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.final_goodbye_sent)
        self.assertTrue(state.user_goodbye_detected)
        self.assertEqual(
            session.say_calls[0][0],
            "Wonderful. You're all set â€” we'll see you then. Have a great day.",
        )
        schedule_auto_disconnect.assert_called_once()


    async def _assert_exit_intent_turn_speaks_goodbye_and_schedules_disconnect_override(self) -> None:
        state = _booked_state()
        session = _FakeSession()
        schedule_auto_disconnect = Mock()

        result = await _handle_exit_intent_turn(
            text="Thank you so much. Bye.",
            state=state,
            session=session,
            cancel_scheduled_filler=Mock(),
            interrupt_filler=Mock(),
            refresh_memory_async=AsyncMock(),
            mark_direct_response=Mock(),
            schedule_auto_disconnect=schedule_auto_disconnect,
        )

        self.assertEqual(result, "consumed")
        self.assertTrue(state.final_goodbye_sent)
        self.assertTrue(state.user_goodbye_detected)
        self.assertIn("Wonderful. You're all set", session.say_calls[0][0])
        self.assertIn("Have a great day.", session.say_calls[0][0])
        schedule_auto_disconnect.assert_called_once()

PostBookingFlowTests.test_exit_intent_turn_speaks_goodbye_and_schedules_disconnect = (
    PostBookingFlowTests._assert_exit_intent_turn_speaks_goodbye_and_schedules_disconnect_override
)


async def _assert_final_closing_path_sends_non_interruptible_bye_override(self) -> None:
    state = _booked_state()
    state.anything_else_pending = True
    session = _FakeSession()
    tools = AssistantTools(state)
    schedule_auto_disconnect = Mock()

    result = await _handle_post_booking_turn(
        text="No, that's all.",
        state=state,
        assistant_tools=tools,
        session=session,
        cancel_scheduled_filler=Mock(),
        interrupt_filler=Mock(),
        refresh_memory_async=AsyncMock(),
        mark_direct_response=Mock(),
        schedule_auto_disconnect=schedule_auto_disconnect,
        cancel_auto_disconnect=Mock(),
    )

    self.assertEqual(result, "consumed")
    self.assertTrue(state.final_goodbye_sent)
    self.assertIn("Bye, you're all set.", session.say_calls[0][0])
    self.assertIn("Have a great day.", session.say_calls[0][0])
    self.assertFalse(session.say_calls[0][1]["allow_interruptions"])
    schedule_auto_disconnect.assert_called_once()


async def _assert_exit_intent_turn_speaks_non_interruptible_bye_override(self) -> None:
    state = _booked_state()
    session = _FakeSession()
    schedule_auto_disconnect = Mock()

    result = await _handle_exit_intent_turn(
        text="Thank you so much. Bye.",
        state=state,
        session=session,
        cancel_scheduled_filler=Mock(),
        interrupt_filler=Mock(),
        refresh_memory_async=AsyncMock(),
        mark_direct_response=Mock(),
        schedule_auto_disconnect=schedule_auto_disconnect,
    )

    self.assertEqual(result, "consumed")
    self.assertTrue(state.final_goodbye_sent)
    self.assertTrue(state.user_goodbye_detected)
    self.assertIn("Bye, you're all set.", session.say_calls[0][0])
    self.assertIn("Have a great day.", session.say_calls[0][0])
    self.assertFalse(session.say_calls[0][1]["allow_interruptions"])
    schedule_auto_disconnect.assert_called_once()


PostBookingFlowTests.test_final_closing_path_sends_goodbye_and_schedules_disconnect = (
    _assert_final_closing_path_sends_non_interruptible_bye_override
)
PostBookingFlowTests.test_exit_intent_turn_speaks_goodbye_and_schedules_disconnect = (
    _assert_exit_intent_turn_speaks_non_interruptible_bye_override
)

if __name__ == "__main__":
    unittest.main()
