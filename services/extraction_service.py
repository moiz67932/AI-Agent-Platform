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
_NON_NAME_INTRO_RE = re.compile(
    r"^(?:i\s+am|i'm)\s+(?:asking|calling|looking|checking|wondering|trying|wanting|needing|interested)\b",
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
    # Speech fragments / filler words that are not names
    "actually", "the", "one", "go", "going", "wanna", "well",
    "uh", "um", "er", "hmm", "sure", "not",
    "just", "really", "very", "also", "too", "about", "back", "here",
    "there", "now", "then", "when", "where", "what", "how", "why",
    "who", "get", "got", "let", "put", "set", "did", "does", "been",
    "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "than", "that", "these", "those", "through",
    # Common verbs in speech that aren't names
    "looking", "trying", "wanted", "needed", "booked", "spoke",
    "called", "told", "said", "know", "think", "believe", "feel",
    # Spa/dental service words that aren't names
    "hydra", "facial", "massage", "botox", "laser", "filler",
    "appointment", "service", "treatment",
}


def _normalize_candidate_name(text: str) -> str:
    cleaned = _NAME_NOISE_PREFIX_RE.sub("", " ".join(text.split()).strip())
    return cleaned.strip(" '\"")


def _match_name_pattern(text: str) -> Optional[str]:
    if _NON_NAME_INTRO_RE.search(text.strip()):
        return None
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

    # Single token <= 4 chars is too short to be a reliable standalone name
    if len(tokens) == 1 and len(tokens[0]) <= 4:
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


DENTAL_SERVICE_MAP = {
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

SPA_SERVICE_MAP = {
    # Injectables
    "botox": "Botox",
    "dysport": "Dysport",
    "xeomin": "Xeomin",
    "filler": "Dermal Filler",
    "lip filler": "Lip Filler",
    "lip flip": "Lip Flip",
    "kybella": "Kybella",
    "prp": "PRP Treatment",
    "sculptra": "Sculptra",
    # Laser & Energy Treatments
    "laser": "Laser Treatment",
    "ipl": "IPL Photofacial",
    "photofacial": "IPL Photofacial",
    "laser hair removal": "Laser Hair Removal",
    "laser hair": "Laser Hair Removal",
    "hair removal": "Laser Hair Removal",
    "laser resurfacing": "Laser Resurfacing",
    "fraxel": "Fraxel Laser",
    "co2 laser": "CO2 Laser",
    "microlaser": "MicroLaser Peel",
    "radiofrequency": "Radiofrequency Treatment",
    "rf": "Radiofrequency Treatment",
    "ultherapy": "Ultherapy",
    "thermage": "Thermage",
    "emsculpt": "Emsculpt",
    "coolsculpting": "CoolSculpting",
    "body contouring": "Body Contouring",
    # Facials & Skin Treatments
    "facial": "Facial",
    "hydrafacial": "HydraFacial",
    "hydra facial": "HydraFacial",
    "chemical peel": "Chemical Peel",
    "peel": "Chemical Peel",
    "microdermabrasion": "Microdermabrasion",
    "microneedling": "Microneedling",
    "dermaplaning": "Dermaplaning",
    "led": "LED Light Therapy",
    "led therapy": "LED Light Therapy",
    "oxygen facial": "Oxygen Facial",
    "teen facial": "Teen Facial",
    "acne facial": "Acne Facial",
    "brightening": "Brightening Facial",
    "anti-aging": "Anti-Aging Facial",
    "anti aging": "Anti-Aging Facial",
    # Body Treatments
    "massage": "Massage",
    "swedish massage": "Swedish Massage",
    "deep tissue": "Deep Tissue Massage",
    "hot stone": "Hot Stone Massage",
    "prenatal massage": "Prenatal Massage",
    "couples massage": "Couples Massage",
    "body wrap": "Body Wrap",
    "body scrub": "Body Scrub",
    "salt scrub": "Salt Scrub",
    "cellulite": "Cellulite Treatment",
    # Waxing & Hair Removal
    "wax": "Waxing",
    "waxing": "Waxing",
    "brazilian": "Brazilian Wax",
    "brow wax": "Brow Wax",
    "full body wax": "Full Body Wax",
    "lip wax": "Lip Wax",
    "sugaring": "Sugaring",
    # Brow & Lash Services
    "brow": "Brow Service",
    "brow tint": "Brow Tint",
    "brow lamination": "Brow Lamination",
    "brow shaping": "Brow Shaping",
    "microblading": "Microblading",
    "brow tattoo": "Microblading",
    "lash": "Lash Service",
    "lash lift": "Lash Lift",
    "lash extensions": "Lash Extensions",
    "lash tint": "Lash Tint",
    # Nails
    "manicure": "Manicure",
    "pedicure": "Pedicure",
    "gel manicure": "Gel Manicure",
    "gel nails": "Gel Nails",
    "nail art": "Nail Art",
    # Consultations / Other
    "consultation": "Consultation",
    "consult": "Consultation",
    "skin consultation": "Skin Consultation",
    "patch test": "Patch Test",
    "gift card": "Gift Card Inquiry",
    "membership": "Membership Inquiry",
    "package": "Package Inquiry",
}


# Phonetic approximation map for common STT errors on spa/dental services
_STT_APPROXIMATIONS: dict[str, str] = {
    # HydraFacial variations
    "hydro fish": "HydraFacial",
    "hydro facial": "HydraFacial",
    "hydra fish": "HydraFacial",
    "hydra face": "HydraFacial",
    "hydro face": "HydraFacial",
    "hydra": "HydraFacial",
    # Botox variations
    "botoks": "Botox",
    "bo tox": "Botox",
    "bow tox": "Botox",
    # Microneedling
    "micro needling": "Microneedling",
    "micro needing": "Microneedling",
    "micro nettling": "Microneedling",
    # Dermaplaning
    "derma planning": "Dermaplaning",
    "derma planing": "Dermaplaning",
    "derma plan": "Dermaplaning",
    # Microblading
    "micro blading": "Microblading",
    "micro blade": "Microblading",
    "eyebrow tattoo": "Microblading",
    # Lash lift
    "lash left": "Lash Lift",
    "lash list": "Lash Lift",
    # Chemical peel
    "chemical feel": "Chemical Peel",
    "chemical pill": "Chemical Peel",
    "chemical peal": "Chemical Peel",
    # IPL
    "i p l": "IPL Photofacial",
    "i-p-l": "IPL Photofacial",
    # Filler
    "lip fill": "Lip Filler",
    "dermal fill": "Dermal Filler",
    # Laser hair
    "laser here": "Laser Hair Removal",
    "laser hair remove": "Laser Hair Removal",
    # Massage variations
    "sweedish": "Swedish Massage",
    "swedish massage": "Swedish Massage",
    "deep tissue massage": "Deep Tissue Massage",
    "deep tissue massaj": "Deep Tissue Massage",
    "hot stone massage": "Hot Stone Massage",
    # Waxing
    "brizilian": "Brazilian Wax",
    "brazillian": "Brazilian Wax",
    # Teeth whitening (dental)
    "teeth white": "Teeth whitening",
    "whitening teeth": "Teeth whitening",
    "tooth whitening": "Teeth whitening",
}


def _match_service_map(text: str, service_map: dict[str, str]) -> Optional[str]:
    """Match text against a service keyword map, trying longer keys first.
    Checks STT approximations first (more specific multi-word patterns),
    then falls back to exact substring match.
    """
    t = text.lower().strip()

    # Pass 1: STT approximation map (checked first — more specific multi-word patterns)
    for approx_key in sorted(_STT_APPROXIMATIONS.keys(), key=len, reverse=True):
        if approx_key in t:
            return _STT_APPROXIMATIONS[approx_key]

    # Pass 2: Exact substring match
    for key in sorted(service_map.keys(), key=len, reverse=True):
        if key in t:
            return service_map[key]

    # Pass 3: Token overlap scoring
    # If 2+ significant tokens from a service name appear in the text, match it
    t_tokens = set(re.findall(r'\b[a-z]{3,}\b', t))
    if t_tokens:
        best_score = 0
        best_match = None
        for key, canonical in service_map.items():
            key_tokens = set(re.findall(r'\b[a-z]{3,}\b', key.lower()))
            if not key_tokens:
                continue
            overlap = len(t_tokens & key_tokens)
            if overlap >= min(2, len(key_tokens)) and overlap > best_score:
                best_score = overlap
                best_match = canonical
        if best_match:
            return best_match

    return None


def extract_spa_service_quick(text: str) -> Optional[str]:
    """Quick spa service extraction using SPA_SERVICE_MAP."""
    return _match_service_map(text, SPA_SERVICE_MAP)


def extract_reason_quick(text: str, industry_type: str = "dental") -> Optional[str]:
    """Quick service extraction. Delegates to the appropriate map based on industry."""
    if industry_type == "med_spa":
        return extract_spa_service_quick(text)
    return _match_service_map(text, DENTAL_SERVICE_MAP)


def _iso(dt: datetime) -> str:
    """Convert datetime to ISO format string with timezone."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(DEFAULT_TZ))
    return dt.isoformat()
