"""
Deterministic data extraction from text.

Quick pattern-based extractors for name, reason, and formatting utilities.
"""

from __future__ import annotations

import re
from typing import Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from config import DEFAULT_TZ


_NAME_SEGMENT_SPLIT_RE = re.compile(r"[.?!,\n]+")
_NAME_NOISE_PREFIX_RE = re.compile(
    r"^(?:(?:uh|um|er|ah|well|so|hello|hi|hey|yes|yeah|yep|no|nope|okay|ok)\s+)+",
    re.IGNORECASE,
)
_NAME_STOPWORDS = {
    "a", "am", "an", "and", "appointment", "around", "at", "book", "booking",
    "by", "call", "calling", "can", "clean", "cleaning", "close", "consult",
    "consultation", "could", "crown", "day", "do", "email", "exam", "extract",
    "extraction", "filling", "for", "friday", "from", "hello", "hey", "hi",
    "i", "im", "is", "it", "its", "january", "february", "march", "april",
    "may", "june", "july", "august", "september", "october", "november",
    "december", "like", "monday", "my", "need", "next", "no", "nope", "ok",
    "okay", "on", "pain", "phone", "please", "pm", "root", "saturday",
    "schedule", "service", "sunday", "teeth", "thank", "thanks", "this",
    "thursday", "time", "today", "tomorrow", "tooth", "toothache", "tuesday",
    "use", "want", "wednesday", "whiten", "whitening", "would", "yeah",
    "yep", "yes",
}


def _normalize_candidate_name(text: str) -> str:
    cleaned = _NAME_NOISE_PREFIX_RE.sub("", " ".join(text.split()).strip())
    return cleaned.strip(" '\"")


def _match_name_pattern(text: str) -> Optional[str]:
    patterns = [
        r"\b(?:my\s+name\s+is|i\s+am|i'm|this\s+is|call\s+me)\s+([A-Za-z][A-Za-z\s\.'-]{2,})",
        r"^(?:it'?s|its)\s+([A-Za-z][A-Za-z\s\.'-]{2,})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if not m:
            continue
        name = m.group(1).strip()
        name = re.split(
            r"\b(and|i|want|need|would|like|to|for|at|my|phone|email)\b",
            name,
            flags=re.I,
        )[0].strip()
        if len(name) >= 3:
            return name.title()
    return None


def _looks_like_standalone_name(text: str) -> Optional[str]:
    candidate = _normalize_candidate_name(text)
    if not candidate or len(candidate) > 40 or re.search(r"\d", candidate):
        return None

    tokens = candidate.split()
    if not 1 <= len(tokens) <= 3:
        return None

    lowered = [token.lower().strip(".!?,'\"-") for token in tokens]
    if any(not token or token in _NAME_STOPWORDS for token in lowered):
        return None
    if not any(len(token) >= 3 for token in lowered):
        return None
    if any(not re.fullmatch(r"[A-Za-z][A-Za-z'.-]*", token) for token in tokens):
        return None

    return candidate.title()


def extract_name_quick(text: str) -> Optional[str]:
    """Quick name extraction from common patterns."""
    matched = _match_name_pattern(text)
    if matched:
        return matched

    segments = [segment.strip() for segment in _NAME_SEGMENT_SPLIT_RE.split(text) if segment.strip()]
    for segment in reversed(segments):
        matched = _match_name_pattern(segment)
        if matched:
            return matched
        standalone = _looks_like_standalone_name(segment)
        if standalone:
            return standalone
    return None


def extract_reason_quick(text: str) -> Optional[str]:
    """Quick service extraction."""
    t = text.lower()
    service_map = {
        "whiten": "Teeth whitening",
        "whitening": "Teeth whitening",
        "clean": "Cleaning",
        "cleaning": "Cleaning",
        "checkup": "Checkup",
        "check-up": "Checkup",
        "exam": "Checkup",
        "pain": "Tooth pain",
        "toothache": "Tooth pain",
        "consult": "Consultation",
        "extract": "Extraction",
        "filling": "Filling",
        "crown": "Crown",
        "root canal": "Root canal",
    }
    for key, value in service_map.items():
        if key in t:
            return value
    return None


def _iso(dt: datetime) -> str:
    """Convert datetime to ISO format string with timezone."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(DEFAULT_TZ))
    return dt.isoformat()
