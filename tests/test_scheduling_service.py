import unittest

from services.scheduling_service import load_schedule_from_settings


class ScheduleNormalizationTests(unittest.TestCase):
    def test_load_schedule_accepts_full_weekday_names_from_clinic_record(self) -> None:
        clinic_info = {
            "working_hours": {
                "monday": {"open": True, "start": "08:00", "end": "16:00"},
                "tuesday": {"open": True, "start": "08:30", "end": "16:30"},
                "wednesday": {"open": True, "start": "09:00", "end": "17:00"},
                "thursday": {"open": True, "start": "09:30", "end": "17:30"},
                "friday": {"open": True, "start": "10:00", "end": "18:00"},
                "saturday": {"open": False, "start": "09:00", "end": "13:00"},
                "sunday": {"open": False, "start": "09:00", "end": "13:00"},
            }
        }

        schedule = load_schedule_from_settings({}, clinic_info)

        self.assertEqual(schedule["working_hours"]["mon"], [{"start": "08:00", "end": "16:00"}])
        self.assertEqual(schedule["working_hours"]["fri"], [{"start": "10:00", "end": "18:00"}])
        self.assertEqual(schedule["working_hours"]["sat"], [])

    def test_load_schedule_prefers_config_json_working_hours_when_present(self) -> None:
        settings = {
            "config_json": {
                "working_hours": {
                    "mon": [{"start": "11:00", "end": "15:00"}],
                    "tue": [{"start": "11:00", "end": "15:00"}],
                }
            }
        }
        clinic_info = {
            "working_hours": {
                "monday": {"open": True, "start": "08:00", "end": "16:00"},
            }
        }

        schedule = load_schedule_from_settings(settings, clinic_info)

        self.assertEqual(schedule["working_hours"]["mon"], [{"start": "11:00", "end": "15:00"}])
        self.assertEqual(schedule["working_hours"]["tue"], [{"start": "11:00", "end": "15:00"}])


if __name__ == "__main__":
    unittest.main()
