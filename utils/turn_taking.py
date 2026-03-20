"""
Lightweight turn-taking tracker, classifier, and response policy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from models.state import PatientState
from services.extraction_service import extract_name_quick, extract_reason_quick
from utils.agent_flow import has_date_reference, has_time_reference, resolve_confirmation_intent


class CompletionLabel(str, Enum):
    INCOMPLETE = "INCOMPLETE"
    LIKELY_CONTINUING = "LIKELY_CONTINUING"
    COMPLETE = "COMPLETE"
    COMPLETE_AND_ACTIONABLE = "COMPLETE_AND_ACTIONABLE"


class PolicyAction(str, Enum):
    WAIT = "wait"
    FAST_PATH = "fast_path"
    LOOKUP = "lookup"
    LLM = "llm"


class ExpectedUserSlot(str, Enum):
    SERVICE = "service"
    DATE = "date"
    TIME = "time"
    DATE_TIME = "date_time"
    PHONE_CONFIRMATION = "phone_confirmation"
    OTHER = "other"


@dataclass(slots=True)
class TurnTakingConfig:
    short_pause_ms: int = 900
    continuation_wait_ms: int = 650
    low_confidence_threshold: float = 0.6
    deterministic_fast_path_enabled: bool = True
    lookup_filler_delay_ms: int = 260
    expected_slot_continuation_wait_ms: int = 850
    expected_slot_weak_fragment_max_tokens: int = 8
    expected_slot_enable_date_time_fast_path: bool = True


@dataclass(slots=True)
class TurnTrackerSnapshot:
    logical_turn_id: int = 0
    raw_partial_text: str = ""
    normalized_partial_text: str = ""
    latest_finalized_text: str = ""
    current_turn_accumulated_text: str = ""
    caller_name: Optional[str] = None
    caller_name_confidence: float = 0.0
    intent: Optional[str] = None
    intent_confidence: float = 0.0
    service: Optional[str] = None
    service_confidence: float = 0.0
    preferred_date: Optional[str] = None
    preferred_date_confidence: float = 0.0
    preferred_time: Optional[str] = None
    preferred_time_confidence: float = 0.0
    self_introduction_in_progress: bool = False
    request_phrase_in_progress: bool = False
    syntactically_incomplete: bool = False
    semantically_incomplete: bool = False
    actionable: bool = False
    deterministic_next_step: Optional[str] = None
    deterministic_response: Optional[str] = None
    expected_user_slot: Optional[str] = None
    expected_slot_status: Optional[str] = None
    filler_spoken_for_turn: bool = False
    filler_text_for_turn: Optional[str] = None
    main_response_started: bool = False
    awaiting_continuation: bool = False
    completion_label: CompletionLabel = CompletionLabel.INCOMPLETE
    completion_reasons: list[str] = field(default_factory=list)
    silence_ms: Optional[int] = None
    final_segment_count: int = 0


@dataclass(slots=True)
class PolicyDecision:
    action: PolicyAction
    completion_label: CompletionLabel
    reasons: list[str]
    response_text: Optional[str] = None
    filler_text: Optional[str] = None
    llm_instruction: Optional[str] = None
    deterministic_route: Optional[str] = None
    wait_ms: int = 0
    lookup_tool: Optional[str] = None


INTRO_PREFIX_ONLY_RE = re.compile(
    r"(?:^|[.?!]\s*)(?:hi|hello|hey)?\s*(?:this is|my name is|i am|i'm)\s*$",
    re.IGNORECASE,
)
INTRO_PARTIAL_NAME_RE = re.compile(
    r"(?:^|[.?!]\s*)(?:this is|my name is|i am|i'm)\s+[a-z][a-z'.-]*$",
    re.IGNORECASE,
)
REQUEST_PREFIX_ONLY_RE = re.compile(
    r"\b(i wanted to|i want to|i need to|i'd like to|can i|could i)\s*$",
    re.IGNORECASE,
)
REQUEST_LEAD_IN_RE = re.compile(
    r"\b(i wanted to|i want to|i need to|i'd like to|can i|could i)\b",
    re.IGNORECASE,
)
TRAILING_INCOMPLETE_RE = re.compile(
    r"(?:\b(?:at|on|for|with|about|to|from|around|between|this|next|my)\b|[,:-])\s*$",
    re.IGNORECASE,
)
BOOKING_INTENT_RE = re.compile(
    r"\b(book|booking|schedule|make an appointment|appointment)\b",
    re.IGNORECASE,
)
RESCHEDULE_INTENT_RE = re.compile(
    r"\b(reschedule|move my appointment|change my appointment|move it)\b",
    re.IGNORECASE,
)
CANCELLATION_INTENT_RE = re.compile(
    r"\b(cancel|cancellation|call off|drop my appointment)\b",
    re.IGNORECASE,
)
LOOKUP_INTENT_RE = re.compile(
    r"\b(do i already have|do i have|already have|check my appointment|look up my appointment|next week)\b",
    re.IGNORECASE,
)
GENERAL_INQUIRY_RE = re.compile(
    r"\b(do you|can you|could you|what|when|where|how much|how long|is there|are there)\b",
    re.IGNORECASE,
)
CLINIC_INFO_INTENT_RE = re.compile(
    r"\b("
    r"price|prices|pricing|cost|costs|fee|fees|rate|rates|"
    r"insurance|coverage|covered|accept|take|"
    r"hours|open|close|closing|location|located|address|parking|park|"
    r"service|services|procedure|procedures|payment|payments|financing"
    r")\b",
    re.IGNORECASE,
)
INFORMATION_REQUEST_RE = re.compile(
    r"\b("
    r"what|when|where|how(?: much| long)?|"
    r"do you|can you|could you|would you|"
    r"tell me|i (?:want|would like) to know|"
    r"get to know|let me know"
    r")\b",
    re.IGNORECASE,
)
TOOTH_ISSUE_RE = re.compile(
    r"\b(tooth|teeth|gum|pain|toothache|issue|problem|something with my tooth)\b",
    re.IGNORECASE,
)
SERVICE_REQUEST_RE = re.compile(
    r"\b(for my|for a|for an)\b",
    re.IGNORECASE,
)
DATE_PHRASE_RE = re.compile(
    r"\b(day after tomorrow|tomorrow|today|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|"
    r"\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b",
    re.IGNORECASE,
)
TIME_PHRASE_RE = re.compile(
    r"\b(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight|morning|afternoon|evening)\b",
    re.IGNORECASE,
)
ACK_PREFIX_RE = re.compile(
    r"^(?:sure|of course|absolutely|okay|alright|got it|perfect)(?:,\s+[a-z][a-z'.-]+)?[.!]\s*",
    re.IGNORECASE,
)
WEAK_FRAGMENT_RE = re.compile(
    r"^(?:"
    r"yes|yeah|yep|okay|ok|hmm|uh|um|er|well|so|let me think|"
    r"i would like to book(?: it)?(?:\s+(?:on|at|for))?|"
    r"i want to book(?: it)?(?:\s+(?:on|at|for))?|"
    r"book it(?:\s+(?:on|at|for))?|"
    r"for the appointment(?:\s+(?:on|at|for))?|"
    r"for my appointment(?:\s+(?:on|at|for))?|"
    r"i want it(?:\s+(?:on|at|for))?|"
    r"on|at|for|around|in the|am|pm"
    r")(?:[.!?]|\s.*)?$",
    re.IGNORECASE,
)
EXPECTED_SLOT_HESITATION_PREFIX_RE = re.compile(
    r"^(?:(?:uh|um|er|hmm|ah|well|so|like|you know|i mean|let me think)[\s,.;:!?-]*)+",
    re.IGNORECASE,
)
EXPECTED_SLOT_DANGLING_LEAD_IN_RE = re.compile(
    r"(?:\b(?:at|on|for|around|about|between|in|in the|this|next|after|before|from|to)\b|(?:am|pm)|[,:-])\s*$",
    re.IGNORECASE,
)


def _normalize_text(text: Optional[str]) -> str:
    return " ".join((text or "").split()).strip()


def _strip_terminal_punctuation(text: Optional[str]) -> str:
    return re.sub(r"[\s.,!?;:]+$", "", text or "").strip()


def _extract_date_phrase(text: str) -> Optional[str]:
    match = DATE_PHRASE_RE.search(text)
    if not match:
        return None
    return _strip_terminal_punctuation(match.group(0))


def _extract_time_phrase(text: str) -> Optional[str]:
    match = TIME_PHRASE_RE.search(text)
    if not match:
        return None
    return _strip_terminal_punctuation(match.group(0))


def _service_phrase(service: Optional[str]) -> str:
    cleaned = _normalize_text(service)
    if not cleaned:
        return "appointment"
    return f"{cleaned.lower()} appointment"


def _looks_like_clinic_info_request(text: str) -> bool:
    normalized = _normalize_text(text).lower()
    if not normalized:
        return False
    if CLINIC_INFO_INTENT_RE.search(normalized):
        return True
    if not INFORMATION_REQUEST_RE.search(normalized):
        return False
    return not BOOKING_INTENT_RE.search(normalized)


def _with_optional_ack(base_text: str, *, name: Optional[str], filler_spoken: bool) -> str:
    clean = _normalize_text(base_text)
    if filler_spoken:
        return clean
    if name:
        return f"Sure, {name}. {clean}"
    return f"Sure. {clean}"


def strip_duplicate_acknowledgement(text: str) -> str:
    return ACK_PREFIX_RE.sub("", _normalize_text(text), count=1) or _normalize_text(text)


def _token_count(text: str) -> int:
    return len(re.findall(r"[a-z0-9']+", text.lower()))


def _is_weak_fragment(text: str, max_tokens: int) -> bool:
    normalized = _normalize_text(text).lower()
    if not normalized:
        return False
    if WEAK_FRAGMENT_RE.match(normalized):
        return True
    return (
        _token_count(normalized) <= max_tokens
        and not has_date_reference(normalized)
        and not has_time_reference(normalized)
        and not extract_reason_quick(normalized)
    )


def _strip_expected_slot_prefixes(text: str) -> str:
    normalized = _normalize_text(text).lower()
    normalized = EXPECTED_SLOT_HESITATION_PREFIX_RE.sub("", normalized).strip(" ,.;:!?-")
    return normalized


def _is_expected_slot_continuation_fragment(
    text: str,
    *,
    expected_slot: Optional[str],
    expected_slot_status: Optional[str],
    max_tokens: int,
) -> bool:
    if expected_slot not in {
        ExpectedUserSlot.DATE.value,
        ExpectedUserSlot.TIME.value,
        ExpectedUserSlot.DATE_TIME.value,
    }:
        return False
    if expected_slot_status == "satisfied":
        return False

    normalized = _normalize_text(text).lower()
    if not normalized:
        return False

    stripped = _strip_expected_slot_prefixes(normalized)
    if WEAK_FRAGMENT_RE.match(normalized) or (stripped and WEAK_FRAGMENT_RE.match(stripped)):
        return True
    if EXPECTED_SLOT_DANGLING_LEAD_IN_RE.search(normalized):
        return True
    if stripped and EXPECTED_SLOT_DANGLING_LEAD_IN_RE.search(stripped):
        return True
    if not stripped:
        return True
    return _is_weak_fragment(stripped, max_tokens)


def _state_has_date(state: PatientState) -> bool:
    return bool(state.dt_local or (state.dt_text and has_date_reference(state.dt_text)))


def _state_has_time(state: PatientState) -> bool:
    return bool(state.dt_local or (state.dt_text and has_time_reference(state.dt_text)))


class StreamingTurnTracker:
    def __init__(self, config: TurnTakingConfig):
        self.config = config
        self._logical_turn_id = 0
        self._expected_user_slot: Optional[ExpectedUserSlot] = None
        self.snapshot = TurnTrackerSnapshot()

    @property
    def expected_user_slot(self) -> Optional[str]:
        return self._expected_user_slot.value if self._expected_user_slot else None

    def start_new_turn(self) -> TurnTrackerSnapshot:
        self._logical_turn_id += 1
        self.snapshot = TurnTrackerSnapshot(
            logical_turn_id=self._logical_turn_id,
            expected_user_slot=self.expected_user_slot,
        )
        return self.snapshot

    def ensure_turn(self) -> TurnTrackerSnapshot:
        if self.snapshot.logical_turn_id == 0:
            return self.start_new_turn()
        return self.snapshot

    def mark_waiting_for_continuation(self, waiting: bool) -> None:
        self.ensure_turn().awaiting_continuation = waiting

    def mark_filler_spoken(self, text: Optional[str]) -> None:
        snap = self.ensure_turn()
        snap.filler_spoken_for_turn = True
        snap.filler_text_for_turn = _normalize_text(text)

    def mark_main_response_started(self) -> None:
        self.ensure_turn().main_response_started = True
        self.snapshot.awaiting_continuation = False

    def set_expected_user_slot(self, slot: Optional[str | ExpectedUserSlot]) -> None:
        if slot is None:
            self.clear_expected_user_slot()
            return
        self._expected_user_slot = (
            slot if isinstance(slot, ExpectedUserSlot) else ExpectedUserSlot(str(slot))
        )
        self.ensure_turn().expected_user_slot = self._expected_user_slot.value

    def clear_expected_user_slot(self) -> None:
        self._expected_user_slot = None
        self.ensure_turn().expected_user_slot = None
        self.snapshot.expected_slot_status = None

    def ingest_transcript(
        self,
        text: Optional[str],
        *,
        is_final: bool,
        patient_state: PatientState,
        silence_ms: Optional[int] = None,
    ) -> TurnTrackerSnapshot:
        snap = self.ensure_turn()
        normalized = _normalize_text(text)
        snap.silence_ms = silence_ms

        if is_final:
            snap.latest_finalized_text = normalized
            if normalized:
                if snap.current_turn_accumulated_text:
                    if normalized not in snap.current_turn_accumulated_text:
                        snap.current_turn_accumulated_text = (
                            f"{snap.current_turn_accumulated_text} {normalized}"
                        ).strip()
                else:
                    snap.current_turn_accumulated_text = normalized
                snap.final_segment_count += 1
            snap.raw_partial_text = ""
            snap.normalized_partial_text = ""
        else:
            snap.raw_partial_text = text or ""
            snap.normalized_partial_text = normalized

        text_for_analysis = snap.current_turn_accumulated_text or normalized
        self._refresh_slot_state(snap, text_for_analysis, patient_state)
        self._classify_completion(snap)
        self._populate_deterministic_route(snap, patient_state)
        return snap

    def _refresh_slot_state(
        self,
        snap: TurnTrackerSnapshot,
        text: str,
        patient_state: PatientState,
    ) -> None:
        normalized = _normalize_text(text).lower()
        snap.expected_user_slot = self.expected_user_slot
        snap.expected_slot_status = None
        snap.self_introduction_in_progress = bool(
            INTRO_PREFIX_ONLY_RE.search(normalized)
            or (INTRO_PARTIAL_NAME_RE.search(normalized) and not extract_name_quick(text))
        )
        snap.request_phrase_in_progress = bool(
            REQUEST_PREFIX_ONLY_RE.search(normalized)
            or (REQUEST_LEAD_IN_RE.search(normalized) and not extract_reason_quick(text))
            or SERVICE_REQUEST_RE.search(normalized)
        )
        snap.syntactically_incomplete = bool(
            snap.self_introduction_in_progress
            or REQUEST_PREFIX_ONLY_RE.search(normalized)
            or TRAILING_INCOMPLETE_RE.search(normalized)
            or normalized.endswith(("hello", "hi"))
        )
        snap.semantically_incomplete = bool(
            snap.request_phrase_in_progress
            or (normalized.endswith("this is") or normalized.endswith("my name is"))
            or (has_date_reference(normalized) and normalized.endswith("at"))
        )

        detected_name = extract_name_quick(text) or patient_state.full_name
        if detected_name:
            snap.caller_name = _strip_terminal_punctuation(detected_name)
            snap.caller_name_confidence = 0.95 if extract_name_quick(text) else 0.8

        detected_service = extract_reason_quick(text) or patient_state.reason
        if detected_service:
            snap.service = detected_service
            snap.service_confidence = 0.92 if extract_reason_quick(text) else 0.8

        date_phrase = _extract_date_phrase(text)
        if date_phrase or _state_has_date(patient_state):
            snap.preferred_date = date_phrase or patient_state.dt_text or (
                patient_state.dt_local.strftime("%A") if patient_state.dt_local else None
            )
            snap.preferred_date_confidence = 0.85 if date_phrase else 0.75

        time_phrase = _extract_time_phrase(text)
        if time_phrase or _state_has_time(patient_state):
            snap.preferred_time = time_phrase or (
                patient_state.dt_local.strftime("%I:%M %p").lstrip("0")
                if patient_state.dt_local
                else patient_state.dt_text
            )
            snap.preferred_time_confidence = 0.85 if time_phrase else 0.75

        if RESCHEDULE_INTENT_RE.search(normalized):
            snap.intent = "reschedule"
            snap.intent_confidence = 0.95
        elif CANCELLATION_INTENT_RE.search(normalized):
            snap.intent = "cancellation"
            snap.intent_confidence = 0.95
        elif LOOKUP_INTENT_RE.search(normalized):
            snap.intent = "appointment_lookup"
            snap.intent_confidence = 0.88
        elif _looks_like_clinic_info_request(normalized):
            snap.intent = "clinic_info"
            snap.intent_confidence = 0.84
        elif BOOKING_INTENT_RE.search(normalized) or (
            REQUEST_LEAD_IN_RE.search(normalized) and snap.service
        ):
            snap.intent = "booking"
            snap.intent_confidence = 0.9 if BOOKING_INTENT_RE.search(normalized) else 0.72
        elif TOOTH_ISSUE_RE.search(normalized):
            snap.intent = "general_issue"
            snap.intent_confidence = 0.68
        elif GENERAL_INQUIRY_RE.search(normalized):
            snap.intent = "general_inquiry"
            snap.intent_confidence = 0.6

        self._evaluate_expected_slot(snap, text, patient_state)

    def _evaluate_expected_slot(
        self,
        snap: TurnTrackerSnapshot,
        text: str,
        patient_state: PatientState,
    ) -> None:
        expected_slot = self._expected_user_slot
        if expected_slot is None:
            snap.expected_slot_status = None
            return

        has_date = has_date_reference(text)
        has_time = has_time_reference(text)

        if expected_slot == ExpectedUserSlot.DATE_TIME:
            if has_date and has_time:
                snap.expected_slot_status = "satisfied"
            elif has_date:
                snap.expected_slot_status = "partial_date"
            elif has_time and _state_has_date(patient_state):
                snap.expected_slot_status = "partial_time"
            else:
                snap.expected_slot_status = "unsatisfied"
            return

        if expected_slot == ExpectedUserSlot.DATE:
            snap.expected_slot_status = "satisfied" if has_date else "unsatisfied"
            return

        if expected_slot == ExpectedUserSlot.TIME:
            snap.expected_slot_status = "satisfied" if has_time else "unsatisfied"
            return

        if expected_slot == ExpectedUserSlot.SERVICE:
            snap.expected_slot_status = "satisfied" if bool(snap.service) else "unsatisfied"
            return

        if expected_slot == ExpectedUserSlot.PHONE_CONFIRMATION:
            snap.expected_slot_status = (
                "satisfied" if resolve_confirmation_intent(text) is not None else "unsatisfied"
            )
            return

        snap.expected_slot_status = None

    def _classify_completion(self, snap: TurnTrackerSnapshot) -> None:
        reasons: list[str] = []
        text = _normalize_text(snap.current_turn_accumulated_text or snap.normalized_partial_text)
        silence_ms = snap.silence_ms

        if snap.normalized_partial_text and not snap.latest_finalized_text:
            snap.completion_label = CompletionLabel.INCOMPLETE
            snap.completion_reasons = ["timing:partial_transcript"]
            return

        if not text:
            snap.completion_label = CompletionLabel.INCOMPLETE
            snap.completion_reasons = ["text:empty"]
            return

        if silence_ms is not None:
            if silence_ms < self.config.short_pause_ms:
                reasons.append("timing:pause_short")
            else:
                reasons.append("timing:pause_long")

        if snap.self_introduction_in_progress:
            reasons.append("pattern:self_intro_prefix")
        if snap.request_phrase_in_progress:
            reasons.append("pattern:request_phrase_in_progress")
        if snap.syntactically_incomplete:
            reasons.append("syntax:incomplete")
        if snap.semantically_incomplete:
            reasons.append("semantic:incomplete")
        if snap.caller_name and snap.caller_name_confidence >= 0.9:
            reasons.append("slot:name_captured")
        if snap.service and snap.service_confidence >= 0.85:
            reasons.append("slot:service_captured")
        if snap.intent:
            reasons.append(f"semantic:{snap.intent}_intent_clear")
        if snap.expected_user_slot:
            reasons.append(f"expected_slot:{snap.expected_user_slot}")
            if snap.expected_slot_status:
                reasons.append(f"expected_slot_status:{snap.expected_slot_status}")

        if (
            snap.expected_user_slot in {
                ExpectedUserSlot.DATE.value,
                ExpectedUserSlot.TIME.value,
                ExpectedUserSlot.DATE_TIME.value,
            }
            and snap.expected_slot_status in {"unsatisfied", "partial_date", "partial_time"}
        ):
            reasons.append("expected_slot_unsatisfied")
            reasons.append(f"slot:{snap.expected_user_slot}_missing")
            if _is_expected_slot_continuation_fragment(
                text,
                expected_slot=snap.expected_user_slot,
                expected_slot_status=snap.expected_slot_status,
                max_tokens=self.config.expected_slot_weak_fragment_max_tokens,
            ):
                reasons.extend(["semantic:weak_fragment", "continuation:await_more_input"])
                snap.completion_label = CompletionLabel.LIKELY_CONTINUING
                snap.completion_reasons = reasons
                return

        if snap.syntactically_incomplete and not snap.service and not snap.preferred_date and not snap.preferred_time:
            snap.completion_label = CompletionLabel.LIKELY_CONTINUING
            snap.completion_reasons = reasons or ["syntax:incomplete"]
            return

        if (
            snap.semantically_incomplete
            and silence_ms is not None
            and silence_ms < self.config.short_pause_ms
        ):
            snap.completion_label = CompletionLabel.LIKELY_CONTINUING
            snap.completion_reasons = reasons or ["semantic:incomplete"]
            return

        if snap.intent and snap.intent_confidence >= self.config.low_confidence_threshold:
            snap.completion_label = CompletionLabel.COMPLETE
            snap.completion_reasons = reasons or ["semantic:turn_complete"]
            return

        snap.completion_label = CompletionLabel.COMPLETE
        snap.completion_reasons = reasons or ["semantic:turn_complete"]

    def _populate_deterministic_route(
        self,
        snap: TurnTrackerSnapshot,
        patient_state: PatientState,
    ) -> None:
        snap.actionable = False
        snap.deterministic_next_step = None
        snap.deterministic_response = None

        if not self.config.deterministic_fast_path_enabled:
            return

        known_name = snap.caller_name or patient_state.full_name
        known_service = snap.service or patient_state.reason
        has_date = bool(snap.preferred_date or _state_has_date(patient_state))
        has_time = bool(snap.preferred_time or _state_has_time(patient_state))
        phone_known = bool(
            patient_state.phone_e164
            or patient_state.phone_pending
            or patient_state.detected_phone
        )
        expected_slot = self._expected_user_slot
        capture_routes = {
            "booking.capture_datetime",
            "booking.capture_date",
            "booking.capture_time",
        }

        if expected_slot and self.config.expected_slot_enable_date_time_fast_path:
            if expected_slot == ExpectedUserSlot.DATE_TIME:
                if snap.expected_slot_status == "satisfied":
                    snap.actionable = True
                    snap.deterministic_next_step = "booking.capture_datetime"
                elif snap.expected_slot_status == "partial_date":
                    snap.actionable = True
                    snap.deterministic_next_step = "booking.capture_date"
                elif snap.expected_slot_status == "partial_time":
                    snap.actionable = True
                    snap.deterministic_next_step = "booking.capture_time"
                elif snap.expected_slot_status == "unsatisfied":
                    return
            elif expected_slot == ExpectedUserSlot.DATE:
                if snap.expected_slot_status == "satisfied":
                    snap.actionable = True
                    snap.deterministic_next_step = "booking.capture_date"
                elif snap.expected_slot_status == "unsatisfied":
                    return
            elif expected_slot == ExpectedUserSlot.TIME:
                if snap.expected_slot_status == "satisfied":
                    snap.actionable = True
                    snap.deterministic_next_step = "booking.capture_time"
                elif snap.expected_slot_status == "unsatisfied":
                    return
            elif expected_slot == ExpectedUserSlot.SERVICE:
                if snap.expected_slot_status == "satisfied":
                    snap.actionable = True
                    if not has_date and not has_time:
                        snap.deterministic_next_step = "booking.ask_date_time"
                        snap.deterministic_response = _with_optional_ack(
                            f"What day and time would you like for your {_service_phrase(known_service)}?",
                            name=known_name,
                            filler_spoken=snap.filler_spoken_for_turn,
                        )
                    elif has_date and not has_time:
                        snap.deterministic_next_step = "booking.ask_time"
                        snap.deterministic_response = _with_optional_ack(
                            f"What time works best for your {_service_phrase(known_service)}?",
                            name=known_name,
                            filler_spoken=snap.filler_spoken_for_turn,
                        )
                    elif has_time and not has_date:
                        snap.deterministic_next_step = "booking.ask_date"
                        snap.deterministic_response = _with_optional_ack(
                            f"What day would you like for your {_service_phrase(known_service)}?",
                            name=known_name,
                            filler_spoken=snap.filler_spoken_for_turn,
                        )
                    else:
                        snap.deterministic_next_step = "booking.route_existing_flow"
                elif snap.expected_slot_status == "unsatisfied":
                    return

        if (
            snap.deterministic_next_step is None
            and snap.intent == "booking"
            and snap.intent_confidence >= self.config.low_confidence_threshold
        ):
            snap.actionable = True
            if not known_service:
                snap.deterministic_next_step = "booking.ask_service"
                snap.deterministic_response = _with_optional_ack(
                    "Can you tell me which service you'd like to book?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            elif not has_date and not has_time:
                snap.deterministic_next_step = "booking.ask_date_time"
                snap.deterministic_response = _with_optional_ack(
                    f"What day and time would you like for your {_service_phrase(known_service)}?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            elif has_date and not has_time:
                snap.deterministic_next_step = "booking.ask_time"
                snap.deterministic_response = _with_optional_ack(
                    f"What time works best for your {_service_phrase(known_service)}?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            elif has_time and not has_date:
                snap.deterministic_next_step = "booking.ask_date"
                snap.deterministic_response = _with_optional_ack(
                    f"What day would you like for your {_service_phrase(known_service)}?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            else:
                snap.deterministic_next_step = "booking.route_existing_flow"

        elif (
            snap.deterministic_next_step is None
            and snap.intent in {"reschedule", "cancellation"}
            and snap.intent_confidence >= self.config.low_confidence_threshold
        ):
            snap.actionable = True
            if not phone_known and not known_name:
                snap.deterministic_next_step = f"{snap.intent}.ask_identifier"
                snap.deterministic_response = _with_optional_ack(
                    "What phone number or name is the appointment under?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            elif not phone_known:
                snap.deterministic_next_step = f"{snap.intent}.ask_phone"
                snap.deterministic_response = _with_optional_ack(
                    "What phone number is the appointment under?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )
            else:
                snap.deterministic_next_step = f"{snap.intent}.lookup_existing"

        elif (
            snap.deterministic_next_step is None
            and snap.intent == "appointment_lookup"
            and snap.intent_confidence >= self.config.low_confidence_threshold
        ):
            snap.actionable = True
            if phone_known:
                snap.deterministic_next_step = "appointment.lookup_existing"
            else:
                snap.deterministic_next_step = "appointment.ask_phone"
                snap.deterministic_response = _with_optional_ack(
                    "What phone number is the appointment under?",
                    name=known_name,
                    filler_spoken=snap.filler_spoken_for_turn,
                )

        elif (
            snap.deterministic_next_step is None
            and snap.intent == "clinic_info"
            and snap.intent_confidence >= self.config.low_confidence_threshold
        ):
            snap.actionable = True
            snap.deterministic_next_step = "clinic_info.answer"

        elif (
            snap.deterministic_next_step is None
            and snap.intent == "general_issue"
            and snap.intent_confidence >= self.config.low_confidence_threshold
        ):
            snap.actionable = True
            snap.deterministic_next_step = "general_issue.ask_clarification"
            snap.deterministic_response = _with_optional_ack(
                "Can you tell me a little more about the issue?",
                name=known_name,
                filler_spoken=snap.filler_spoken_for_turn,
            )

        if snap.actionable and snap.completion_label == CompletionLabel.COMPLETE:
            snap.completion_label = CompletionLabel.COMPLETE_AND_ACTIONABLE
            if snap.deterministic_next_step:
                snap.completion_reasons.append(f"actionable:{snap.deterministic_next_step}")


def choose_contextual_filler(snapshot: TurnTrackerSnapshot) -> Optional[str]:
    if snapshot.completion_label in {CompletionLabel.INCOMPLETE, CompletionLabel.LIKELY_CONTINUING}:
        return None
    if snapshot.filler_spoken_for_turn:
        return None
    if snapshot.deterministic_response:
        return None
    if snapshot.intent == "clinic_info":
        service = (snapshot.service or extract_reason_quick(snapshot.current_turn_accumulated_text or "") or "").strip()
        text = (snapshot.current_turn_accumulated_text or snapshot.latest_finalized_text or "").lower()
        if service:
            return f"Sure, let me pull the details on {service.lower()} for you."
        if re.search(r"\b(doctor|dr\.?|dentist|provider|staff|team)\b", text):
            return "Sure, let me pull the doctor details for you."
        if re.search(r"\b(price|prices|pricing|cost|costs|fee|fees|rate|rates)\b", text):
            return "Sure, let me pull the pricing details for you."
        if re.search(r"\b(insurance|coverage|covered|accept|take)\b", text):
            return "Sure, let me pull the insurance details for you."
        if re.search(r"\b(location|address|parking|park|metro|station|transit)\b", text):
            return "Sure, let me pull those location details for you."
        return "Sure, let me pull those details for you."
    if snapshot.intent in {"appointment_lookup", "reschedule", "cancellation"}:
        return "Let me check that for you."
    if snapshot.intent == "general_inquiry":
        return "Of course."
    return None


def _build_expected_slot_reprompt(
    snapshot: TurnTrackerSnapshot,
    patient_state: PatientState,
    *,
    filler_spoken: bool,
) -> Optional[str]:
    expected_slot = snapshot.expected_user_slot
    known_name = snapshot.caller_name or patient_state.full_name
    known_service = snapshot.service or patient_state.reason

    if expected_slot == ExpectedUserSlot.SERVICE.value:
        return _with_optional_ack(
            "Can you tell me which service you'd like to book?",
            name=known_name,
            filler_spoken=filler_spoken,
        )
    if expected_slot == ExpectedUserSlot.DATE_TIME.value:
        if snapshot.expected_slot_status == "partial_date":
            return _with_optional_ack(
                f"What time works best for your {_service_phrase(known_service)}?",
                name=known_name,
                filler_spoken=filler_spoken,
            )
        if snapshot.expected_slot_status == "partial_time":
            return _with_optional_ack(
                f"What day would you like for your {_service_phrase(known_service)}?",
                name=known_name,
                filler_spoken=filler_spoken,
            )
        return _with_optional_ack(
            f"What day and time would you like for your {_service_phrase(known_service)}?",
            name=known_name,
            filler_spoken=filler_spoken,
        )
    if expected_slot == ExpectedUserSlot.DATE.value:
        return _with_optional_ack(
            f"What day would you like for your {_service_phrase(known_service)}?",
            name=known_name,
            filler_spoken=filler_spoken,
        )
    if expected_slot == ExpectedUserSlot.TIME.value:
        return _with_optional_ack(
            f"What time works best for your {_service_phrase(known_service)}?",
            name=known_name,
            filler_spoken=filler_spoken,
        )
    return None


def _expected_slot_reprompt_route(snapshot: TurnTrackerSnapshot) -> Optional[str]:
    expected_slot = snapshot.expected_user_slot
    if not expected_slot:
        return None
    if expected_slot == ExpectedUserSlot.DATE_TIME.value:
        if snapshot.expected_slot_status == "partial_date":
            return "booking.reask_time"
        if snapshot.expected_slot_status == "partial_time":
            return "booking.reask_date"
    return f"booking.reask_{expected_slot}"


def build_policy_decision(
    snapshot: TurnTrackerSnapshot,
    patient_state: PatientState,
    config: TurnTakingConfig,
    *,
    after_continuation_wait: bool = False,
) -> PolicyDecision:
    reasons = list(snapshot.completion_reasons)
    filler_text = choose_contextual_filler(snapshot)
    expected_slot_reprompt = _build_expected_slot_reprompt(
        snapshot,
        patient_state,
        filler_spoken=snapshot.filler_spoken_for_turn,
    )

    if snapshot.completion_label in {CompletionLabel.INCOMPLETE, CompletionLabel.LIKELY_CONTINUING} and not after_continuation_wait:
        return PolicyDecision(
            action=PolicyAction.WAIT,
            completion_label=snapshot.completion_label,
            reasons=reasons + ["policy:wait_for_continuation"],
            wait_ms=(
                config.expected_slot_continuation_wait_ms
                if snapshot.expected_user_slot
                and snapshot.expected_slot_status in {"unsatisfied", "partial_date", "partial_time"}
                else config.continuation_wait_ms
            ),
        )

    if after_continuation_wait and snapshot.completion_label in {
        CompletionLabel.INCOMPLETE,
        CompletionLabel.LIKELY_CONTINUING,
    }:
        if expected_slot_reprompt:
            return PolicyDecision(
                action=PolicyAction.FAST_PATH,
                completion_label=CompletionLabel.COMPLETE,
                reasons=reasons + ["policy:expected_slot_reprompt"],
                response_text=expected_slot_reprompt,
                deterministic_route=_expected_slot_reprompt_route(snapshot),
            )
        return PolicyDecision(
            action=PolicyAction.LLM,
            completion_label=CompletionLabel.COMPLETE,
            reasons=reasons + ["policy:llm_after_wait"],
            filler_text=None,
            llm_instruction=(
                "The caller paused and may still be gathering their thought. If the request "
                "is still incomplete, briefly invite them to continue. Otherwise proceed naturally."
            ),
        )

    if snapshot.deterministic_response:
        return PolicyDecision(
            action=PolicyAction.FAST_PATH,
            completion_label=snapshot.completion_label,
            reasons=reasons + ["policy:deterministic_fast_path"],
            response_text=snapshot.deterministic_response,
            deterministic_route=snapshot.deterministic_next_step,
        )

    if snapshot.deterministic_next_step in {
        "booking.capture_datetime",
        "booking.capture_date",
        "booking.capture_time",
        "clinic_info.answer",
    }:
        return PolicyDecision(
            action=PolicyAction.FAST_PATH,
            completion_label=CompletionLabel.COMPLETE_AND_ACTIONABLE,
            reasons=reasons + [
                "policy:clinic_info_fast_path"
                if snapshot.deterministic_next_step == "clinic_info.answer"
                else "policy:expected_slot_fast_path"
            ],
            filler_text=(
                filler_text
                if snapshot.deterministic_next_step == "clinic_info.answer"
                else None
            ),
            deterministic_route=snapshot.deterministic_next_step,
        )

    if snapshot.deterministic_next_step in {
        "appointment.lookup_existing",
        "reschedule.lookup_existing",
        "cancellation.lookup_existing",
    }:
        return PolicyDecision(
            action=PolicyAction.LOOKUP,
            completion_label=snapshot.completion_label,
            reasons=reasons + ["policy:lookup_existing_flow"],
            filler_text=filler_text or "Let me check that for you.",
            deterministic_route=snapshot.deterministic_next_step,
            lookup_tool="find_existing_appointment",
        )

    if snapshot.filler_spoken_for_turn:
        return PolicyDecision(
            action=PolicyAction.LLM,
            completion_label=snapshot.completion_label,
            reasons=reasons + ["policy:llm_after_filler"],
            filler_text=None,
            llm_instruction=(
                "An acknowledgement was already spoken this turn. Continue naturally "
                "without repeating another acknowledgement like 'Sure', 'Of course', "
                "'Absolutely', or 'Got it'."
            ),
        )

    return PolicyDecision(
        action=PolicyAction.LLM,
        completion_label=snapshot.completion_label,
        reasons=reasons + ["policy:llm_default"],
        filler_text=filler_text,
    )


def preview_turn(
    text: str,
    *,
    patient_state: Optional[PatientState] = None,
    silence_ms: Optional[int] = None,
    filler_spoken: bool = False,
    expected_user_slot: Optional[str] = None,
    config: Optional[TurnTakingConfig] = None,
) -> tuple[TurnTrackerSnapshot, PolicyDecision]:
    state = patient_state or PatientState()
    tracker = StreamingTurnTracker(config or TurnTakingConfig())
    tracker.start_new_turn()
    if expected_user_slot:
        tracker.set_expected_user_slot(expected_user_slot)
    snapshot = tracker.ingest_transcript(
        text,
        is_final=True,
        patient_state=state,
        silence_ms=silence_ms,
    )
    if filler_spoken:
        tracker.mark_filler_spoken("Sure.")
        snapshot = tracker.ingest_transcript(
            snapshot.current_turn_accumulated_text or text,
            is_final=True,
            patient_state=state,
            silence_ms=silence_ms,
        )
    return snapshot, build_policy_decision(snapshot, state, tracker.config)


def format_tracker_log(snapshot: TurnTrackerSnapshot) -> str:
    return (
        f"turn={snapshot.logical_turn_id} "
        f"text='{snapshot.current_turn_accumulated_text or snapshot.normalized_partial_text}' "
        f"name={snapshot.caller_name or '-'}({snapshot.caller_name_confidence:.2f}) "
        f"intent={snapshot.intent or '-'}({snapshot.intent_confidence:.2f}) "
        f"service={snapshot.service or '-'}({snapshot.service_confidence:.2f}) "
        f"date={snapshot.preferred_date or '-'}({snapshot.preferred_date_confidence:.2f}) "
        f"time={snapshot.preferred_time or '-'}({snapshot.preferred_time_confidence:.2f}) "
        f"incomplete={snapshot.syntactically_incomplete or snapshot.semantically_incomplete} "
        f"actionable={snapshot.actionable} "
        f"deterministic={snapshot.deterministic_next_step or '-'} "
        f"expected_slot={snapshot.expected_user_slot or '-'}({snapshot.expected_slot_status or '-'}) "
        f"filler_spoken={snapshot.filler_spoken_for_turn}"
    )


def format_policy_log(decision: PolicyDecision) -> str:
    return (
        f"action={decision.action.value} "
        f"completion={decision.completion_label.value} "
        f"route={decision.deterministic_route or '-'} "
        f"lookup_tool={decision.lookup_tool or '-'} "
        f"filler={decision.filler_text or '-'} "
        f"reasons={decision.reasons}"
    )
