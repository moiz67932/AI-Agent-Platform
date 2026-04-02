from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "eval" / "clinic_knowledge_cases.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.state import PatientState
from tools.assistant_tools import AssistantTools


async def _identity_humanizer(question: str, answer: str, fallback_service: str | None) -> str:
    return answer


def _build_tools(state: PatientState) -> AssistantTools:
    return AssistantTools(
        state,
        clinic_info={
            "id": "clinic-eval",
            "organization_id": "org-eval",
            "name": "Truly Dental",
            "address_line1": "42 Baggot Street Lower",
            "city": "Dublin",
            "state": "Dublin",
            "zip": "D02E780",
            "working_hours": {
                "monday": {"open": True, "start": "09:00", "end": "17:00"},
                "tuesday": {"open": True, "start": "09:00", "end": "17:00"},
                "wednesday": {"open": True, "start": "09:00", "end": "17:00"},
                "thursday": {"open": True, "start": "09:00", "end": "17:00"},
                "friday": {"open": True, "start": "09:00", "end": "17:00"},
            },
        },
        settings={
            "organization_id": "org-eval",
            "config_json": {
                "industry_type": "dental",
                "services": [
                    {"name": "Teeth whitening", "price": 280, "duration": 30, "enabled": True},
                    {"name": "Root canal", "price": 800, "duration": 90, "enabled": True},
                    {"name": "Dental filling", "price": 180, "duration": 45, "enabled": True},
                ],
            },
        },
        knowledge_articles=[
            {"title": "Parking", "body": "There is paid street parking right outside the clinic.", "category": "Parking"},
            {"title": "Insurance", "body": "We accept Delta Dental, Aetna, and Cigna.", "category": "Insurance"},
            {"title": "Payment Methods", "body": "We accept cash, Visa, MasterCard, and CareCredit.", "category": "Payment"},
            {"title": "Cancellation Policy", "body": "We ask for at least 24 hours notice for changes or cancellations.", "category": "Policy"},
        ],
        clinic_answer_humanizer=_identity_humanizer,
    )


async def _run_case(case: dict) -> tuple[bool, list[str]]:
    state = PatientState()
    tools = _build_tools(state)
    messages: list[str] = []
    passed = True

    for turn in case.get("turns", []):
        question = str(turn.get("question") or "").strip()
        state.remember_user_text(question)
        answer = await tools.answer_clinic_question(question) or ""
        messages.append(f"Q: {question}\nA: {answer}")
        for expected in turn.get("expect_contains", []):
            if expected not in answer:
                passed = False
                messages.append(f"  missing: {expected}")
        for excluded in turn.get("expect_excludes", []):
            if excluded in answer:
                passed = False
                messages.append(f"  unexpected: {excluded}")
    return passed, messages


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Run clinic knowledge regression cases from a JSON fixture.")
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE), help="Path to the evaluation fixture JSON.")
    args = parser.parse_args()

    fixture_path = Path(args.fixture)
    cases = json.loads(fixture_path.read_text(encoding="utf-8"))
    failures = 0
    for case in cases:
        passed, messages = await _run_case(case)
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {case.get('name')}")
        for message in messages:
            print(message)
        if not passed:
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
