"""
Configuration and constants for the dental AI agent.

Contains all environment variables, API configurations, and tuning parameters.
"""

from __future__ import annotations

import os
import logging
from typing import Dict
from dotenv import load_dotenv
from zoneinfo import ZoneInfo
from openai import AsyncOpenAI
from supabase import create_client

from supabase_calendar_store import SupabaseCalendarStore

# =============================================================================
# Load Environment
# =============================================================================

load_dotenv(".env.local")

# =============================================================================
# 🚀 LATENCY OPTIMIZATION CONSTANTS — TUNING KNOBS FOR SNAPPY RESPONSES
# =============================================================================
"""
LATENCY TUNING GUIDE:
- These constants control responsiveness vs. conversation quality tradeoffs
- Adjust based on production metrics; log analysis will show impact
- Set LATENCY_DEBUG=1 env var to enable per-turn latency logging
"""

# Endpointing: How quickly agent detects user finished speaking
# WARNING: Do NOT go below 0.3s unless in controlled low-noise environment
# TUNED: Reduced from 1.0/1.2 to 0.7/1.0 for faster response
MIN_ENDPOINTING_DELAY = float(os.getenv("MIN_ENDPOINTING_DELAY", "0.7"))  # 0.7s - faster response
MAX_ENDPOINTING_DELAY = float(os.getenv("MAX_ENDPOINTING_DELAY", "1.0"))  # 1.0s max wait

# VAD (Voice Activity Detection) tuning
# WARNING: min_silence < 0.25s may cause premature cutoffs on pauses
# TUNED: Slightly increased silence for more stable turn detection
VAD_MIN_SPEECH_DURATION = float(os.getenv("VAD_MIN_SPEECH", "0.08"))   # 0.08s (slightly reduced)
VAD_MIN_SILENCE_DURATION = float(os.getenv("VAD_MIN_SILENCE", "0.30")) # 0.30s (slightly increased for stability)

# Filler speech settings
FILLER_ENABLED = os.getenv("FILLER_ENABLED", "1") == "1"
FILLER_MAX_DURATION_MS = int(os.getenv("FILLER_MAX_MS", "700"))  # Hard cap on filler playback
FILLER_PHRASES = ["Okay…", "One moment…", "Got it…", "Hmm…"]  # Short phrases < 400ms spoken

# STT aggressive endpointing (Deepgram-specific)
STT_AGGRESSIVE_ENDPOINTING = os.getenv("STT_AGGRESSIVE", "1") == "1"

# Clinic context TTL cache (seconds) - DO NOT cache availability/schedule conflicts
CLINIC_CONTEXT_CACHE_TTL = int(os.getenv("CLINIC_CACHE_TTL", "60"))  # 60s TTL

# Latency debug mode - logs detailed timing per turn
LATENCY_DEBUG = os.getenv("LATENCY_DEBUG", "0") == "1"

# =============================================================================
# LOGGING & OBSERVABILITY CONFIGURATION
# =============================================================================

# Enable structured JSON logging for Cloud Logging
ENABLE_STRUCTURED_LOGGING = os.getenv("STRUCTURED_LOGGING", "1") == "1"

# Enable Supabase logging (persistent analytics)
SUPABASE_LOGGING_ENABLED = os.getenv("SUPABASE_LOGGING", "1") == "1"

# Log buffer flush interval (seconds)
LOG_BUFFER_FLUSH_INTERVAL = int(os.getenv("LOG_FLUSH_INTERVAL", "10"))

# Max events in buffer before auto-flush
LOG_BUFFER_MAX_SIZE = int(os.getenv("LOG_BUFFER_SIZE", "100"))

# Mute noisy transport debug logs (reduces log-bloat in production)
logging.getLogger("hpack").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# =============================================================================
# STRUCTURED LOGGER
# =============================================================================

logger = logging.getLogger("snappy_agent")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"
    ))
    logger.addHandler(handler)

# =============================================================================
# ENVIRONMENT & APPLICATION CONFIG
# =============================================================================

ENVIRONMENT = (os.getenv("ENVIRONMENT") or "development").strip().lower()

# Telephony agent identity (must match SIP trunk dispatch rules)
LIVEKIT_AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "telephony_agent_v3")

DEFAULT_TZ = os.getenv("DEFAULT_TIMEZONE", "Asia/Karachi")
DEFAULT_MIN = int(os.getenv("DEFAULT_APPT_MINUTES", "60"))
DEFAULT_PHONE_REGION = os.getenv("DEFAULT_PHONE_REGION", "PK")

# =============================================================================
# SUPABASE CONFIGURATION
# =============================================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# =============================================================================
# OPENAI CONFIGURATION
# =============================================================================

# Async OpenAI client for RAG embeddings (text-embedding-3-small for speed)
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# =============================================================================
# CALENDAR CONFIGURATION
# =============================================================================

calendar_store = SupabaseCalendarStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Google Calendar Config
GOOGLE_CALENDAR_AUTH_MODE = os.getenv("GOOGLE_CALENDAR_AUTH", "oauth")
GOOGLE_OAUTH_TOKEN_PATH = os.getenv("GOOGLE_OAUTH_TOKEN", "./google_token.json")
GOOGLE_CALENDAR_ID_DEFAULT = os.getenv("GOOGLE_CALENDAR_ID", "primary")

# =============================================================================
# DATABASE CONSTANTS
# =============================================================================

BOOKED_STATUSES = ["scheduled", "confirmed"]

# Valid call_sessions.outcome enum values (from Supabase schema)
VALID_CALL_OUTCOMES = {
    "booked",
    "info_only",
    "missed",
    "transferred",
    "voicemail",
}

# Demo/fallback clinic ID for testing and when phone lookup fails
# Override via DEMO_CLINIC_ID environment variable in production
DEMO_CLINIC_ID = os.getenv("DEMO_CLINIC_ID", "5afce5fa-8436-43a3-af65-da29ccad7228")

# =============================================================================
# DEFAULT TREATMENT DURATIONS (minutes)
# =============================================================================

DEFAULT_TREATMENT_DURATIONS: Dict[str, int] = {
    "Teeth whitening": 60,
    "Cleaning": 30,
    "Consultation": 15,
    "Checkup": 30,
    "Check-up": 30,
    "Tooth pain": 30,
    "Extraction": 45,
    "Filling": 45,
    "Crown": 60,
    "Root canal": 90,
    "Emergency": 30,
}

DEFAULT_LUNCH_BREAK: Dict[str, str] = {"start": "13:00", "end": "14:00"}

# =============================================================================
# APPOINTMENT SETTINGS
# =============================================================================

APPOINTMENT_BUFFER_MINUTES = 15

# =============================================================================
# PIPELINE SELECTION — Switch between English and Urdu voice pipelines
# =============================================================================
# Set ACTIVE_PIPELINE="urdu" to activate Urdu pipeline, "english" to keep English.
# Both pipelines remain in codebase; only the selected one is routed/used at runtime.
# English pipeline code is NEVER deleted — just disabled via this flag.

ACTIVE_PIPELINE = os.getenv("ACTIVE_PIPELINE", "english").strip().lower()  # "english" | "urdu"

# Urdu pipeline provider config
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "")
URDU_TTS_VOICE = os.getenv("URDU_TTS_VOICE", "ur-PK-UzmaNeural")  # or "ur-PK-AsadNeural"
URDU_STT_LANGUAGE = os.getenv("URDU_STT_LANGUAGE", "ur")  # "ur" or "multi" for code-switching
URDU_LLM_MODEL = os.getenv("URDU_LLM_MODEL", "gpt-4o-mini")  # Must understand/respond in Urdu

logger.info(f"[PIPELINE] Active pipeline: {ACTIVE_PIPELINE}")


def map_call_outcome(raw_outcome: str | None, booking_made: bool) -> str:
    """
    Maps internal call results to DB-safe call_outcome enum values.
    NEVER returns an invalid enum.
    """
    if booking_made:
        return "booked"

    if raw_outcome in VALID_CALL_OUTCOMES:
        return raw_outcome

    # Fallback: No booking and call ended normally → info_only
    return "info_only"
