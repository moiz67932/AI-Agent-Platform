"""
Utility modules for the dental AI agent.
"""

__all__ = [
    "TTLCache",
    "_clinic_cache",
    "TurnMetrics",
    "_turn_metrics",
    "_normalize_sip_user_to_e164",
    "speakable_phone",
    "format_phone_for_speech",
    "_ensure_phone_is_string",
    "_normalize_phone_preserve_plus",
    "build_spoken_confirmation",
    "email_for_speech",
    "CallLogger",
    "create_call_logger",
    "supabase_write_with_retry",
]


def __getattr__(name: str):
    """Lazily expose utility helpers without importing unrelated runtime config."""
    if name in {"TTLCache", "_clinic_cache"}:
        from . import cache

        return getattr(cache, name)
    if name in {"TurnMetrics", "_turn_metrics"}:
        from . import latency_metrics

        return getattr(latency_metrics, name)
    if name in {
        "_normalize_sip_user_to_e164",
        "speakable_phone",
        "format_phone_for_speech",
        "_ensure_phone_is_string",
        "_normalize_phone_preserve_plus",
    }:
        from . import phone_utils

        return getattr(phone_utils, name)
    if name in {"build_spoken_confirmation", "email_for_speech"}:
        from . import formatting_utils

        return getattr(formatting_utils, name)
    if name in {"CallLogger", "create_call_logger"}:
        from . import call_logger

        return getattr(call_logger, name)
    if name == "supabase_write_with_retry":
        from . import supabase_retry

        return getattr(supabase_retry, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
