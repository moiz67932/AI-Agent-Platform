import unittest

from models.state import PatientState


class PatientStateTests(unittest.TestCase):
    def test_recent_user_texts_tracks_correctly(self) -> None:
        state = PatientState()

        self.assertEqual(len(state.recent_user_texts), 0)

        state.remember_user_text("Hello this is John")
        self.assertEqual(len(state.recent_user_texts), 1)

        state.remember_user_text("I want a teeth cleaning")
        self.assertEqual(len(state.recent_user_texts), 2)
        self.assertEqual(state.recent_user_context(limit=1), "I want a teeth cleaning")
        self.assertIn("John", state.recent_user_context(limit=2))


if __name__ == "__main__":
    unittest.main()
