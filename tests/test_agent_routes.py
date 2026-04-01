from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from agent_platform.routes import agents as routes

RAW_AGENT_ID = "44db9120-b1e4-47d9-a2dc-2348468451f2"
PREFIXED_AGENT_ID = f"agent-{RAW_AGENT_ID}"


@pytest.mark.asyncio
async def test_redeploy_agent_route_syncs_runtime_and_restores_live_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_manager = SimpleNamespace(
        redeploy_agent=AsyncMock(
            return_value={
                "health_url": "http://127.0.0.1:8001/health",
                "remote_dir": "/opt/agents/agent-123",
                "webhook_base_url": "http://127.0.0.1:8001",
            }
        ),
        verify_remote_env=AsyncMock(),
    )
    update_calls: list[dict[str, object]] = []

    async def fake_update_agent_fields(agent_id: str, fields: dict[str, object], connection=None):
        update_calls.append(fields)
        return {"id": agent_id, **fields}

    monkeypatch.setattr(routes, "get_server_manager", lambda: fake_manager)
    monkeypatch.setattr(
        routes,
        "get_agent",
        AsyncMock(return_value={"id": RAW_AGENT_ID, "port": 8001, "subdomain": "demo-agent", "status": "live"}),
    )
    monkeypatch.setattr(
        routes,
        "get_agent_with_clinic",
        AsyncMock(
            return_value={
                "id": RAW_AGENT_ID,
                "name": "Demo Agent",
                "organization_id": "org-123",
                "clinic_id": "clinic-123",
                "config_json": {"timezone": "Asia/Tashkent"},
                "phone_number": "+15555550123",
                "livekit_agent_name": "agent-demo",
            }
        ),
    )
    monkeypatch.setattr(routes, "update_agent_fields", fake_update_agent_fields)

    response = await routes.redeploy_agent(PREFIXED_AGENT_ID)

    assert response["status"] == "live"
    assert response["webhook_base_url"] == "http://127.0.0.1:8001"
    assert update_calls == [
        {"status": "deploying", "deploy_error": None},
        {"status": "live", "deploy_error": None},
    ]

    routes.get_agent.assert_awaited_with(RAW_AGENT_ID)
    routes.get_agent_with_clinic.assert_awaited_with(RAW_AGENT_ID)
    redeploy_call = fake_manager.redeploy_agent.await_args
    assert redeploy_call.args[0] == RAW_AGENT_ID
    assert redeploy_call.args[2] == 8001
    assert redeploy_call.args[3] == "demo-agent"
    assert redeploy_call.args[1]["agent_name"] == "Demo Agent"
    assert redeploy_call.args[1]["timezone"] == "Asia/Tashkent"
    fake_manager.verify_remote_env.assert_awaited_once()


@pytest.mark.asyncio
async def test_redeploy_agent_route_requires_existing_publish(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        routes,
        "get_agent",
        AsyncMock(return_value={"id": RAW_AGENT_ID, "port": None, "subdomain": None, "status": "offline"}),
    )

    with pytest.raises(HTTPException) as exc_info:
        await routes.redeploy_agent(PREFIXED_AGENT_ID)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Agent is not published yet"


def test_normalize_agent_id_accepts_prefixed_value() -> None:
    assert routes._normalize_agent_id(PREFIXED_AGENT_ID) == RAW_AGENT_ID
