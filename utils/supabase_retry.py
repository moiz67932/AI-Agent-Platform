"""
utils/supabase_retry.py — Async retry wrapper for synchronous Supabase writes.

Usage:
    success, result = await supabase_write_with_retry(
        lambda: supabase.table("appointments").insert(payload).execute(),
        table_name="appointments",
    )
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable, Tuple

logger = logging.getLogger("snappy_agent")


async def supabase_write_with_retry(
    write_fn: Callable[[], Any],
    table_name: str,
    max_retries: int = 3,
    backoff_base: float = 0.5,
    fallback_table: str = "failed_writes",
) -> Tuple[bool, Any]:
    """
    Wraps a synchronous Supabase write callable with async retry logic.

    Returns (True, result) on success.
    Returns (False, last_exception) on permanent failure after all retries,
    and logs a row to the fallback_table for recovery.

    Never raises — always returns a (bool, any) tuple.
    """
    last_error: Exception | None = None

    for attempt in range(max_retries):
        try:
            result = await asyncio.to_thread(write_fn)
            if attempt > 0:
                logger.info(f"[retry] {table_name} write succeeded on attempt {attempt + 1}")
            return True, result
        except Exception as exc:
            last_error = exc
            delay = backoff_base * (2 ** attempt)
            logger.warning(
                f"[retry] {table_name} write failed (attempt {attempt + 1}/{max_retries}): "
                f"{exc!r} — retrying in {delay:.1f}s"
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)

    # All retries exhausted — write to failed_writes for recovery
    logger.error(
        f"[retry] {table_name} write permanently failed after {max_retries} attempts: {last_error!r}"
    )
    try:
        from config import supabase  # late import to avoid circular deps

        fallback_payload = {
            "table_name": table_name,
            "payload_json": repr(write_fn),
            "error": str(last_error),
            "created_at": datetime.now().isoformat(),
            "retried": False,
        }
        await asyncio.to_thread(
            lambda: supabase.table(fallback_table).insert(fallback_payload).execute()
        )
        logger.info(f"[retry] Permanent failure logged to {fallback_table}")
    except Exception as fallback_exc:
        logger.error(f"[retry] Could not write to {fallback_table}: {fallback_exc!r}")

    return False, last_error
