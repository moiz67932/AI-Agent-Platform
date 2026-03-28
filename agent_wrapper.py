"""Thin wrapper over `agent.py` for per-tenant environment-driven config."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from dotenv import load_dotenv


load_dotenv(".env")
load_dotenv(".env.local")


def load_agent_runtime_env() -> dict[str, Any]:
    """Load per-agent dotenv values and normalize key runtime env vars.

    Returns:
        Parsed `AGENT_CONFIG` dictionary.
    Raises:
        ValueError: If `AGENT_CONFIG` is invalid JSON.
    """
    config = get_agent_config()
    agent_id = os.getenv("AGENT_ID", "").strip()

    if config.get("livekit_agent_name") and not os.getenv("LIVEKIT_AGENT_NAME"):
        os.environ["LIVEKIT_AGENT_NAME"] = str(config["livekit_agent_name"])
    elif agent_id and not os.getenv("LIVEKIT_AGENT_NAME"):
        os.environ["LIVEKIT_AGENT_NAME"] = f"agent-{agent_id.replace('-', '')[:12]}"

    default_test_number = str(
        config.get("phone_number")
        or config.get("default_test_number")
        or ""
    ).strip()
    if default_test_number and not os.getenv("DEFAULT_TEST_NUMBER"):
        os.environ["DEFAULT_TEST_NUMBER"] = default_test_number

    return config


@lru_cache(maxsize=1)
def get_agent_config() -> dict[str, Any]:
    """Parse the `AGENT_CONFIG` JSON blob from the environment.

    Returns:
        Parsed configuration dictionary.
    Raises:
        ValueError: If `AGENT_CONFIG` is present but invalid JSON.
    """
    raw = (os.getenv("AGENT_CONFIG") or "{}").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("AGENT_CONFIG must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("AGENT_CONFIG must decode to a JSON object")
    return parsed


def get_livekit_agent_name() -> str:
    """Return the explicit LiveKit agent name for this runtime.

    Returns:
        Agent dispatch name.
    """
    config = load_agent_runtime_env()
    return str(
        os.getenv("LIVEKIT_AGENT_NAME")
        or config.get("livekit_agent_name")
        or f"agent-{os.getenv('AGENT_ID', 'default').replace('-', '')[:12]}"
    )


def _build_fallback_context(called_number: str | None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], str]:
    """Build a minimal clinic/agent/settings tuple from local config.

    Params:
        called_number: The inbound called number if available.
    Returns:
        Tuple shaped like `fetch_clinic_context_optimized`.
    """
    config = load_agent_runtime_env()
    agent_id = os.getenv("AGENT_ID", "").strip() or None
    clinic_name = str(
        config.get("clinic_name")
        or config.get("business_name")
        or config.get("tenant_name")
        or config.get("name")
        or "Clinic"
    )
    agent_name = str(
        config.get("agent_name")
        or config.get("name")
        or config.get("assistant_name")
        or "Office Assistant"
    )
    clinic_info = {
        "id": config.get("clinic_id"),
        "organization_id": config.get("organization_id") or config.get("org_id"),
        "name": clinic_name,
        "timezone": config.get("timezone") or config.get("clinic_timezone"),
        "default_phone_region": config.get("phone_region") or config.get("default_phone_region") or "US",
        "phone": config.get("phone_number") or called_number,
    }
    agent_info = {
        "id": config.get("agent_db_id") or agent_id,
        "clinic_id": clinic_info.get("id"),
        "organization_id": clinic_info.get("organization_id"),
        "name": agent_name,
        "default_language": config.get("language") or config.get("default_language") or "en-US",
        "status": "live",
    }
    settings = {
        "id": config.get("agent_settings_id"),
        "greeting_text": config.get("greeting_text"),
        "persona_tone": config.get("persona") or config.get("persona_tone"),
        "working_hours": config.get("working_hours"),
        "services": config.get("services"),
        "calendar_id": config.get("calendar_id"),
        "notification_email": config.get("notification_email"),
        "config_json": config,
    }
    return clinic_info, agent_info, settings, agent_name


def _merge_nested_dict(base: dict[str, Any] | None, overlay: dict[str, Any] | None) -> dict[str, Any]:
    """Merge two dictionaries with overlay values taking precedence.

    Params:
        base: Original dictionary.
        overlay: Overlay dictionary.
    Returns:
        Merged dictionary.
    """
    merged: dict[str, Any] = dict(base or {})
    for key, value in (overlay or {}).items():
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_nested_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def _install_context_override() -> Any:
    """Patch `fetch_clinic_context_optimized` to merge env config with DB state.

    Returns:
        Imported `agent` module after the override is installed.
    """
    load_agent_runtime_env()
    import agent as agent_module
    import services.database_service as database_service

    if getattr(agent_module, "_MULTITENANT_WRAPPER_INSTALLED", False):
        return agent_module

    original_fetch = database_service.fetch_clinic_context_optimized

    async def wrapped_fetch(called_number: str, use_cache: bool = True) -> tuple[Any, Any, Any, str]:
        """Merge DB-loaded context with per-agent local overrides.

        Params:
            called_number: Inbound called number.
            use_cache: Whether the original DB layer may use cache.
        Returns:
            Context tuple consumed by `agent.py`.
        """
        config = load_agent_runtime_env()
        fallback_clinic, fallback_agent, fallback_settings, fallback_name = _build_fallback_context(called_number)
        expected_clinic_id = str(config.get("clinic_id") or "").strip()
        expected_agent_id = str(config.get("agent_db_id") or os.getenv("AGENT_ID") or "").strip()

        clinic_info, agent_info, settings, agent_name = await original_fetch(called_number, use_cache=use_cache)
        if not clinic_info and not agent_info and not settings:
            return fallback_clinic, fallback_agent, fallback_settings, fallback_name

        clinic_id = str((clinic_info or {}).get("id") or "").strip()
        agent_id = str((agent_info or {}).get("id") or "").strip()
        if expected_clinic_id and clinic_id and clinic_id != expected_clinic_id:
            return fallback_clinic, fallback_agent, fallback_settings, fallback_name
        if expected_agent_id and agent_id and agent_id != expected_agent_id:
            return fallback_clinic, fallback_agent, fallback_settings, fallback_name

        merged_clinic = _merge_nested_dict(clinic_info, fallback_clinic)
        merged_agent = _merge_nested_dict(agent_info, fallback_agent)
        merged_settings = _merge_nested_dict(settings, fallback_settings)
        merged_settings["config_json"] = _merge_nested_dict(
            (settings or {}).get("config_json") if isinstance(settings, dict) else {},
            fallback_settings.get("config_json"),
        )
        merged_name = str(merged_agent.get("name") or fallback_name or agent_name or "Office Assistant")
        return merged_clinic, merged_agent, merged_settings, merged_name

    database_service.fetch_clinic_context_optimized = wrapped_fetch
    agent_module.fetch_clinic_context_optimized = wrapped_fetch
    agent_module._MULTITENANT_WRAPPER_INSTALLED = True
    return agent_module


async def entrypoint(ctx: Any) -> None:
    """Delegate to the original agent entrypoint after installing overrides.

    Params:
        ctx: LiveKit job context.
    Returns:
        None.
    """
    agent_module = _install_context_override()
    await agent_module.entrypoint(ctx)


async def wrap_entrypoint(ctx: Any) -> None:
    """Backward-compatible alias for the multi-tenant wrapped entrypoint."""
    await entrypoint(ctx)
