"""
Normalized clinic knowledge sync and deterministic answer selection.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Optional, Sequence, cast

from openai import AsyncOpenAI

from config import logger, supabase
from models.state import PatientState
from services.extraction_service import (
    DENTAL_SERVICE_MAP,
    SPA_SERVICE_MAP,
    _STT_APPROXIMATIONS,
    extract_reason_quick,
)
from utils.cache import TTLCache

EmbeddingGenerator = Callable[[str], Awaitable[list[float]]]
ClinicAnswerHumanizer = Callable[[str, str, Optional[str]], Awaitable[str]]

CLINIC_KNOWLEDGE_CACHE_TTL = int(os.getenv("CLINIC_KNOWLEDGE_CACHE_TTL", "120"))
CLINIC_KNOWLEDGE_EMBEDDING_MODEL = os.getenv(
    "CLINIC_KNOWLEDGE_EMBEDDING_MODEL",
    "text-embedding-3-small",
)
CLINIC_KNOWLEDGE_QUERY_EMBED_CACHE_SIZE = max(
    16,
    int(os.getenv("CLINIC_KNOWLEDGE_QUERY_EMBED_CACHE_SIZE", "256")),
)

SERVICE_SPECIFIC_SUBTYPES = {"service_price", "service_duration", "service_description"}
FAQ_SUBTYPES = {
    "hours",
    "location",
    "parking",
    "insurance",
    "payment",
    "policy",
    "staff",
    "emergency",
    "general_faq",
}
SERVICE_LIST_SUBTYPES = {"service_list"}
GENERIC_SERVICE_BOUNDARY_TERMS = {
    "teeth whitening",
    "whitening",
    "root canal",
    "root canal therapy",
    "night guard",
    "night guards",
    "cleaning",
    "exam",
    "checkup",
    "check-up",
    "consultation",
    "filling",
    "crown",
    "extraction",
}
QUESTION_SPLIT_RE = re.compile(r"[.!?]\s+|\n+")
PRICE_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d{1,2})?")
DURATION_MINUTES_RE = re.compile(r"\b(\d{1,3})\s*(minutes?|mins?)\b", re.IGNORECASE)
DURATION_HOURS_RE = re.compile(
    r"\b(?:(\d+(?:\.\d+)?)\s*(hours?|hrs?)|(an hour|a half hour|half an hour|one hour|two hours))\b",
    re.IGNORECASE,
)
TIME_RANGE_RE = re.compile(
    r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b",
    re.IGNORECASE,
)
SHORT_SWITCH_RE = re.compile(r"\b(?:what about|how about|and|instead)\b", re.IGNORECASE)
SERVICE_LIST_RE = re.compile(
    r"\b(?:what services|which services|services do you offer|what do you offer|available services|services)\b",
    re.IGNORECASE,
)
PRICE_RE_QUESTION = re.compile(
    r"\b(?:price|prices|pricing|cost|costs|fee|fees|rate|rates|how much)\b",
    re.IGNORECASE,
)
DURATION_RE_QUESTION = re.compile(
    r"\b(?:how long|duration|how much time|how long does .* take|time does .* take|timing)\b",
    re.IGNORECASE,
)
DESCRIPTION_RE_QUESTION = re.compile(
    r"\b(?:tell me about|what is|what's|describe|explain|guide me(?: about| on)?|does .* include|what about|more (?:info|information) (?:about|on))\b",
    re.IGNORECASE,
)
HOURS_RE = re.compile(r"\b(?:hours|open|close|closing|when are you open)\b", re.IGNORECASE)
LOCATION_RE = re.compile(r"\b(?:location|located|address|where are you)\b", re.IGNORECASE)
PARKING_RE = re.compile(r"\b(?:parking|park)\b", re.IGNORECASE)
INSURANCE_RE = re.compile(r"\b(?:insurance|coverage|covered|delta dental|aetna|cigna|metlife|ppo)\b", re.IGNORECASE)
PAYMENT_RE = re.compile(r"\b(?:payment|payments|pay|visa|mastercard|master card|amex|cash|carecredit|financing)\b", re.IGNORECASE)
POLICY_RE = re.compile(r"\b(?:policy|cancel|cancellation|reschedule|late fee|privacy|hipaa|aftercare)\b", re.IGNORECASE)
STAFF_RE = re.compile(r"\b(?:doctor|dentist|provider|staff|team|who works there|name of the doctor)\b", re.IGNORECASE)
EMERGENCY_RE = re.compile(r"\b(?:emergency|urgent|same day)\b", re.IGNORECASE)
GENERAL_INFO_RE = re.compile(
    r"\b(?:what|when|where|how|do you|can you|could you|would you|tell me)\b",
    re.IGNORECASE,
)
AMBIGUOUS_FRAGMENT_RE = re.compile(
    r"^(?:what about|about that|the pricing|pricing|the price|price|the cost|cost|services|service|how long|duration)$",
    re.IGNORECASE,
)
GENERATED_TITLES = {"clinic hours", "services overview", "service pricing"}
GENERIC_NON_SERVICE_TITLES = {
    "methods",
    "providers",
    "cancellation",
    "privacy",
    "clinic hours",
    "service pricing",
    "services overview",
    "parking",
    "location",
    "hours",
}
QUESTION_STOPWORDS = {
    "a",
    "about",
    "and",
    "are",
    "can",
    "cost",
    "costs",
    "details",
    "do",
    "for",
    "get",
    "have",
    "how",
    "i",
    "is",
    "it",
    "like",
    "long",
    "much",
    "of",
    "offer",
    "pricing",
    "price",
    "services",
    "take",
    "tell",
    "that",
    "the",
    "they",
    "time",
    "what",
    "which",
    "you",
}
CLINIC_SUBTYPE_TO_FACT_FILTER = {
    "hours": "hours",
    "location": "location",
    "parking": "parking",
    "insurance": "insurance",
    "payment": "payment",
    "policy": "policy",
    "staff": "staff",
    "emergency": "emergency",
}
WEEKDAY_LABELS = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}

_bundle_cache = TTLCache(ttl_seconds=CLINIC_KNOWLEDGE_CACHE_TTL)
_sync_locks: dict[str, asyncio.Lock] = {}
_query_embedding_cache: dict[str, list[float]] = {}
_openai_client: AsyncOpenAI | None = None


@dataclass(slots=True)
class ServiceRecord:
    id: str
    organization_id: str
    clinic_id: str
    canonical_name: str
    display_name: str
    normalized_name: str
    active: bool
    bookable: bool
    default_duration_minutes: int | None
    sort_order: int | None
    source_ref: str | None = None


@dataclass(slots=True)
class ServiceFactRecord:
    id: str
    organization_id: str
    clinic_id: str
    service_id: str
    fact_type: str
    answer_text: str
    structured_value_json: dict[str, Any]
    priority: int
    source_ref: str | None


@dataclass(slots=True)
class FaqChunkRecord:
    id: str
    organization_id: str
    clinic_id: str
    service_id: str | None
    category: str
    fact_type: str | None
    title: str | None
    chunk_text: str
    source_article_id: str | None = None
    source_ref: str | None = None
    chunk_index: int = 0


@dataclass(slots=True)
class ClinicKnowledgeBundle:
    clinic_id: str
    organization_id: str
    services: list[ServiceRecord] = field(default_factory=list)
    facts: list[ServiceFactRecord] = field(default_factory=list)
    faq_chunks: list[FaqChunkRecord] = field(default_factory=list)
    alias_map: dict[str, ServiceRecord] = field(default_factory=dict)
    clinic_name: str | None = None

    def service_by_id(self, service_id: str | None) -> ServiceRecord | None:
        if not service_id:
            return None
        for service in self.services:
            if service.id == service_id:
                return service
        return None

    def facts_for(self, service_id: str, fact_type: str) -> list[ServiceFactRecord]:
        matches = [
            fact
            for fact in self.facts
            if fact.service_id == service_id and fact.fact_type == fact_type
        ]
        matches.sort(key=lambda fact: fact.priority)
        return matches


@dataclass(slots=True)
class ClinicKnowledgeAnswer:
    subtype: str
    service_id: str | None
    service_name: str | None
    facts_used: list[str]
    fallback_used: bool
    confidence: float
    deterministic_text: str
    verbalizer_payload: dict[str, Any]
    critical_fact_values: list[str]


def _normalize_space(text: Any) -> str:
    return " ".join(str(text or "").split()).strip()


def _normalize_service_key(text: Any) -> str:
    normalized = _normalize_space(text).lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[()/,.:;+]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _normalize_text_for_hash(text: Any) -> str:
    normalized = _normalize_space(text).lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _hash_values(*values: Any) -> str:
    joined = "||".join(_normalize_text_for_hash(value) for value in values)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _to_vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def _question_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9']+", text.lower())
        if len(token) > 2 and token not in QUESTION_STOPWORDS
    }


def _unique_nonempty(values: Sequence[Any]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_space(value)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _service_reverse_alias_map(industry_type: str) -> dict[str, set[str]]:
    source = SPA_SERVICE_MAP if industry_type == "med_spa" else DENTAL_SERVICE_MAP
    reverse: dict[str, set[str]] = {}
    for alias, canonical in source.items():
        reverse.setdefault(_normalize_service_key(canonical), set()).add(alias)
    for alias, canonical in _STT_APPROXIMATIONS.items():
        reverse.setdefault(_normalize_service_key(canonical), set()).add(alias)
    return reverse


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        uuid.UUID(str(value))
        return True
    except Exception:
        return False


def _canonical_service_name(raw_name: str, *, industry_type: str) -> str:
    detected = extract_reason_quick(raw_name, industry_type=industry_type)
    return _normalize_space(detected or raw_name)


def _service_display_name(raw_name: str, *, canonical_name: str) -> str:
    cleaned = _normalize_space(raw_name)
    return cleaned or canonical_name


def _generate_service_aliases(
    display_name: str,
    canonical_name: str,
    *,
    industry_type: str,
) -> set[str]:
    aliases = {
        _normalize_space(display_name),
        _normalize_space(canonical_name),
    }
    stripped = re.sub(r"\([^)]*\)", "", display_name).strip()
    if stripped:
        aliases.add(stripped)
    canonical_key = _normalize_service_key(canonical_name)
    for alias in _service_reverse_alias_map(industry_type).get(canonical_key, set()):
        aliases.add(_normalize_space(alias))
    compact = re.sub(
        r"\b(?:treatment|therapy|procedure|appointment|service)\b",
        "",
        display_name,
        flags=re.IGNORECASE,
    )
    compact = _normalize_space(compact)
    if compact:
        aliases.add(compact)
    return {alias for alias in aliases if alias}


def _parse_numeric_price(text: str) -> float | None:
    if not text:
        return None
    match = PRICE_RE.search(text)
    if match:
        raw = match.group(0).replace("$", "").replace(",", "").strip()
    else:
        raw = str(text).replace(",", "").strip()
        if not re.fullmatch(r"\d+(?:\.\d{1,2})?", raw):
            return None
    try:
        return float(raw)
    except ValueError:
        return None


def _extract_price_mentions(text: str) -> list[str]:
    return list(dict.fromkeys(match.group(0).replace(" ", "") for match in PRICE_RE.finditer(text or "")))


def _duration_text_to_minutes(text: str) -> int | None:
    if not text:
        return None
    minute_match = DURATION_MINUTES_RE.search(text)
    if minute_match:
        return int(minute_match.group(1))
    hour_match = DURATION_HOURS_RE.search(text)
    if not hour_match:
        return None
    if hour_match.group(1):
        return int(round(float(hour_match.group(1)) * 60))
    phrase = (hour_match.group(3) or "").lower()
    if phrase in {"a half hour", "half an hour"}:
        return 30
    if phrase in {"two hours"}:
        return 120
    return 60


def _duration_minutes_to_text(minutes: int | None) -> str | None:
    if minutes is None:
        return None
    if minutes % 60 == 0 and minutes >= 60:
        hours = minutes // 60
        return "1 hour" if hours == 1 else f"{hours} hours"
    return f"{minutes} minutes"


def _format_currency(amount: float | int | None) -> str | None:
    if amount is None:
        return None
    value = float(amount)
    if math.isclose(value, round(value)):
        return f"${int(round(value))}"
    return f"${value:.2f}"


def _looks_like_specific_service_article(title: str, category: str) -> bool:
    normalized_title = _normalize_service_key(title)
    normalized_category = _normalize_service_key(category)
    if not normalized_title:
        return False
    if normalized_title in GENERATED_TITLES or normalized_title in GENERIC_NON_SERVICE_TITLES:
        return False
    if normalized_category in {"pricing", "services"}:
        return True
    return bool(
        re.search(r"\b(?:pricing|price|prices|cost|costs|service|services|details|information)\b$", normalized_title)
    )


def _service_name_from_article_title(title: str) -> str:
    cleaned = _normalize_space(title)
    cleaned = re.sub(
        r"\b(?:pricing|price|prices|cost|costs|service|services|details|information)\b$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" -:")
    return _normalize_space(cleaned or title)


def _fact_type_from_article(title: str, category: str, body: str) -> str:
    normalized_title = _normalize_text_for_hash(title)
    normalized_category = _normalize_text_for_hash(category)
    haystack = f"{normalized_title} {normalized_category} {_normalize_text_for_hash(body)}"
    if POLICY_RE.search(haystack):
        return "policy"
    if normalized_category == "hours" or HOURS_RE.search(haystack):
        return "hours"
    if LOCATION_RE.search(haystack):
        return "location"
    if PARKING_RE.search(haystack):
        return "parking"
    if INSURANCE_RE.search(haystack):
        return "insurance"
    if PAYMENT_RE.search(haystack):
        return "payment"
    if STAFF_RE.search(haystack):
        return "staff"
    if EMERGENCY_RE.search(haystack):
        return "emergency"
    if normalized_category in {"services", "pricing"}:
        return "description"
    return "general_faq"


def _format_clock(value: str | None) -> str | None:
    if not value:
        return None
    parsed = value.strip()
    try:
        hours, minutes, *_ = parsed.split(":")
        dt = datetime(2000, 1, 1, int(hours), int(minutes))
        return dt.strftime("%I:%M %p").lstrip("0")
    except Exception:
        return parsed


def _summarize_hours(rows: Sequence[dict[str, Any]], working_hours: dict[str, Any] | None = None) -> str | None:
    if rows:
        grouped: list[tuple[list[str], str]] = []
        current_days: list[str] = []
        current_value: str | None = None
        for row in sorted(rows, key=lambda item: int(item.get("weekday") or 0)):
            weekday = WEEKDAY_LABELS.get(int(row.get("weekday") or 0))
            if not weekday:
                continue
            closed = bool(row.get("closed"))
            if closed:
                value = "Closed"
            else:
                value = f"{_format_clock(str(row.get('open_time') or ''))} to {_format_clock(str(row.get('close_time') or ''))}"
            if value == current_value:
                current_days.append(weekday)
            else:
                if current_days and current_value:
                    grouped.append((current_days[:], current_value))
                current_days = [weekday]
                current_value = value
        if current_days and current_value:
            grouped.append((current_days[:], current_value))

        parts: list[str] = []
        for days, value in grouped:
            label = days[0]
            if len(days) > 1:
                label = f"{days[0]} through {days[-1]}"
            parts.append(f"{label}: {value}")
        if parts:
            return " ".join(parts) + "."

    if isinstance(working_hours, dict) and working_hours:
        parts: list[str] = []
        for idx, key in enumerate(
            ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        ):
            row = working_hours.get(key) or {}
            weekday = WEEKDAY_LABELS[idx]
            if not isinstance(row, dict):
                continue
            if row.get("open") is False:
                parts.append(f"{weekday}: Closed")
                continue
            start = _format_clock(str(row.get("start") or ""))
            end = _format_clock(str(row.get("end") or ""))
            if start and end:
                parts.append(f"{weekday}: {start} to {end}")
        if parts:
            return " ".join(parts) + "."
    return None


def _build_location_summary(clinic_row: dict[str, Any]) -> str | None:
    parts = [
        _normalize_space(clinic_row.get("address_line1") or clinic_row.get("address")),
        _normalize_space(clinic_row.get("address_line2")),
        _normalize_space(clinic_row.get("city")),
        _normalize_space(clinic_row.get("state")),
        _normalize_space(clinic_row.get("zip") or clinic_row.get("zip_code")),
    ]
    joined = ", ".join(part for part in parts if part)
    if not joined:
        return None
    return f"We're located at {joined}."


def _split_into_chunks(title: str, body: str, *, max_chars: int = 220, max_sentences: int = 2) -> list[str]:
    normalized_body = _normalize_space(body)
    if not normalized_body:
        return []
    sentences = [segment.strip() for segment in QUESTION_SPLIT_RE.split(normalized_body) if segment.strip()]
    if not sentences:
        return [normalized_body]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for sentence in sentences:
        extra = len(sentence) + (1 if current else 0)
        if current and (len(current) >= max_sentences or current_len + extra > max_chars):
            chunks.append(" ".join(current).strip())
            current = []
            current_len = 0
        current.append(sentence)
        current_len += extra
    if current:
        chunks.append(" ".join(current).strip())
    if len(chunks) == 1 and title and len(chunks[0]) < 90:
        return [f"{_normalize_space(title)}. {chunks[0]}".strip()]
    return chunks


def looks_like_clinic_info_question(question: Optional[str]) -> bool:
    normalized = _normalize_space(question).lower()
    if not normalized:
        return False
    return bool(
        SERVICE_LIST_RE.search(normalized)
        or PRICE_RE_QUESTION.search(normalized)
        or DURATION_RE_QUESTION.search(normalized)
        or HOURS_RE.search(normalized)
        or LOCATION_RE.search(normalized)
        or PARKING_RE.search(normalized)
        or INSURANCE_RE.search(normalized)
        or PAYMENT_RE.search(normalized)
        or POLICY_RE.search(normalized)
        or STAFF_RE.search(normalized)
        or EMERGENCY_RE.search(normalized)
        or GENERAL_INFO_RE.search(normalized)
    )


def _classify_subtype(
    question: str,
    *,
    explicit_service_name: str | None,
    state: PatientState,
) -> str:
    normalized = _normalize_space(question).lower()
    fresh_subtype = getattr(state, "clinic_last_subtype", None)
    fresh_turn = getattr(state, "clinic_last_topic_turn_index", 0)
    current_turn = getattr(state, "conversation_turn_index", 0)
    recent_topic = bool(fresh_subtype and current_turn - fresh_turn <= 2)

    if AMBIGUOUS_FRAGMENT_RE.match(normalized):
        if normalized in {"services", "service"}:
            return "service_list"
        if normalized in {"how long", "duration"}:
            return "service_duration" if recent_topic and fresh_subtype in SERVICE_SPECIFIC_SUBTYPES else "clarification_needed"
        if normalized in {"the pricing", "pricing", "the price", "price", "the cost", "cost"}:
            return "service_price" if recent_topic and fresh_subtype in SERVICE_SPECIFIC_SUBTYPES else "clarification_needed"
        return "clarification_needed"

    if SERVICE_LIST_RE.search(normalized):
        return "service_list"
    if PRICE_RE_QUESTION.search(normalized):
        return "service_price"
    if DURATION_RE_QUESTION.search(normalized):
        return "service_duration"
    if HOURS_RE.search(normalized):
        return "hours"
    if LOCATION_RE.search(normalized):
        return "location"
    if PARKING_RE.search(normalized):
        return "parking"
    if INSURANCE_RE.search(normalized):
        return "insurance"
    if PAYMENT_RE.search(normalized):
        return "payment"
    if POLICY_RE.search(normalized):
        return "policy"
    if STAFF_RE.search(normalized):
        return "staff"
    if EMERGENCY_RE.search(normalized):
        return "emergency"

    if explicit_service_name and SHORT_SWITCH_RE.search(normalized) and recent_topic and fresh_subtype in SERVICE_SPECIFIC_SUBTYPES:
        return fresh_subtype
    if explicit_service_name and DESCRIPTION_RE_QUESTION.search(normalized):
        return "service_description"
    if explicit_service_name and recent_topic and fresh_subtype in SERVICE_SPECIFIC_SUBTYPES and _question_tokens(normalized):
        return fresh_subtype
    if GENERAL_INFO_RE.search(normalized):
        return "general_faq"
    return "clarification_needed"


def _context_is_fresh(state: PatientState, *, max_turn_gap: int = 2) -> bool:
    last_turn = int(getattr(state, "clinic_last_service_turn_index", 0) or 0)
    current_turn = int(getattr(state, "conversation_turn_index", 0) or 0)
    confidence = float(getattr(state, "clinic_last_service_confidence", 0.0) or 0.0)
    return last_turn > 0 and current_turn - last_turn <= max_turn_gap and confidence >= 0.75


def _resolve_service_from_question(
    question: str,
    bundle: ClinicKnowledgeBundle,
    *,
    state: PatientState,
    subtype: str,
    industry_type: str,
) -> tuple[ServiceRecord | None, bool]:
    normalized = _normalize_service_key(question)
    explicit_matches: list[tuple[int, ServiceRecord]] = []
    for alias, service in bundle.alias_map.items():
        alias_key = _normalize_service_key(alias)
        if alias_key and re.search(rf"(?<!\w){re.escape(alias_key)}(?!\w)", normalized):
            explicit_matches.append((len(alias_key), service))
    explicit_matches.sort(key=lambda item: item[0], reverse=True)
    if explicit_matches:
        return explicit_matches[0][1], True

    extracted = extract_reason_quick(question, industry_type=industry_type)
    if extracted:
        matched = bundle.alias_map.get(_normalize_service_key(extracted))
        if matched:
            return matched, True

    if subtype in SERVICE_SPECIFIC_SUBTYPES and _context_is_fresh(state):
        service_id = getattr(state, "clinic_last_service_id", None)
        matched = bundle.service_by_id(service_id) or bundle.alias_map.get(
            _normalize_service_key(getattr(state, "clinic_last_service_name", None))
        )
        if matched:
            return matched, False

    if subtype in SERVICE_SPECIFIC_SUBTYPES:
        booking_reason = getattr(state, "reason", None)
        if booking_reason:
            matched = bundle.alias_map.get(_normalize_service_key(booking_reason))
            if matched:
                return matched, False

    return None, False


def _choose_service_fact(
    bundle: ClinicKnowledgeBundle,
    *,
    service_id: str,
    fact_type: str,
) -> ServiceFactRecord | None:
    facts = bundle.facts_for(service_id, fact_type)
    return facts[0] if facts else None


async def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for clinic knowledge embeddings")
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


async def _embed_texts(texts: Sequence[str]) -> list[list[float]]:
    if not texts:
        return []
    client = await _get_openai_client()
    response = await client.embeddings.create(
        model=CLINIC_KNOWLEDGE_EMBEDDING_MODEL,
        input=list(texts),
    )
    return [list(item.embedding) for item in response.data]


async def get_query_embedding(text: str) -> list[float]:
    normalized = _normalize_text_for_hash(text)
    cached = _query_embedding_cache.get(normalized)
    if cached is not None:
        return cached
    vectors = await _embed_texts([text])
    embedding = vectors[0]
    if len(_query_embedding_cache) >= CLINIC_KNOWLEDGE_QUERY_EMBED_CACHE_SIZE:
        _query_embedding_cache.pop(next(iter(_query_embedding_cache)))
    _query_embedding_cache[normalized] = embedding
    return embedding


def _sync_lock_for(clinic_id: str) -> asyncio.Lock:
    lock = _sync_locks.get(clinic_id)
    if lock is None:
        lock = asyncio.Lock()
        _sync_locks[clinic_id] = lock
    return lock


async def _run_supabase(query_fn: Callable[[], Any]) -> Any:
    return await asyncio.to_thread(query_fn)


async def _select_many(table_name: str, **filters: Any) -> list[dict[str, Any]]:
    def _query() -> Any:
        query = supabase.table(table_name).select("*")
        for key, value in filters.items():
            query = query.eq(key, value)
        result = query.execute()
        return result.data or []

    rows = await _run_supabase(_query)
    return list(rows or [])


async def _fetch_source_snapshot(clinic_id: str, organization_id: str | None = None) -> dict[str, Any]:
    clinic_rows = await _select_many("clinics", id=clinic_id)
    clinic = clinic_rows[0] if clinic_rows else None
    if clinic is None:
        raise ValueError(f"Clinic {clinic_id} not found")
    organization_id = organization_id or str(clinic.get("organization_id") or "")

    knowledge_articles = await _select_many("knowledge_articles", clinic_id=clinic_id)
    knowledge_articles = [row for row in knowledge_articles if row.get("active", True)]
    clinic_hours = await _select_many("clinic_hours", clinic_id=clinic_id)

    def _agents_query() -> Any:
        query = supabase.table("agents").select("id, clinic_id, organization_id, created_at").eq("clinic_id", clinic_id)
        if organization_id:
            query = query.eq("organization_id", organization_id)
        result = query.order("created_at", desc=True).limit(1).execute()
        return result.data or []

    agents = await _run_supabase(_agents_query)
    agent = agents[0] if agents else None
    settings_row: dict[str, Any] | None = None
    if agent:
        settings_rows = await _select_many("agent_settings", agent_id=agent["id"])
        if settings_rows:
            settings_rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
            settings_row = settings_rows[0]

    return {
        "clinic": clinic,
        "organization_id": organization_id,
        "agent_settings": settings_row or {},
        "knowledge_articles": knowledge_articles,
        "clinic_hours": clinic_hours,
    }


def _service_seed_key(name: str, *, industry_type: str) -> str:
    return _normalize_service_key(_canonical_service_name(name, industry_type=industry_type))


def _article_source_ref(article: dict[str, Any]) -> str:
    article_id = str(article.get("id") or "").strip()
    if article_id:
        return f"knowledge_article:{article_id}"
    title = _normalize_space(article.get("title") or "article")
    return f"knowledge_article:{title}"


def _service_seed_to_record(seed: dict[str, Any]) -> ServiceRecord:
    return ServiceRecord(
        id=seed["id"],
        organization_id=seed["organization_id"],
        clinic_id=seed["clinic_id"],
        canonical_name=seed["canonical_name"],
        display_name=seed["display_name"],
        normalized_name=seed["normalized_name"],
        active=bool(seed.get("active", True)),
        bookable=bool(seed.get("bookable", True)),
        default_duration_minutes=seed.get("default_duration_minutes"),
        sort_order=seed.get("sort_order"),
        source_ref=seed.get("source_ref"),
    )


def _synthetic_service_record(
    raw_name: str,
    *,
    clinic_id: str,
    organization_id: str,
    industry_type: str,
) -> ServiceRecord:
    canonical_name = _canonical_service_name(raw_name, industry_type=industry_type)
    display_name = _service_display_name(raw_name, canonical_name=canonical_name)
    normalized_name = _normalize_service_key(display_name or canonical_name)
    return ServiceRecord(
        id=f"synthetic:{normalized_name}",
        organization_id=organization_id,
        clinic_id=clinic_id,
        canonical_name=canonical_name,
        display_name=display_name,
        normalized_name=normalized_name,
        active=True,
        bookable=False,
        default_duration_minutes=None,
        sort_order=None,
        source_ref="synthetic",
    )


def _faq_row_to_record(row: dict[str, Any]) -> FaqChunkRecord:
    return FaqChunkRecord(
        id=str(row.get("id")),
        organization_id=str(row.get("organization_id")),
        clinic_id=str(row.get("clinic_id")),
        service_id=str(row.get("service_id")) if row.get("service_id") else None,
        category=_normalize_space(row.get("category") or "General"),
        fact_type=_normalize_space(row.get("fact_type")) or None,
        title=_normalize_space(row.get("title")) or None,
        chunk_text=_normalize_space(row.get("chunk_text")),
        source_article_id=str(row.get("source_article_id")) if row.get("source_article_id") else None,
        source_ref=_normalize_space(row.get("source_ref")) or None,
        chunk_index=int(row.get("chunk_index") or 0),
    )


def _ensure_service_seed(
    service_seeds: dict[str, dict[str, Any]],
    *,
    organization_id: str,
    clinic_id: str,
    raw_name: str,
    industry_type: str,
    display_name: str | None = None,
    duration_minutes: int | None = None,
    active: bool = True,
    bookable: bool = True,
    sort_order: int | None = None,
    source_ref: str | None = None,
) -> dict[str, Any] | None:
    normalized_name = _service_seed_key(raw_name, industry_type=industry_type)
    if not normalized_name:
        return None
    canonical_name = _canonical_service_name(raw_name, industry_type=industry_type)
    preferred_display_name = _service_display_name(display_name or raw_name, canonical_name=canonical_name)
    seed = service_seeds.get(normalized_name)
    if seed is None:
        seed = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "clinic_id": clinic_id,
            "canonical_name": canonical_name,
            "display_name": preferred_display_name,
            "normalized_name": normalized_name,
            "active": active,
            "bookable": bookable,
            "default_duration_minutes": duration_minutes,
            "sort_order": sort_order,
            "source_ref": source_ref,
            "aliases": set(),
        }
        service_seeds[normalized_name] = seed
    else:
        if preferred_display_name and (
            not seed.get("display_name")
            or len(preferred_display_name) > len(str(seed.get("display_name") or ""))
        ):
            seed["display_name"] = preferred_display_name
        if duration_minutes and not seed.get("default_duration_minutes"):
            seed["default_duration_minutes"] = duration_minutes
        if sort_order is not None and seed.get("sort_order") is None:
            seed["sort_order"] = sort_order
        seed["active"] = bool(seed.get("active", True) and active)
        seed["bookable"] = bool(seed.get("bookable", True) and bookable)
        if source_ref and not seed.get("source_ref"):
            seed["source_ref"] = source_ref

    seed_aliases = cast(set[str], seed["aliases"])
    seed_aliases.update(
        _generate_service_aliases(
            preferred_display_name,
            canonical_name,
            industry_type=industry_type,
        )
    )
    return seed


def _add_service_fact_seed(
    fact_seeds: dict[tuple[str, str], dict[str, Any]],
    *,
    seed: dict[str, Any],
    fact_type: str,
    answer_text: str,
    structured_value_json: dict[str, Any] | None = None,
    priority: int = 100,
    source_ref: str | None = None,
) -> None:
    cleaned_text = _normalize_space(answer_text)
    if not cleaned_text:
        return
    key = (seed["id"], fact_type)
    existing = fact_seeds.get(key)
    payload = {
        "id": str(uuid.uuid4()),
        "organization_id": seed["organization_id"],
        "clinic_id": seed["clinic_id"],
        "service_id": seed["id"],
        "fact_type": fact_type,
        "answer_text": cleaned_text,
        "structured_value_json": structured_value_json or {},
        "priority": priority,
        "source_ref": source_ref,
        "content_hash": _hash_values(seed["id"], fact_type, cleaned_text, structured_value_json or {}),
        "active": True,
    }
    if existing is None or int(existing.get("priority") or 1000) > priority:
        fact_seeds[key] = payload


def _service_sentence_pairs(text: str) -> list[tuple[str, str]]:
    cleaned = _normalize_space(text)
    if not cleaned:
        return []
    pattern = re.compile(
        r"(?P<name>[A-Z][A-Za-z0-9&'()/,\-\s]{2,80}?)\s*:\s*(?P<body>[^.]+(?:\.[^.]+)?)",
        re.IGNORECASE,
    )
    pairs: list[tuple[str, str]] = []
    for match in pattern.finditer(cleaned):
        name = _normalize_space(match.group("name"))
        body = _normalize_space(match.group("body"))
        if not name or not body:
            continue
        if len(name.split()) > 10:
            continue
        pairs.append((name, body))
    return pairs


def _pricing_clauses(text: str) -> list[str]:
    cleaned = _normalize_space(text)
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+|,\s+(?=[A-Z][a-z])", cleaned)
    return [_normalize_space(part) for part in parts if _normalize_space(part)]


def _split_service_scoped_clauses(text: str, *, industry_type: str) -> list[str]:
    terms = set(GENERIC_SERVICE_BOUNDARY_TERMS)
    source = SPA_SERVICE_MAP if industry_type == "med_spa" else DENTAL_SERVICE_MAP
    for value in list(source.keys()) + list(source.values()) + list(_STT_APPROXIMATIONS.keys()) + list(_STT_APPROXIMATIONS.values()):
        normalized = _normalize_service_key(value)
        if normalized and len(normalized) > 3:
            terms.add(normalized)
    sorted_terms = sorted(terms, key=len, reverse=True)
    if not sorted_terms:
        return [text]
    pattern = r",\s+(?=(?:and\s+)?(?:" + "|".join(re.escape(term) for term in sorted_terms) + r")\b)"
    parts = re.split(pattern, _normalize_space(text), flags=re.IGNORECASE)
    return [_normalize_space(part) for part in parts if _normalize_space(part)]


def _extract_service_specific_faq_snippet(
    text: str,
    *,
    service: ServiceRecord | None,
    industry_type: str,
) -> str:
    cleaned = _normalize_space(text)
    if not cleaned or service is None:
        return cleaned
    clauses = _split_service_scoped_clauses(cleaned, industry_type=industry_type)
    relevant: list[str] = []
    for clause in clauses:
        detected = extract_reason_quick(clause, industry_type=industry_type)
        clause_key = _normalize_service_key(detected or clause)
        if clause_key == service.normalized_name or service.normalized_name in _normalize_service_key(clause):
            relevant.append(clause)
    return " ".join(relevant).strip() or cleaned


def _extract_service_overview_pairs(text: str) -> list[tuple[str, int | None]]:
    matches: list[tuple[str, int | None]] = []
    pattern = re.compile(
        r"(?P<name>[A-Z][A-Za-z0-9&'()/,\-\s]{2,80}?)\s*\((?P<duration>[^)]*)\)",
        re.IGNORECASE,
    )
    for match in pattern.finditer(text or ""):
        name = _normalize_space(match.group("name"))
        duration = _duration_text_to_minutes(match.group("duration") or "")
        if name:
            matches.append((name, duration))
    return matches


def _build_service_price_text(service_name: str, price_text: str) -> str:
    return f"{service_name} is {price_text}."


def _build_service_duration_text(service_name: str, duration_minutes: int) -> str:
    duration_text = _duration_minutes_to_text(duration_minutes) or f"{duration_minutes} minutes"
    return f"{service_name} usually takes about {duration_text}."


def _seed_services_from_settings(
    snapshot: dict[str, Any],
    *,
    industry_type: str,
    service_seeds: dict[str, dict[str, Any]],
    fact_seeds: dict[tuple[str, str], dict[str, Any]],
) -> None:
    settings = snapshot.get("agent_settings") or {}
    config_json = settings.get("config_json") or {}
    organization_id = str(snapshot.get("organization_id") or "")
    clinic_id = str(snapshot["clinic"]["id"])
    raw_services = config_json.get("services") if isinstance(config_json, dict) else None
    if not isinstance(raw_services, list):
        return

    for index, raw_service in enumerate(raw_services):
        if not isinstance(raw_service, dict):
            continue
        name = _normalize_space(raw_service.get("name") or raw_service.get("label"))
        if not name:
            continue
        enabled = raw_service.get("enabled", True) is not False
        duration_value = raw_service.get("duration")
        duration_minutes = int(duration_value) if str(duration_value or "").isdigit() else None
        seed = _ensure_service_seed(
            service_seeds,
            organization_id=organization_id,
            clinic_id=clinic_id,
            raw_name=name,
            display_name=name,
            industry_type=industry_type,
            duration_minutes=duration_minutes,
            active=enabled,
            bookable=enabled,
            sort_order=index,
            source_ref=f"agent_settings:{settings.get('id') or 'config'}:services[{index}]",
        )
        if seed is None:
            continue
        price = _parse_numeric_price(str(raw_service.get("price") or ""))
        if price is not None:
            price_text = _format_currency(price) or str(raw_service.get("price"))
            _add_service_fact_seed(
                fact_seeds,
                seed=seed,
                fact_type="price",
                answer_text=_build_service_price_text(seed["display_name"], price_text),
                structured_value_json={"price": price, "price_text": price_text, "currency": "USD"},
                priority=10,
                source_ref=seed["source_ref"],
            )
        if duration_minutes is not None:
            _add_service_fact_seed(
                fact_seeds,
                seed=seed,
                fact_type="duration",
                answer_text=_build_service_duration_text(seed["display_name"], duration_minutes),
                structured_value_json={
                    "duration_minutes": duration_minutes,
                    "duration_text": _duration_minutes_to_text(duration_minutes),
                },
                priority=10,
                source_ref=seed["source_ref"],
            )
        description = _normalize_space(raw_service.get("description"))
        if description:
            _add_service_fact_seed(
                fact_seeds,
                seed=seed,
                fact_type="description",
                answer_text=description,
                structured_value_json={"description": description},
                priority=20,
                source_ref=seed["source_ref"],
            )


def _seed_services_from_articles(
    snapshot: dict[str, Any],
    *,
    industry_type: str,
    service_seeds: dict[str, dict[str, Any]],
    fact_seeds: dict[tuple[str, str], dict[str, Any]],
) -> None:
    organization_id = str(snapshot.get("organization_id") or "")
    clinic_id = str(snapshot["clinic"]["id"])
    settings = snapshot.get("agent_settings") or {}
    config_json = settings.get("config_json") or {}
    has_structured_services = bool(
        isinstance(config_json, dict)
        and isinstance(config_json.get("services"), list)
        and any(isinstance(service, dict) and _normalize_space(service.get("name") or service.get("label")) for service in config_json.get("services") or [])
    )
    for article in snapshot.get("knowledge_articles") or []:
        title = _normalize_space(article.get("title"))
        body = _normalize_space(article.get("body"))
        category = _normalize_space(article.get("category"))
        source_ref = _article_source_ref(article)
        if not body:
            continue

        normalized_title = _normalize_service_key(title)
        if has_structured_services and normalized_title in {"service pricing", "services overview"}:
            continue
        if normalized_title == "service pricing":
            parsed_any_pairs = False
            for name, fact_body in _service_sentence_pairs(body):
                if name.lower().startswith("we offer "):
                    continue
                parsed_any_pairs = True
                price_value = _parse_numeric_price(fact_body)
                duration_minutes = _duration_text_to_minutes(fact_body)
                seed = _ensure_service_seed(
                    service_seeds,
                    organization_id=organization_id,
                    clinic_id=clinic_id,
                    raw_name=name,
                    display_name=name,
                    industry_type=industry_type,
                    duration_minutes=duration_minutes,
                    sort_order=None,
                    source_ref=source_ref,
                )
                if seed is None:
                    continue
                if price_value is not None:
                    price_text = _format_currency(price_value) or str(price_value)
                    _add_service_fact_seed(
                        fact_seeds,
                        seed=seed,
                        fact_type="price",
                        answer_text=_build_service_price_text(seed["display_name"], price_text),
                        structured_value_json={
                            "price": price_value,
                            "price_text": price_text,
                            "currency": "USD",
                        },
                        priority=30,
                        source_ref=source_ref,
                    )
                if duration_minutes is not None:
                    _add_service_fact_seed(
                        fact_seeds,
                        seed=seed,
                        fact_type="duration",
                        answer_text=_build_service_duration_text(seed["display_name"], duration_minutes),
                        structured_value_json={
                            "duration_minutes": duration_minutes,
                            "duration_text": _duration_minutes_to_text(duration_minutes),
                        },
                        priority=30,
                        source_ref=source_ref,
                    )
            if not parsed_any_pairs:
                for clause in _pricing_clauses(body):
                    detected_service = extract_reason_quick(clause, industry_type=industry_type)
                    if not detected_service or not PRICE_RE.search(clause):
                        continue
                    duration_minutes = _duration_text_to_minutes(clause)
                    seed = _ensure_service_seed(
                        service_seeds,
                        organization_id=organization_id,
                        clinic_id=clinic_id,
                        raw_name=detected_service,
                        display_name=detected_service,
                        industry_type=industry_type,
                        duration_minutes=duration_minutes,
                        source_ref=source_ref,
                    )
                    if seed is None:
                        continue
                    prices = _extract_price_mentions(clause)
                    structured_value: dict[str, Any] = {"prices": prices, "currency": "USD"}
                    if len(prices) == 1:
                        structured_value["price_text"] = prices[0]
                    _add_service_fact_seed(
                        fact_seeds,
                        seed=seed,
                        fact_type="price",
                        answer_text=clause,
                        structured_value_json=structured_value,
                        priority=35,
                        source_ref=source_ref,
                    )
            continue

        if normalized_title == "services overview":
            for index, (name, duration_minutes) in enumerate(_extract_service_overview_pairs(body)):
                _ensure_service_seed(
                    service_seeds,
                    organization_id=organization_id,
                    clinic_id=clinic_id,
                    raw_name=name,
                    display_name=name,
                    industry_type=industry_type,
                    duration_minutes=duration_minutes,
                    sort_order=index,
                    source_ref=source_ref,
                )
            continue

        if not _looks_like_specific_service_article(title, category):
            continue

        duration_minutes = _duration_text_to_minutes(body)
        seed = _ensure_service_seed(
            service_seeds,
            organization_id=organization_id,
            clinic_id=clinic_id,
            raw_name=_service_name_from_article_title(title),
            display_name=_service_name_from_article_title(title),
            industry_type=industry_type,
            duration_minutes=duration_minutes,
            source_ref=source_ref,
        )
        if seed is None:
            continue
        if PRICE_RE.search(body):
            prices = _extract_price_mentions(body)
            structured_value: dict[str, Any] = {"prices": prices, "currency": "USD"}
            if len(prices) == 1:
                structured_value["price_text"] = prices[0]
                answer_text = _build_service_price_text(seed["display_name"], prices[0])
            else:
                answer_text = body
            _add_service_fact_seed(
                fact_seeds,
                seed=seed,
                fact_type="price",
                answer_text=answer_text,
                structured_value_json=structured_value,
                priority=40,
                source_ref=source_ref,
            )
        if duration_minutes is not None:
            _add_service_fact_seed(
                fact_seeds,
                seed=seed,
                fact_type="duration",
                answer_text=_build_service_duration_text(seed["display_name"], duration_minutes),
                structured_value_json={
                    "duration_minutes": duration_minutes,
                    "duration_text": _duration_minutes_to_text(duration_minutes),
                },
                priority=40,
                source_ref=source_ref,
            )
        _add_service_fact_seed(
            fact_seeds,
            seed=seed,
            fact_type="description",
            answer_text=body,
            structured_value_json={"description": body},
            priority=50,
            source_ref=source_ref,
        )


def _build_faq_rows(
    snapshot: dict[str, Any],
    *,
    industry_type: str,
    service_seeds: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    clinic = snapshot["clinic"]
    organization_id = str(snapshot.get("organization_id") or "")
    clinic_id = str(clinic["id"])
    faq_rows: list[dict[str, Any]] = []

    hours_summary = _summarize_hours(
        snapshot.get("clinic_hours") or [],
        clinic.get("working_hours") if isinstance(clinic, dict) else None,
    )
    if hours_summary:
        faq_rows.append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": organization_id,
                "clinic_id": clinic_id,
                "service_id": None,
                "category": "Hours",
                "fact_type": "hours",
                "title": "Clinic Hours",
                "chunk_text": hours_summary,
                "content_hash": _hash_values(clinic_id, "hours", hours_summary),
                "source_article_id": None,
                "source_ref": "clinic_hours",
                "chunk_index": 0,
                "active": True,
            }
        )

    location_summary = _build_location_summary(clinic)
    if location_summary:
        faq_rows.append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": organization_id,
                "clinic_id": clinic_id,
                "service_id": None,
                "category": "Location",
                "fact_type": "location",
                "title": "Clinic Location",
                "chunk_text": location_summary,
                "content_hash": _hash_values(clinic_id, "location", location_summary),
                "source_article_id": None,
                "source_ref": "clinics",
                "chunk_index": 0,
                "active": True,
            }
        )

    for article in snapshot.get("knowledge_articles") or []:
        title = _normalize_space(article.get("title"))
        body = _normalize_space(article.get("body"))
        category = _normalize_space(article.get("category") or "General")
        if not body:
            continue
        normalized_title = _normalize_service_key(title)
        if normalized_title in {"clinic hours", "services overview"}:
            continue
        fact_type = _fact_type_from_article(title, category, body)
        service_id: str | None = None
        if _looks_like_specific_service_article(title, category):
            service_key = _service_seed_key(_service_name_from_article_title(title), industry_type=industry_type)
            matched_seed = service_seeds.get(service_key)
            service_id = str(matched_seed["id"]) if matched_seed else None
            if category.lower() in {"services"}:
                # Structured facts cover service-specific pricing/description; keep FAQ chunks focused on general info.
                continue

        for index, chunk_text in enumerate(_split_into_chunks(title, body)):
            faq_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "organization_id": organization_id,
                    "clinic_id": clinic_id,
                    "service_id": service_id,
                    "category": category,
                    "fact_type": fact_type,
                    "title": title or None,
                    "chunk_text": chunk_text,
                    "content_hash": _hash_values(
                        clinic_id,
                        service_id or "",
                        category,
                        fact_type,
                        title,
                        index,
                        chunk_text,
                    ),
                    "source_article_id": article.get("id"),
                    "source_ref": _article_source_ref(article),
                    "chunk_index": index,
                    "active": True,
                }
            )

    deduped: dict[str, dict[str, Any]] = {}
    for row in faq_rows:
        deduped[row["content_hash"]] = row
    return list(deduped.values())


def _build_normalized_rows(
    snapshot: dict[str, Any],
    *,
    industry_type: str,
) -> dict[str, Any]:
    organization_id = str(snapshot.get("organization_id") or "")
    clinic_id = str(snapshot["clinic"]["id"])
    service_seeds: dict[str, dict[str, Any]] = {}
    fact_seeds: dict[tuple[str, str], dict[str, Any]] = {}

    _seed_services_from_settings(
        snapshot,
        industry_type=industry_type,
        service_seeds=service_seeds,
        fact_seeds=fact_seeds,
    )
    _seed_services_from_articles(
        snapshot,
        industry_type=industry_type,
        service_seeds=service_seeds,
        fact_seeds=fact_seeds,
    )

    service_rows = list(service_seeds.values())
    service_rows.sort(
        key=lambda row: (
            row.get("sort_order") is None,
            row.get("sort_order") if row.get("sort_order") is not None else 9999,
            row.get("display_name") or row.get("canonical_name") or "",
        )
    )
    for index, row in enumerate(service_rows):
        if row.get("sort_order") is None:
            row["sort_order"] = index

    alias_rows: list[dict[str, Any]] = []
    for row in service_rows:
        deduped_aliases: dict[str, str] = {}
        for alias in sorted(cast(set[str], row.get("aliases") or set()), key=lambda value: (len(value), value)):
            normalized_alias = _normalize_service_key(alias)
            if not normalized_alias or normalized_alias in deduped_aliases:
                continue
            deduped_aliases[normalized_alias] = alias
        for normalized_alias, alias in deduped_aliases.items():
            alias_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "organization_id": organization_id,
                    "clinic_id": clinic_id,
                    "service_id": row["id"],
                    "alias": alias,
                    "normalized_alias": normalized_alias,
                }
            )

    faq_rows = _build_faq_rows(
        snapshot,
        industry_type=industry_type,
        service_seeds=service_seeds,
    )

    bundle = ClinicKnowledgeBundle(
        clinic_id=clinic_id,
        organization_id=organization_id,
        clinic_name=_normalize_space(snapshot["clinic"].get("name")) or None,
        services=[_service_seed_to_record(row) for row in service_rows if row.get("active", True)],
        facts=[
            ServiceFactRecord(
                id=row["id"],
                organization_id=row["organization_id"],
                clinic_id=row["clinic_id"],
                service_id=row["service_id"],
                fact_type=row["fact_type"],
                answer_text=row["answer_text"],
                structured_value_json=dict(row.get("structured_value_json") or {}),
                priority=int(row.get("priority") or 100),
                source_ref=row.get("source_ref"),
            )
            for row in fact_seeds.values()
            if row.get("active", True)
        ],
        faq_chunks=[_faq_row_to_record(row) for row in faq_rows if row.get("active", True)],
    )

    bundle.services.sort(
        key=lambda service: (
            service.sort_order is None,
            service.sort_order if service.sort_order is not None else 9999,
            service.display_name,
        )
    )
    for service in bundle.services:
        bundle.alias_map[_normalize_service_key(service.display_name)] = service
        bundle.alias_map[_normalize_service_key(service.canonical_name)] = service
    for alias_row in alias_rows:
        service = bundle.service_by_id(alias_row["service_id"])
        if service:
            bundle.alias_map[_normalize_service_key(alias_row["alias"])] = service

    return {
        "services": [
            {
                key: value
                for key, value in row.items()
                if key != "aliases"
            }
            for row in service_rows
        ],
        "service_aliases": alias_rows,
        "service_facts": list(fact_seeds.values()),
        "faq_chunks": faq_rows,
        "bundle": bundle,
    }


async def _delete_existing_normalized_rows(clinic_id: str) -> None:
    def _delete_table(table_name: str) -> Any:
        return supabase.table(table_name).delete().eq("clinic_id", clinic_id).execute()

    await _run_supabase(lambda: _delete_table("faq_chunks"))
    await _run_supabase(lambda: _delete_table("service_aliases"))
    await _run_supabase(lambda: _delete_table("service_facts"))
    await _run_supabase(lambda: _delete_table("services"))


async def _insert_rows(table_name: str, rows: Sequence[dict[str, Any]]) -> None:
    if not rows:
        return
    batch_size = 200
    for start in range(0, len(rows), batch_size):
        batch = list(rows[start:start + batch_size])
        await _run_supabase(lambda batch=batch: supabase.table(table_name).insert(batch).execute())


async def _fetch_bundle_from_tables(clinic_id: str, organization_id: str) -> ClinicKnowledgeBundle:
    service_rows = await _select_many("services", clinic_id=clinic_id)
    active_service_rows = [row for row in service_rows if row.get("active", True)]
    fact_rows = await _select_many("service_facts", clinic_id=clinic_id)
    active_fact_rows = [row for row in fact_rows if row.get("active", True)]
    alias_rows = await _select_many("service_aliases", clinic_id=clinic_id)
    faq_rows = await _select_many("faq_chunks", clinic_id=clinic_id)
    clinic_rows = await _select_many("clinics", id=clinic_id)
    clinic_name = _normalize_space((clinic_rows[0] if clinic_rows else {}).get("name")) or None

    services = [
        ServiceRecord(
            id=str(row["id"]),
            organization_id=str(row.get("organization_id") or organization_id),
            clinic_id=str(row.get("clinic_id") or clinic_id),
            canonical_name=_normalize_space(row.get("canonical_name")),
            display_name=_normalize_space(row.get("display_name")),
            normalized_name=_normalize_service_key(row.get("normalized_name") or row.get("display_name")),
            active=bool(row.get("active", True)),
            bookable=bool(row.get("bookable", True)),
            default_duration_minutes=row.get("default_duration_minutes"),
            sort_order=row.get("sort_order"),
            source_ref=_normalize_space(row.get("source_ref")) or None,
        )
        for row in active_service_rows
    ]
    services.sort(
        key=lambda service: (
            service.sort_order is None,
            service.sort_order if service.sort_order is not None else 9999,
            service.display_name,
        )
    )
    facts = [
        ServiceFactRecord(
            id=str(row["id"]),
            organization_id=str(row.get("organization_id") or organization_id),
            clinic_id=str(row.get("clinic_id") or clinic_id),
            service_id=str(row["service_id"]),
            fact_type=_normalize_space(row.get("fact_type")),
            answer_text=_normalize_space(row.get("answer_text")),
            structured_value_json=dict(row.get("structured_value_json") or {}),
            priority=int(row.get("priority") or 100),
            source_ref=_normalize_space(row.get("source_ref")) or None,
        )
        for row in active_fact_rows
    ]
    bundle = ClinicKnowledgeBundle(
        clinic_id=clinic_id,
        organization_id=organization_id,
        clinic_name=clinic_name,
        services=services,
        facts=facts,
        faq_chunks=[_faq_row_to_record(row) for row in faq_rows if row.get("active", True)],
    )
    for service in services:
        bundle.alias_map[_normalize_service_key(service.display_name)] = service
        bundle.alias_map[_normalize_service_key(service.canonical_name)] = service
    for alias_row in alias_rows:
        service = bundle.service_by_id(str(alias_row.get("service_id") or ""))
        if service:
            bundle.alias_map[_normalize_service_key(alias_row.get("alias"))] = service
    return bundle


def _snapshot_from_runtime_context(
    *,
    clinic_info: dict[str, Any] | None,
    agent_settings: dict[str, Any] | None,
    knowledge_articles: Sequence[dict[str, Any]] | None,
) -> dict[str, Any]:
    clinic = dict(clinic_info or {})
    clinic_id = str(clinic.get("id") or "")
    organization_id = str(
        clinic.get("organization_id")
        or (agent_settings or {}).get("organization_id")
        or ""
    )
    return {
        "clinic": clinic,
        "organization_id": organization_id,
        "agent_settings": agent_settings or {},
        "knowledge_articles": list(knowledge_articles or []),
        "clinic_hours": [],
    }


async def request_clinic_knowledge_sync(
    clinic_id: str,
    organization_id: str,
    *,
    trigger_source: str = "manual",
    reason: str | None = None,
) -> None:
    if not clinic_id or not organization_id:
        return

    await _run_supabase(
        lambda: supabase.rpc(
            "request_clinic_knowledge_sync",
            {
                "p_organization_id": organization_id,
                "p_clinic_id": clinic_id,
                "p_trigger_source": trigger_source,
                "p_reason": reason,
            },
        ).execute()
    )


async def _get_sync_job(clinic_id: str) -> dict[str, Any] | None:
    rows = await _select_many("clinic_knowledge_sync_jobs", clinic_id=clinic_id)
    if not rows:
        return None
    rows.sort(key=lambda row: str(row.get("updated_at") or row.get("requested_at") or ""), reverse=True)
    return rows[0]


async def _mark_sync_job(
    clinic_id: str,
    *,
    status: str,
    error_text: str | None = None,
) -> None:
    def _query() -> Any:
        payload: dict[str, Any] = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if status == "processing":
            payload["started_at"] = datetime.utcnow().isoformat()
            payload["attempts"] = 1
            payload["last_error"] = None
        if status == "completed":
            payload["completed_at"] = datetime.utcnow().isoformat()
            payload["last_error"] = None
        if status == "failed":
            payload["last_error"] = (error_text or "")[:500]
        return (
            supabase.table("clinic_knowledge_sync_jobs")
            .update(payload)
            .eq("clinic_id", clinic_id)
            .execute()
        )

    await _run_supabase(_query)


async def sync_clinic_knowledge_for_clinic(
    clinic_id: str,
    *,
    organization_id: str | None = None,
    industry_type: str = "dental",
    snapshot_override: dict[str, Any] | None = None,
) -> ClinicKnowledgeBundle:
    if not clinic_id:
        raise ValueError("clinic_id is required")

    lock = _sync_lock_for(clinic_id)
    async with lock:
        snapshot = snapshot_override or await _fetch_source_snapshot(clinic_id, organization_id=organization_id)
        organization_id = str(snapshot.get("organization_id") or organization_id or "")
        if not organization_id:
            raise ValueError(f"organization_id missing for clinic {clinic_id}")

        await _mark_sync_job(clinic_id, status="processing")
        try:
            payload = _build_normalized_rows(snapshot, industry_type=industry_type)
            faq_rows = list(payload["faq_chunks"])
            if faq_rows:
                embeddings = await _embed_texts([row["chunk_text"] for row in faq_rows])
                for row, embedding in zip(faq_rows, embeddings, strict=False):
                    row["embedding"] = _to_vector_literal(embedding)
            payload["faq_chunks"] = faq_rows

            await _delete_existing_normalized_rows(clinic_id)
            await _insert_rows("services", payload["services"])
            await _insert_rows("service_aliases", payload["service_aliases"])
            await _insert_rows("service_facts", payload["service_facts"])
            await _insert_rows("faq_chunks", payload["faq_chunks"])

            bundle = await _fetch_bundle_from_tables(clinic_id, organization_id)
            cache_key = f"{organization_id}:{clinic_id}"
            _bundle_cache.set(cache_key, bundle)
            await _mark_sync_job(clinic_id, status="completed")
            logger.info(
                "[CLINIC KNOWLEDGE SYNC] clinic_id=%s services=%s facts=%s faq_chunks=%s",
                clinic_id,
                len(payload["services"]),
                len(payload["service_facts"]),
                len(payload["faq_chunks"]),
            )
            return bundle
        except Exception as exc:
            await _mark_sync_job(clinic_id, status="failed", error_text=str(exc))
            raise


async def process_pending_clinic_knowledge_sync_jobs(
    *,
    limit: int = 10,
) -> int:
    def _query() -> Any:
        result = (
            supabase.table("clinic_knowledge_sync_jobs")
            .select("*")
            .in_("status", ["pending", "failed"])
            .order("requested_at")
            .limit(limit)
            .execute()
        )
        return result.data or []

    jobs = await _run_supabase(_query)
    processed = 0
    for job in jobs or []:
        clinic_id = str(job.get("clinic_id") or "")
        organization_id = str(job.get("organization_id") or "")
        if not clinic_id or not organization_id:
            continue
        try:
            snapshot = await _fetch_source_snapshot(clinic_id, organization_id=organization_id)
            industry_type = str(snapshot.get("clinic", {}).get("industry_type") or "dental")
            await sync_clinic_knowledge_for_clinic(
                clinic_id,
                organization_id=organization_id,
                industry_type=industry_type,
                snapshot_override=snapshot,
            )
            processed += 1
        except Exception:
            logger.exception("[CLINIC KNOWLEDGE SYNC] failed clinic_id=%s", clinic_id)
    return processed


async def ensure_clinic_knowledge_bundle(
    *,
    clinic_info: dict[str, Any] | None,
    agent_settings: dict[str, Any] | None,
    knowledge_articles: Sequence[dict[str, Any]] | None,
    industry_type: str,
) -> ClinicKnowledgeBundle:
    snapshot = _snapshot_from_runtime_context(
        clinic_info=clinic_info,
        agent_settings=agent_settings,
        knowledge_articles=knowledge_articles,
    )
    clinic = snapshot.get("clinic") or {}
    clinic_id = str(clinic.get("id") or "")
    organization_id = str(snapshot.get("organization_id") or "")
    cache_key = f"{organization_id}:{clinic_id}" if clinic_id and organization_id else ""
    should_use_ephemeral_only = bool(
        os.getenv("PYTEST_CURRENT_TEST")
        or not _looks_like_uuid(clinic_id)
        or not _looks_like_uuid(organization_id)
    )

    job = await _get_sync_job(clinic_id) if clinic_id and not should_use_ephemeral_only else None
    cached = _bundle_cache.get(cache_key) if cache_key else None
    if cached is not None and (job is None or job.get("status") == "completed"):
        return cached

    if clinic_id and organization_id and not should_use_ephemeral_only:
        try:
            existing = await _fetch_bundle_from_tables(clinic_id, organization_id)
            if (existing.services or existing.faq_chunks) and (job is None or job.get("status") == "completed"):
                _bundle_cache.set(cache_key, existing)
                return existing
            bundle = await sync_clinic_knowledge_for_clinic(
                clinic_id,
                organization_id=organization_id,
                industry_type=industry_type,
                snapshot_override=snapshot if knowledge_articles is not None or agent_settings is not None else None,
            )
            return bundle
        except Exception as exc:
            logger.warning(
                "[CLINIC KNOWLEDGE] fallback_to_ephemeral_bundle clinic_id=%s error=%s",
                clinic_id,
                exc,
            )

    payload = _build_normalized_rows(snapshot, industry_type=industry_type)
    return cast(ClinicKnowledgeBundle, payload["bundle"])


def _lexical_overlap(question: str, text: str) -> int:
    return len(_question_tokens(question).intersection(_question_tokens(text)))


def _detect_explicit_service(
    question: str,
    bundle: ClinicKnowledgeBundle,
    *,
    industry_type: str,
) -> ServiceRecord | None:
    matched, explicit = _resolve_service_from_question(
        question,
        bundle,
        state=PatientState(),
        subtype="service_description",
        industry_type=industry_type,
    )
    return matched if explicit else None


async def _run_hybrid_search_rpc(
    question: str,
    *,
    clinic_id: str,
    organization_id: str,
    service_id: str | None,
    subtype: str,
    query_embedding: list[float] | None = None,
    limit: int = 4,
) -> list[dict[str, Any]]:
    fact_filter = CLINIC_SUBTYPE_TO_FACT_FILTER.get(subtype)
    params = {
        "p_query_text": question,
        "p_query_embedding": _to_vector_literal(query_embedding) if query_embedding else None,
        "p_clinic_id": clinic_id,
        "p_organization_id": organization_id,
        "p_service_id": service_id,
        "p_category": None,
        "p_fact_type": fact_filter,
        "p_limit": limit,
        "p_fts_limit": max(limit * 2, 8),
        "p_semantic_limit": max(limit * 2, 8),
    }
    response = await _run_supabase(lambda: supabase.rpc("hybrid_search_faq_chunks", params).execute())
    return list(response.data or [])


def _fallback_search_faq_chunks(
    question: str,
    *,
    faq_chunks: Sequence[FaqChunkRecord],
    service_id: str | None,
    subtype: str,
    limit: int = 4,
) -> list[dict[str, Any]]:
    question_tokens = _question_tokens(question)
    fact_filter = CLINIC_SUBTYPE_TO_FACT_FILTER.get(subtype)
    ranked: list[tuple[float, FaqChunkRecord]] = []
    for row in faq_chunks:
        if fact_filter and (row.fact_type or "").lower() != fact_filter.lower():
            continue
        if service_id and row.service_id and row.service_id != service_id:
            continue
        text_blob = " ".join(part for part in [row.title or "", row.category, row.chunk_text] if part)
        overlap = len(question_tokens.intersection(_question_tokens(text_blob)))
        score = overlap * 1.0
        if row.fact_type and fact_filter and row.fact_type.lower() == fact_filter.lower():
            score += 2.0
        if row.title and row.title.lower() in question.lower():
            score += 2.0
        if service_id and row.service_id == service_id:
            score += 1.0
        if score > 0:
            ranked.append((score, row))
    ranked.sort(key=lambda item: (-item[0], item[1].chunk_index, item[1].id))
    return [
        {
            "id": row.id,
            "organization_id": row.organization_id,
            "clinic_id": row.clinic_id,
            "service_id": row.service_id,
            "category": row.category,
            "fact_type": row.fact_type,
            "title": row.title,
            "chunk_text": row.chunk_text,
            "source_article_id": row.source_article_id,
            "source_ref": row.source_ref,
            "chunk_index": row.chunk_index,
            "fts_score": score,
            "semantic_score": None,
            "combined_score": score,
            "match_source": "local",
        }
        for score, row in ranked[:limit]
    ]


async def _search_faq_chunks(
    question: str,
    *,
    bundle: ClinicKnowledgeBundle,
    subtype: str,
    service_id: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    if _looks_like_uuid(bundle.clinic_id) and _looks_like_uuid(bundle.organization_id):
        try:
            lexical_results = await _run_hybrid_search_rpc(
                question,
                clinic_id=bundle.clinic_id,
                organization_id=bundle.organization_id,
                service_id=service_id,
                subtype=subtype,
            )
            overlap = 0
            if lexical_results:
                first = lexical_results[0]
                overlap = _lexical_overlap(
                    question,
                    f"{first.get('title') or ''} {first.get('chunk_text') or ''}",
                )
            need_semantic = not lexical_results or (
                subtype in {"general_faq", "insurance", "payment", "policy", "staff", "parking", "emergency"}
                and overlap == 0
            )
            if need_semantic:
                query_embedding = await get_query_embedding(question)
                semantic_results = await _run_hybrid_search_rpc(
                    question,
                    clinic_id=bundle.clinic_id,
                    organization_id=bundle.organization_id,
                    service_id=service_id,
                    subtype=subtype,
                    query_embedding=query_embedding,
                )
                if semantic_results:
                    return semantic_results, True
            if lexical_results:
                return lexical_results, False
        except Exception as exc:
            logger.warning(
                "[CLINIC KNOWLEDGE] faq_rpc_fallback clinic_id=%s subtype=%s error=%s",
                bundle.clinic_id,
                subtype,
                exc,
            )

    return (
        _fallback_search_faq_chunks(
            question,
            faq_chunks=bundle.faq_chunks,
            service_id=service_id,
            subtype=subtype,
        ),
        False,
    )


def _collect_critical_fact_values(text: str, *, extra_values: Sequence[str] | None = None) -> list[str]:
    values = _unique_nonempty(list(extra_values or []))
    values.extend(_extract_price_mentions(text))
    values.extend(
        _unique_nonempty(match.group(0) for match in DURATION_MINUTES_RE.finditer(text or ""))
    )
    values.extend(
        _unique_nonempty(match.group(0) for match in DURATION_HOURS_RE.finditer(text or ""))
    )
    values.extend(
        _unique_nonempty(match.group(0) for match in TIME_RANGE_RE.finditer(text or ""))
    )
    insurance_names = re.findall(
        r"\b(?:Delta Dental|Aetna|Cigna|MetLife|CareCredit|Blue Cross|BCBS)\b",
        text or "",
        flags=re.IGNORECASE,
    )
    values.extend(_unique_nonempty(insurance_names))
    return _unique_nonempty(values)


def _build_answer(
    *,
    subtype: str,
    service: ServiceRecord | None,
    facts_used: Sequence[str],
    deterministic_text: str,
    confidence: float,
    fallback_used: bool,
    critical_fact_values: Sequence[str] | None = None,
) -> ClinicKnowledgeAnswer:
    clean_text = _normalize_space(deterministic_text)
    return ClinicKnowledgeAnswer(
        subtype=subtype,
        service_id=service.id if service else None,
        service_name=service.display_name if service else None,
        facts_used=list(facts_used),
        fallback_used=fallback_used,
        confidence=confidence,
        deterministic_text=clean_text,
        verbalizer_payload={
            "subtype": subtype,
            "service_name": service.display_name if service else None,
            "deterministic_text": clean_text,
        },
        critical_fact_values=_collect_critical_fact_values(
            clean_text,
            extra_values=critical_fact_values,
        ),
    )


def _clarification_text(subtype: str) -> str:
    if subtype == "service_price":
        return "Which service would you like pricing for?"
    if subtype == "service_duration":
        return "Which service would you like timing for?"
    if subtype == "service_description":
        return "Which service would you like to know about?"
    return "Could you tell me which service or clinic detail you mean?"


def _compose_structured_service_answer(
    *,
    bundle: ClinicKnowledgeBundle,
    subtype: str,
    service: ServiceRecord | None,
) -> ClinicKnowledgeAnswer | None:
    if service is None:
        return _build_answer(
            subtype="clarification_needed",
            service=None,
            facts_used=[],
            deterministic_text=_clarification_text(subtype),
            confidence=0.2,
            fallback_used=True,
        )

    if subtype == "service_duration" and service.default_duration_minutes:
        duration_text = _duration_minutes_to_text(service.default_duration_minutes) or str(service.default_duration_minutes)
        return _build_answer(
            subtype=subtype,
            service=service,
            facts_used=[service.id],
            deterministic_text=f"{service.display_name} usually takes about {duration_text}.",
            confidence=0.92,
            fallback_used=False,
            critical_fact_values=[duration_text],
        )

    if subtype == "service_description":
        description_fact = _choose_service_fact(bundle, service_id=service.id, fact_type="description")
        if description_fact is not None:
            return _build_answer(
                subtype=subtype,
                service=service,
                facts_used=[description_fact.id],
                deterministic_text=description_fact.answer_text,
                confidence=0.97,
                fallback_used=False,
            )

        summary_parts: list[str] = [f"{service.display_name} is available at the clinic."]
        summary_fact_ids: list[str] = []
        critical_values: list[str] = []

        price_fact = _choose_service_fact(bundle, service_id=service.id, fact_type="price")
        if price_fact is not None:
            summary_fact_ids.append(price_fact.id)
            price_text = str((price_fact.structured_value_json or {}).get("price_text") or "").strip()
            if price_text:
                summary_parts.append(f"The current price is {price_text}.")
                critical_values.append(price_text)

        duration_fact = _choose_service_fact(bundle, service_id=service.id, fact_type="duration")
        duration_minutes: int | None = None
        if duration_fact is not None:
            summary_fact_ids.append(duration_fact.id)
            raw_duration = (duration_fact.structured_value_json or {}).get("duration_minutes")
            if isinstance(raw_duration, int):
                duration_minutes = raw_duration
        if duration_minutes is None and service.default_duration_minutes:
            duration_minutes = service.default_duration_minutes
        if duration_minutes:
            duration_text = _duration_minutes_to_text(duration_minutes) or f"{duration_minutes} minutes"
            summary_parts.append(f"It usually takes about {duration_text}.")
            critical_values.append(duration_text)

        if len(summary_parts) > 1:
            return _build_answer(
                subtype=subtype,
                service=service,
                facts_used=summary_fact_ids or [service.id],
                deterministic_text=" ".join(summary_parts),
                confidence=0.88,
                fallback_used=False,
                critical_fact_values=critical_values,
            )

    fact_type = {
        "service_price": "price",
        "service_duration": "duration",
    }.get(subtype)
    if not fact_type:
        return None

    fact = _choose_service_fact(bundle, service_id=service.id, fact_type=fact_type)
    if fact is None:
        if subtype == "service_price":
            return _build_answer(
                subtype=subtype,
                service=service,
                facts_used=[],
                deterministic_text=f"I don't have the current price for {service.display_name} in my notes right now, but the clinic can confirm it for you.",
                confidence=0.55,
                fallback_used=True,
            )
        if subtype == "service_duration":
            return _build_answer(
                subtype=subtype,
                service=service,
                facts_used=[],
                deterministic_text=f"I don't have the exact timing for {service.display_name} in my notes right now, but the clinic can confirm it for you.",
                confidence=0.55,
                fallback_used=True,
            )
        return _build_answer(
            subtype=subtype,
            service=service,
            facts_used=[],
            deterministic_text=f"I don't have a reliable description for {service.display_name} in my notes right now, but the clinic can confirm it for you.",
            confidence=0.5,
            fallback_used=True,
        )

    deterministic_text = fact.answer_text
    structured = fact.structured_value_json or {}
    critical_values: list[str] = []
    if subtype == "service_price" and structured.get("price_text"):
        deterministic_text = _build_service_price_text(service.display_name, str(structured["price_text"]))
        critical_values.append(str(structured["price_text"]))
    elif subtype == "service_duration" and structured.get("duration_minutes"):
        duration_value = int(structured["duration_minutes"])
        duration_text = _duration_minutes_to_text(duration_value) or str(duration_value)
        deterministic_text = _build_service_duration_text(service.display_name, duration_value)
        critical_values.append(duration_text)
    return _build_answer(
        subtype=subtype,
        service=service,
        facts_used=[fact.id],
        deterministic_text=deterministic_text,
        confidence=0.97,
        fallback_used=False,
        critical_fact_values=critical_values,
    )


def _compose_service_list_answer(bundle: ClinicKnowledgeBundle) -> ClinicKnowledgeAnswer:
    service_names = [service.display_name for service in bundle.services if service.active]
    if not service_names:
        return _build_answer(
            subtype="service_list",
            service=None,
            facts_used=[],
            deterministic_text="I don't have a current service list in my notes right now, but the clinic can walk you through it.",
            confidence=0.4,
            fallback_used=True,
        )
    preview_names = service_names[:5]
    if len(preview_names) == 1:
        text = f"We offer {preview_names[0]}. I can also give you pricing or timing if you'd like."
    else:
        text = f"We offer {', '.join(preview_names[:-1])}, and {preview_names[-1]}. I can also give you pricing or timing for any of those."
    return _build_answer(
        subtype="service_list",
        service=None,
        facts_used=[service.id for service in bundle.services[: len(preview_names)]],
        deterministic_text=text,
        confidence=0.94,
        fallback_used=False,
        critical_fact_values=preview_names,
    )


async def _compose_faq_answer(
    question: str,
    *,
    bundle: ClinicKnowledgeBundle,
    subtype: str,
    service: ServiceRecord | None,
    industry_type: str,
) -> ClinicKnowledgeAnswer:
    results, semantic_used = await _search_faq_chunks(
        question,
        bundle=bundle,
        subtype=subtype,
        service_id=service.id if service else None,
    )
    if not results and subtype != "general_faq":
        results, semantic_used = await _search_faq_chunks(
            question,
            bundle=bundle,
            subtype="general_faq",
            service_id=service.id if service else None,
        )
    if not results:
        return _build_answer(
            subtype=subtype,
            service=service,
            facts_used=[],
            deterministic_text="I don't have a reliable answer for that in my notes right now, but the clinic can confirm it for you.",
            confidence=0.35,
            fallback_used=True,
        )

    top = results[0]
    deterministic_text = _normalize_space(top.get("chunk_text"))
    if subtype in SERVICE_SPECIFIC_SUBTYPES:
        deterministic_text = _extract_service_specific_faq_snippet(
            deterministic_text,
            service=service,
            industry_type=industry_type,
        )
    confidence = 0.86 if semantic_used else 0.93
    logger.info(
        "[CLINIC KNOWLEDGE RETRIEVAL] clinic_id=%s subtype=%s top_id=%s match_source=%s fts=%s semantic=%s combined=%s",
        bundle.clinic_id,
        subtype,
        top.get("id"),
        top.get("match_source"),
        top.get("fts_score"),
        top.get("semantic_score"),
        top.get("combined_score"),
    )
    return _build_answer(
        subtype=subtype,
        service=service,
        facts_used=[str(top.get("id"))],
        deterministic_text=deterministic_text,
        confidence=confidence,
        fallback_used=False,
    )


def _clear_service_context(state: PatientState) -> None:
    state.clinic_last_service_id = None
    state.clinic_last_service_name = None
    state.clinic_last_service_confidence = 0.0
    state.clinic_last_service_turn_index = 0


def _update_state_from_answer(
    *,
    state: PatientState,
    answer: ClinicKnowledgeAnswer,
    explicit_service: bool,
) -> None:
    current_turn = int(getattr(state, "conversation_turn_index", 0) or 0)
    state.clinic_last_subtype = answer.subtype
    state.clinic_last_topic_turn_index = current_turn
    if answer.service_id and answer.subtype in SERVICE_SPECIFIC_SUBTYPES:
        state.clinic_last_service_id = answer.service_id
        state.clinic_last_service_name = answer.service_name
        state.clinic_last_service_confidence = answer.confidence if explicit_service else min(answer.confidence, 0.88)
        state.clinic_last_service_turn_index = current_turn
        return
    if answer.subtype in SERVICE_LIST_SUBTYPES or answer.subtype in FAQ_SUBTYPES or answer.subtype == "general_faq":
        _clear_service_context(state)


def _normalize_spoken_reply(text: str) -> str:
    cleaned = _normalize_space(text)
    if cleaned and cleaned[-1] not in ".!?":
        cleaned += "."
    return cleaned


def _humanized_reply_preserves_facts(reply: str, answer: ClinicKnowledgeAnswer) -> bool:
    normalized = _normalize_space(reply).lower()
    if not normalized:
        return False
    for fact_value in answer.critical_fact_values:
        if _normalize_space(fact_value).lower() not in normalized:
            return False
    return True


async def resolve_clinic_knowledge_answer(
    question: str,
    *,
    state: PatientState,
    clinic_info: dict[str, Any] | None,
    agent_settings: dict[str, Any] | None,
    knowledge_articles: Sequence[dict[str, Any]] | None,
    industry_type: str,
) -> ClinicKnowledgeAnswer | None:
    normalized_question = _normalize_space(question)
    if not looks_like_clinic_info_question(normalized_question):
        return None

    total_started_at = time.perf_counter()
    bundle = await ensure_clinic_knowledge_bundle(
        clinic_info=clinic_info,
        agent_settings=agent_settings,
        knowledge_articles=knowledge_articles,
        industry_type=industry_type,
    )

    classify_started_at = time.perf_counter()
    explicit_service = _detect_explicit_service(
        normalized_question,
        bundle,
        industry_type=industry_type,
    )
    subtype = _classify_subtype(
        normalized_question,
        explicit_service_name=explicit_service.display_name if explicit_service else None,
        state=state,
    )
    classify_ms = (time.perf_counter() - classify_started_at) * 1000

    service_started_at = time.perf_counter()
    service, explicit = _resolve_service_from_question(
        normalized_question,
        bundle,
        state=state,
        subtype=subtype,
        industry_type=industry_type,
    )
    if service is None and subtype in SERVICE_SPECIFIC_SUBTYPES:
        explicit_name = extract_reason_quick(normalized_question, industry_type=industry_type)
        if explicit_name:
            service = _synthetic_service_record(
                explicit_name,
                clinic_id=bundle.clinic_id,
                organization_id=bundle.organization_id,
                industry_type=industry_type,
            )
            explicit = True
        elif _context_is_fresh(state) and getattr(state, "clinic_last_service_name", None):
            service = _synthetic_service_record(
                str(state.clinic_last_service_name),
                clinic_id=bundle.clinic_id,
                organization_id=bundle.organization_id,
                industry_type=industry_type,
            )
    service_ms = (time.perf_counter() - service_started_at) * 1000

    answer_started_at = time.perf_counter()
    if subtype in SERVICE_SPECIFIC_SUBTYPES:
        answer = _compose_structured_service_answer(
            bundle=bundle,
            subtype=subtype,
            service=service,
        )
        if answer and answer.fallback_used and not answer.facts_used:
            faq_answer = await _compose_faq_answer(
                normalized_question,
                bundle=bundle,
                subtype=subtype,
                service=service,
                industry_type=industry_type,
            )
            if not faq_answer.fallback_used:
                answer = faq_answer
    elif subtype == "service_list":
        answer = _compose_service_list_answer(bundle)
    elif subtype == "clarification_needed":
        clarification_kind = subtype
        if PRICE_RE_QUESTION.search(normalized_question):
            clarification_kind = "service_price"
        elif DURATION_RE_QUESTION.search(normalized_question):
            clarification_kind = "service_duration"
        elif SERVICE_LIST_RE.search(normalized_question):
            clarification_kind = "service_list"
        answer = _build_answer(
            subtype=subtype,
            service=service,
            facts_used=[],
            deterministic_text=_clarification_text(
                "service_description" if service else clarification_kind
            ),
            confidence=0.25,
            fallback_used=True,
        )
    else:
        answer = await _compose_faq_answer(
            normalized_question,
            bundle=bundle,
            subtype=subtype,
            service=service,
            industry_type=industry_type,
        )
    answer_ms = (time.perf_counter() - answer_started_at) * 1000

    if answer is None:
        return None

    _update_state_from_answer(
        state=state,
        answer=answer,
        explicit_service=explicit,
    )

    total_ms = (time.perf_counter() - total_started_at) * 1000
    logger.info(
        "[CLINIC KNOWLEDGE] clinic_id=%s subtype=%s service=%s confidence=%.2f classify_ms=%.1f service_ms=%.1f answer_ms=%.1f total_ms=%.1f fallback=%s",
        bundle.clinic_id or (clinic_info or {}).get("id") or "-",
        answer.subtype,
        answer.service_name or "-",
        answer.confidence,
        classify_ms,
        service_ms,
        answer_ms,
        total_ms,
        answer.fallback_used,
    )
    return answer


async def verbalize_clinic_knowledge_answer(
    question: str,
    answer: ClinicKnowledgeAnswer,
    *,
    humanizer: ClinicAnswerHumanizer | None,
    fallback_service: str | None = None,
) -> str:
    deterministic_text = _normalize_spoken_reply(answer.deterministic_text)
    if humanizer is None:
        return deterministic_text

    started_at = time.perf_counter()
    try:
        candidate = await humanizer(question, deterministic_text, fallback_service)
    except Exception as exc:
        logger.debug("[CLINIC KNOWLEDGE] verbalizer_fallback_due_to_error=%s", exc)
        return deterministic_text
    verbalizer_ms = (time.perf_counter() - started_at) * 1000
    candidate = _normalize_spoken_reply(candidate or deterministic_text)
    if not _humanized_reply_preserves_facts(candidate, answer):
        logger.info(
            "[CLINIC KNOWLEDGE] verbalizer_rejected_missing_facts subtype=%s service=%s verbalizer_ms=%.1f",
            answer.subtype,
            answer.service_name or "-",
            verbalizer_ms,
        )
        return deterministic_text
    logger.info(
        "[CLINIC KNOWLEDGE] verbalizer_ms=%.1f subtype=%s service=%s",
        verbalizer_ms,
        answer.subtype,
        answer.service_name or "-",
    )
    return candidate
