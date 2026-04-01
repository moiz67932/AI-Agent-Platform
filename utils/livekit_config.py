"""Helpers for validating LiveKit telephony configuration."""

from __future__ import annotations

from urllib.parse import urlparse


def normalize_livekit_sip_host(value: str) -> str:
    """Return a valid LiveKit SIP host or an empty string.

    LiveKit Cloud telephony uses the SIP URI shown on the project settings
    page. This is not reliably derivable from the public project URL, so we
    only accept explicit SIP hosts here.
    """
    raw = (value or "").strip()
    if not raw:
        return ""

    if raw.startswith("sip:"):
        raw = raw[4:]
    raw = raw.split(";", 1)[0].strip()
    if not raw:
        return ""

    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    hostname = (parsed.hostname or raw).strip()
    if hostname.endswith(".sip.livekit.cloud"):
        return hostname
    return ""
