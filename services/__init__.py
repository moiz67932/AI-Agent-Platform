"""
Service modules package.

Contains business logic services for:
- Database operations (Supabase)
- Scheduling and slot management
- Data extraction
- Appointment management
"""

__all__ = [
    "fetch_clinic_context_optimized",
    "is_slot_free_supabase",
    "book_to_supabase",
    "extract_name_quick",
    "extract_reason_quick",
    "_iso",
]


def __getattr__(name: str):
    """Lazily expose common service helpers without importing every integration."""
    if name in {
        "fetch_clinic_context_optimized",
        "is_slot_free_supabase",
        "book_to_supabase",
    }:
        from . import database_service

        return getattr(database_service, name)
    if name in {"extract_name_quick", "extract_reason_quick", "_iso"}:
        from . import extraction_service

        return getattr(extraction_service, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
