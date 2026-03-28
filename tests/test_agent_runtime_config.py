import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AGENT_PATH = ROOT / "agent.py"
WORKER_MAIN_PATH = ROOT / "worker_main.py"


def _find_function(module: ast.AST, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef:
    for node in ast.walk(module):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"Function {name!r} not found in agent.py")


class AgentRuntimeConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = ast.parse(AGENT_PATH.read_text(encoding="utf-8"))

    def test_agent_session_increases_max_tool_steps(self) -> None:
        # The code may pass kwargs either inline or via **dict unpacking.
        # Check inline first; then fall back to checking the dict literal.
        for node in ast.walk(self.module):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "AgentSession":
                keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
                if "max_tool_steps" in keywords:
                    self.assertEqual(ast.literal_eval(keywords["max_tool_steps"]), 10)
                    return
        # Dict-unpacking style: verify max_tool_steps=10 appears in any dict assignment
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn('"max_tool_steps"', source, "max_tool_steps key not found in agent.py")
        self.assertIn("10", source, "value 10 not found near max_tool_steps")

    def test_send_filler_keeps_filler_outside_chat_context_but_interruptible(self) -> None:
        send_filler = _find_function(self.module, "_send_filler")

        found_safe_wrapper = False
        source = AGENT_PATH.read_text(encoding="utf-8")

        for node in ast.walk(send_filler):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "_safe_say"
            ):
                found_safe_wrapper = True

        self.assertTrue(found_safe_wrapper, "_safe_say(...) not found inside _send_filler")
        self.assertIn("add_to_chat_ctx=add_to_chat_ctx", source)
        self.assertIn("allow_interruptions=allow_interruptions", source)

    def test_interrupt_filler_forces_interruption(self) -> None:
        interrupt_filler = _find_function(self.module, "_interrupt_filler")

        for node in ast.walk(interrupt_filler):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "interrupt"
            ):
                keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
                if "force" in keywords:
                    self.assertTrue(ast.literal_eval(keywords["force"]))
                    return
        self.fail("interrupt(force=...) call not found inside _interrupt_filler")

    def test_agent_uses_supported_livekit_state_events(self) -> None:
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn('"user_state_changed"', source)
        self.assertIn('"agent_state_changed"', source)
        self.assertIn('"conversation_item_added"', source)
        self.assertNotIn('session.on("user_speech_started"', source)
        self.assertNotIn('session.on("agent_speech_started"', source)
        self.assertNotIn('session.on("agent_speech_committed"', source)

    def test_worker_main_does_not_force_reset_root_logging(self) -> None:
        source = WORKER_MAIN_PATH.read_text(encoding="utf-8")
        self.assertNotIn("force=True", source)

    def test_agent_refresh_updates_running_instructions(self) -> None:
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn("refresh_agent_memory_async", source)
        self.assertIn(".update_instructions(", source)

    def test_system_prompt_uses_booking_confirmation_wording_for_phone(self) -> None:
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn(
            'ask "Can I use the number you\'re calling from for your appointment confirmation and reminders?"',
            source,
        )
        self.assertIn(
            "When asking to confirm caller ID, phrase it naturally around appointment confirmations, booking updates, or reminders.",
            source,
        )

    def test_safe_say_sanitizes_clinic_pricing_before_tts(self) -> None:
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn("def _sanitize_spoken_output_for_tts", source)
        self.assertIn("prune_clinic_response_for_tts(", source)
        self.assertIn("spoken_text = _sanitize_spoken_output_for_tts(text)", source)

    def test_clinic_faq_prompt_context_is_index_only(self) -> None:
        source = AGENT_PATH.read_text(encoding="utf-8")
        self.assertIn('lines.append(f"- {label}{title}")', source)
        self.assertNotIn('lines.append(f"- {label}{title}: {body}")', source)


if __name__ == "__main__":
    unittest.main()
