"""FastAPI routes for publishing, restarting, and inspecting agents."""

from __future__ import annotations

import asyncio
import json
import os
from functools import lru_cache
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from agent_platform.server_manager import AgentServerManager
from agent_platform.twilio_provisioner import TwilioProvisioner
from agent_platform.utils import generate_subdomain
from database.db import (
    db_transaction,
    get_agent,
    get_agent_analytics,
    get_next_free_port,
    list_agent_appointments,
    list_agent_calls,
    release_port,
    update_agent_fields,
)

router = APIRouter(tags=["agents"])


@lru_cache(maxsize=1)
def get_server_manager() -> AgentServerManager:
    """Return the shared SSH deployment manager."""
    return AgentServerManager()


@lru_cache(maxsize=1)
def get_twilio_provisioner() -> TwilioProvisioner:
    """Return the shared Twilio/LiveKit provisioner."""
    return TwilioProvisioner()


def _normalize_config_json(value: Any) -> dict[str, Any]:
    """Normalize a JSON/blob field into a dictionary.

    Params:
        value: Database JSON value or JSON string.
    Returns:
        Parsed configuration dictionary.
    """
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}


def _json_safe(value: Any) -> Any:
    """Convert DB-native values like UUIDs into JSON-safe primitives."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _build_runtime_agent_config(agent_row: dict[str, Any]) -> dict[str, Any]:
    """Merge DB fields into the runtime config shared with the deployed agent.

    Params:
        agent_row: Agent row from the database.
    Returns:
        Runtime config dictionary.
    """
    config = _json_safe(_normalize_config_json(agent_row.get("config_json")))
    config.setdefault("name", agent_row.get("name"))
    config.setdefault("agent_name", agent_row.get("name"))
    config.setdefault("agent_db_id", _json_safe(agent_row.get("id")))
    config.setdefault("organization_id", _json_safe(agent_row.get("organization_id")))
    config.setdefault("clinic_id", _json_safe(agent_row.get("clinic_id")))
    config.setdefault("livekit_agent_name", agent_row.get("livekit_agent_name"))
    config.setdefault("phone_number", agent_row.get("phone_number"))
    config.setdefault("sip_auth_username", agent_row.get("sip_auth_username"))
    config.setdefault("sip_auth_password", agent_row.get("sip_auth_password"))
    config.setdefault("timezone", config.get("timezone") or "UTC")
    config.setdefault("country", config.get("country") or "US")
    return config


@router.post("/api/agents/{agent_id}/publish")
async def publish_agent(agent_id: str) -> dict[str, Any]:
    """Reserve infra, deploy the agent, and provision telephony.

    Params:
        agent_id: Agent UUID from the route path.
    Returns:
        Live deployment details including phone number and webhook URL.
    Raises:
        HTTPException: If the agent is missing or the publish workflow fails.
    """
    server_manager = get_server_manager()
    twilio_provisioner = get_twilio_provisioner()
    async with db_transaction() as connection:
        agent_row = await get_agent(agent_id, connection=connection)
        if agent_row is None:
            raise HTTPException(status_code=404, detail="Agent not found")

        existing_status = str(agent_row.get("status") or "").lower()
        if existing_status == "live" and agent_row.get("phone_number"):
            return {
                "agent_id": agent_id,
                "status": "live",
                "phone_number": agent_row.get("phone_number"),
                "webhook_base_url": server_manager.build_webhook_base_url(
                    str(agent_row.get("subdomain")),
                    int(agent_row.get("port")),
                ),
            }

        port = await get_next_free_port(agent_id, connection=connection)
        subdomain = generate_subdomain(str(agent_row.get("name") or "agent"), agent_id)
        livekit_agent_name = str(agent_row.get("livekit_agent_name") or f"agent-{agent_id.replace('-', '')[:12]}")
        agent_row = await update_agent_fields(
            agent_id,
            {
                "status": "offline",
                "deploy_error": None,
                "port": port,
                "subdomain": subdomain,
                "livekit_agent_name": livekit_agent_name,
                "hetzner_server_ip": os.getenv("HETZNER_SERVER_IP"),
            },
            connection=connection,
        )

    runtime_config = _build_runtime_agent_config(agent_row)
    webhook_base_url = server_manager.build_webhook_base_url(str(agent_row["subdomain"]), int(agent_row["port"]))
    country = str(runtime_config.get("country") or "US")

    deploy_task = asyncio.create_task(
        server_manager.deploy_agent(agent_id, runtime_config, int(agent_row["port"]), str(agent_row["subdomain"]))
    )
    provision_task = asyncio.create_task(
        twilio_provisioner.provision_number(agent_id, webhook_base_url, country=country)
    )

    try:
        deploy_result_raw, provision_result_raw = await asyncio.gather(
            deploy_task,
            provision_task,
            return_exceptions=True,
        )
        if isinstance(deploy_result_raw, Exception):
            raise deploy_result_raw
        if isinstance(provision_result_raw, Exception):
            raise provision_result_raw
        deploy_result = deploy_result_raw
        provision_result = provision_result_raw
        latest_agent = await get_agent(agent_id)
        if latest_agent is None:
            raise HTTPException(status_code=404, detail="Agent disappeared during publish")

        latest_config = _build_runtime_agent_config(latest_agent)
        await server_manager.sync_agent_env(agent_id, latest_config, int(latest_agent["port"]), str(latest_agent["subdomain"]))
        latest_agent = await update_agent_fields(agent_id, {"status": "live", "deploy_error": None})
        return {
            "agent_id": agent_id,
            "status": latest_agent["status"],
            "phone_number": latest_agent.get("phone_number"),
            "webhook_base_url": deploy_result["webhook_base_url"],
            "health_url": deploy_result["health_url"],
            "livekit_agent_name": latest_agent.get("livekit_agent_name"),
            "livekit_dispatch_rule_id": latest_agent.get("livekit_dispatch_rule_id"),
            "livekit_trunk_id": latest_agent.get("livekit_trunk_id"),
            "twilio_phone_sid": provision_result["phone_sid"],
        }
    except Exception as exc:
        try:
            await server_manager.remove_agent(
                agent_id,
                int(agent_row["port"]) if agent_row.get("port") is not None else None,
                str(agent_row["subdomain"]) if agent_row.get("subdomain") else None,
            )
        except Exception:
            pass
        if provision_task.done() and not provision_task.cancelled() and provision_task.exception() is None:
            await twilio_provisioner.release_number(agent_id)
        async with db_transaction() as connection:
            if agent_row.get("port") is not None:
                await release_port(int(agent_row["port"]), connection=connection)
            await update_agent_fields(
                agent_id,
                {
                    "status": "offline",
                    "deploy_error": str(exc),
                    "port": None,
                    "subdomain": None,
                },
                connection=connection,
            )
        raise HTTPException(status_code=500, detail=f"Publish failed: {exc}") from exc


@router.post("/api/agents/{agent_id}/unpublish")
async def unpublish_agent(agent_id: str) -> dict[str, Any]:
    """Remove a deployed agent and release its reserved telephony resources.

    Params:
        agent_id: Agent UUID from the route path.
    Returns:
        JSON payload confirming the teardown.
    Raises:
        HTTPException: If the agent does not exist.
    """
    server_manager = get_server_manager()
    twilio_provisioner = get_twilio_provisioner()
    agent_row = await get_agent(agent_id)
    if agent_row is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    await server_manager.remove_agent(
        agent_id,
        int(agent_row["port"]) if agent_row.get("port") is not None else None,
        str(agent_row["subdomain"]) if agent_row.get("subdomain") else None,
    )
    if agent_row.get("twilio_phone_sid") or agent_row.get("livekit_dispatch_rule_id") or agent_row.get("livekit_trunk_id"):
        await twilio_provisioner.release_number(agent_id)

    async with db_transaction() as connection:
        if agent_row.get("port"):
            await release_port(int(agent_row["port"]), connection=connection)
        await update_agent_fields(
            agent_id,
            {
                "status": "offline",
                "deploy_error": None,
                "port": None,
                "subdomain": None,
            },
            connection=connection,
        )
    return {"agent_id": agent_id, "status": "offline"}


@router.post("/api/agents/{agent_id}/restart")
async def restart_agent(agent_id: str) -> dict[str, Any]:
    """Restart the remote worker and webhook processes.

    Params:
        agent_id: Agent UUID from the route path.
    Returns:
        Restart confirmation and current supervisor status.
    """
    server_manager = get_server_manager()
    if await get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    await server_manager.restart_agent(agent_id)
    return {"agent_id": agent_id, "status": await server_manager.get_agent_status(agent_id)}


@router.get("/api/agents/{agent_id}/logs")
async def get_agent_logs(agent_id: str, lines: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    """Return recent supervisor logs for the agent.

    Params:
        agent_id: Agent UUID from the route path.
        lines: Number of log lines to fetch.
    Returns:
        Combined supervisor logs.
    """
    server_manager = get_server_manager()
    if await get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"agent_id": agent_id, "logs": await server_manager.tail_logs(agent_id, lines=lines)}


@router.get("/api/agents/{agent_id}/status")
async def get_agent_status(agent_id: str) -> dict[str, Any]:
    """Return the current persisted status and derived public URL for an agent.

    Params:
        agent_id: Agent UUID from the route path.
    Returns:
        Agent lifecycle state, derived URL, and recent deploy error if any.
    """
    agent_row = await get_agent(agent_id)
    if agent_row is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    url = None
    if agent_row.get("subdomain") and agent_row.get("port"):
        url = get_server_manager().build_webhook_base_url(
            str(agent_row["subdomain"]),
            int(agent_row["port"]),
        )

    derived_status = agent_row.get("status")
    if derived_status != "live" and agent_row.get("deploy_error"):
        derived_status = "error"

    return {
        "agent_id": agent_id,
        "status": derived_status,
        "phone_number": agent_row.get("phone_number"),
        "url": url,
        "port": agent_row.get("port"),
        "subdomain": agent_row.get("subdomain"),
        "deploy_error": agent_row.get("deploy_error"),
    }


@router.get("/api/agents/{agent_id}/analytics")
async def get_analytics(agent_id: str, days: int = Query(default=30, ge=1, le=365)) -> dict[str, Any]:
    """Return daily analytics rows for an agent.

    Params:
        agent_id: Agent UUID from the route path.
        days: Number of trailing days to include.
    Returns:
        Analytics data list.
    """
    if await get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"agent_id": agent_id, "data": await get_agent_analytics(agent_id, days=days)}


@router.get("/api/agents/{agent_id}/calls")
async def get_calls(
    agent_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: str = Query(default="all"),
) -> dict[str, Any]:
    """Return paginated call logs for an agent.

    Params:
        agent_id: Agent UUID from the route path.
        page: 1-based page number.
        limit: Number of rows per page.
        status: Optional status filter.
    Returns:
        Paginated call log data.
    """
    if await get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "agent_id": agent_id,
        "page": page,
        "limit": limit,
        "data": await list_agent_calls(agent_id, page=page, limit=limit, status=status),
    }


@router.get("/api/agents/{agent_id}/appointments")
async def get_appointments(
    agent_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    """Return paginated appointments for an agent.

    Params:
        agent_id: Agent UUID from the route path.
        page: 1-based page number.
        limit: Number of rows per page.
    Returns:
        Paginated appointment data.
    """
    if await get_agent(agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "agent_id": agent_id,
        "page": page,
        "limit": limit,
        "data": await list_agent_appointments(agent_id, page=page, limit=limit),
    }
