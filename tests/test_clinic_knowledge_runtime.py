import unittest

from models.state import PatientState
from tools.assistant_tools import AssistantTools


def _working_hours():
    return {
        "monday": {"open": True, "start": "09:00", "end": "17:00"},
        "tuesday": {"open": True, "start": "09:00", "end": "17:00"},
        "wednesday": {"open": True, "start": "09:00", "end": "17:00"},
        "thursday": {"open": True, "start": "09:00", "end": "17:00"},
        "friday": {"open": True, "start": "09:00", "end": "17:00"},
        "saturday": {"open": False, "start": "09:00", "end": "13:00"},
        "sunday": {"open": False, "start": "09:00", "end": "13:00"},
    }


def _build_tools(
    *,
    state: PatientState | None = None,
    clinic_id: str = "clinic-123",
    organization_id: str = "org-123",
    services: list[dict] | None = None,
    knowledge_articles: list[dict] | None = None,
    clinic_overrides: dict | None = None,
) -> AssistantTools:
    clinic_info = {
        "id": clinic_id,
        "organization_id": organization_id,
        "name": "Truly Dental",
        "address_line1": "42 Baggot Street Lower",
        "city": "Dublin",
        "state": "Dublin",
        "zip": "D02E780",
        "working_hours": _working_hours(),
    }
    if clinic_overrides:
        clinic_info.update(clinic_overrides)
    settings = {
        "organization_id": organization_id,
        "config_json": {
            "industry_type": "dental",
            "services": services
            or [
                {"name": "Teeth whitening", "price": 280, "duration": 30, "enabled": True},
                {"name": "Root canal", "price": 800, "duration": 90, "enabled": True},
                {"name": "Dental filling", "price": 180, "duration": 45, "enabled": True},
            ],
        },
    }
    return AssistantTools(
        state or PatientState(),
        clinic_info=clinic_info,
        settings=settings,
        knowledge_articles=knowledge_articles
        or [
            {"title": "Parking", "body": "There is paid street parking right outside the clinic.", "category": "Parking"},
            {"title": "Insurance", "body": "We accept Delta Dental, Aetna, and Cigna.", "category": "Insurance"},
            {"title": "Payment Methods", "body": "We accept cash, Visa, MasterCard, and CareCredit.", "category": "Payment"},
            {"title": "Cancellation Policy", "body": "We ask for at least 24 hours notice for changes or cancellations.", "category": "Policy"},
        ],
    )


class ClinicKnowledgeRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_price_question_uses_structured_fact(self) -> None:
        tools = _build_tools()

        result = await tools.search_clinic_info("What is the price of teeth whitening?")

        self.assertEqual(result, "Teeth whitening is $280.")

    async def test_service_duration_question_uses_structured_fact(self) -> None:
        tools = _build_tools()

        result = await tools.search_clinic_info("How long does teeth whitening take?")

        self.assertEqual(result, "Teeth whitening usually takes about 30 minutes.")

    async def test_same_service_follow_up_uses_fresh_context(self) -> None:
        state = PatientState()
        tools = _build_tools(state=state)

        state.remember_user_text("How much is teeth whitening?")
        first = await tools.answer_clinic_question("How much is teeth whitening?")
        state.remember_user_text("How long does it take?")
        second = await tools.answer_clinic_question("How long does it take?")

        self.assertEqual(first, "Teeth whitening is $280.")
        self.assertEqual(second, "Teeth whitening usually takes about 30 minutes.")

    async def test_broad_service_list_clears_stale_service_scope(self) -> None:
        state = PatientState()
        tools = _build_tools(state=state)

        state.remember_user_text("How much is teeth whitening?")
        await tools.answer_clinic_question("How much is teeth whitening?")
        state.remember_user_text("What services do you offer?")
        result = await tools.answer_clinic_question("What services do you offer?")

        self.assertIn("Teeth whitening", result or "")
        self.assertIn("Root canal", result or "")
        self.assertIn("Dental filling", result or "")
        self.assertNotIn("$280", result or "")
        self.assertIsNone(state.clinic_last_service_id)

    async def test_service_switch_changes_scope_cleanly(self) -> None:
        state = PatientState()
        tools = _build_tools(state=state)

        state.remember_user_text("How much is teeth whitening?")
        await tools.answer_clinic_question("How much is teeth whitening?")
        state.remember_user_text("What about root canal?")
        result = await tools.answer_clinic_question("What about root canal?")

        self.assertEqual(result, "Root canal is $800.")

    async def test_service_guidance_question_stays_bounded_to_that_service(self) -> None:
        tools = _build_tools()

        result = await tools.search_clinic_info("Can you guide me about root canal?")

        self.assertIn("Root canal", result)
        self.assertNotIn("Teeth whitening", result)
        self.assertNotIn("Dental filling", result)
        self.assertTrue("$800" in result or "90 minutes" in result)

    async def test_general_faq_categories_route_through_general_knowledge(self) -> None:
        tools = _build_tools()

        hours = await tools.search_clinic_info("What are your hours?")
        location = await tools.search_clinic_info("Where are you located?")
        parking = await tools.search_clinic_info("Do you have parking?")
        insurance = await tools.search_clinic_info("What insurance do you take?")
        payment = await tools.search_clinic_info("What payment methods do you accept?")

        self.assertIn("Monday", hours)
        self.assertIn("9:00 AM", hours)
        self.assertIn("42 Baggot Street Lower", location)
        self.assertIn("parking", parking.lower())
        self.assertIn("Delta Dental", insurance)
        self.assertIn("CareCredit", payment)

    async def test_ambiguity_requires_clarification_without_service_context(self) -> None:
        tools = _build_tools()

        result = await tools.search_clinic_info("How much does it cost?")

        self.assertEqual(result, "Which service would you like pricing for?")

    async def test_incomplete_fragments_do_not_commit_to_wrong_service(self) -> None:
        tools = _build_tools()

        what_about = await tools.search_clinic_info("what about")
        services = await tools.search_clinic_info("services")
        pricing = await tools.search_clinic_info("the pricing")

        self.assertEqual(what_about, "Could you tell me which service or clinic detail you mean?")
        self.assertIn("Teeth whitening", services)
        self.assertEqual(pricing, "Which service would you like pricing for?")

    async def test_fallback_safety_when_no_reliable_fact_exists(self) -> None:
        tools = _build_tools(services=[], knowledge_articles=[])

        result = await tools.search_clinic_info("Do you offer sedation for very anxious patients?")

        self.assertIn("don't have a reliable answer", result)

    async def test_multi_tenant_answers_stay_isolated(self) -> None:
        clinic_a = _build_tools(
            clinic_id="clinic-a",
            organization_id="org-a",
            knowledge_articles=[{"title": "Payment Methods", "body": "Clinic A accepts cash and Visa.", "category": "Payment"}],
        )
        clinic_b = _build_tools(
            clinic_id="clinic-b",
            organization_id="org-b",
            knowledge_articles=[{"title": "Payment Methods", "body": "Clinic B accepts Amex only.", "category": "Payment"}],
        )

        answer_a = await clinic_a.search_clinic_info("What payment methods do you accept?")
        answer_b = await clinic_b.search_clinic_info("What payment methods do you accept?")

        self.assertIn("Visa", answer_a)
        self.assertNotIn("Amex only", answer_a)
        self.assertIn("Amex only", answer_b)
        self.assertNotIn("Visa", answer_b)


if __name__ == "__main__":
    unittest.main()
