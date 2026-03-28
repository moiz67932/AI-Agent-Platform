"""Utility helpers for the Python platform backend."""

from __future__ import annotations

import re


def slugify(text: str) -> str:
    """Convert arbitrary text into a URL-safe slug.

    Params:
        text: Source text to normalize.
    Returns:
        Lowercase slug using only alphanumerics and hyphens.
    """
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "agent"


def generate_subdomain(agent_name: str, agent_id: str) -> str:
    """Generate a stable, unique subdomain slug for an agent.

    Params:
        agent_name: Human-readable agent name.
        agent_id: Agent UUID used to guarantee uniqueness.
    Returns:
        A DNS-safe subdomain fragment.
    """
    base = slugify(agent_name)[:40].rstrip("-")
    suffix = slugify(agent_id.replace("-", ""))[:8]
    return f"{base}-{suffix}".strip("-")


def mask_secret(value: str | None) -> str:
    """Redact sensitive values for safe logging.

    Params:
        value: Sensitive value to mask.
    Returns:
        Redacted representation that preserves only a small prefix and suffix.
    """
    if not value:
        return "<empty>"
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"
