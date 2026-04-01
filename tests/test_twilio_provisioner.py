from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from agent_platform import twilio_provisioner as provisioner_module


@pytest.mark.asyncio
async def test_create_livekit_routing_binds_the_twilio_number_and_dispatch_trunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provisioner = provisioner_module.TwilioProvisioner(
        account_sid="AC123",
        auth_token="token",
        livekit_url="wss://example.livekit.cloud",
        livekit_api_key="key",
        livekit_api_secret="secret",
        livekit_sip_host="54zk61r57ks.sip.livekit.cloud",
    )
    captured: dict[str, object] = {}

    class FakeSipApi:
        async def create_inbound_trunk(self, request):
            captured["created_trunk_numbers"] = list(request.trunk.numbers)
            captured["created_trunk_auth_username"] = request.trunk.auth_username
            return SimpleNamespace(sip_trunk_id="TRUNK123")

        async def create_dispatch_rule(self, request):
            captured["created_dispatch_trunk_ids"] = list(request.dispatch_rule.trunk_ids)
            captured["created_dispatch_name"] = request.dispatch_rule.name
            return SimpleNamespace(sip_dispatch_rule_id="RULE123")

    class FakeLiveKitApi:
        def __init__(self) -> None:
            self.sip = FakeSipApi()

        async def aclose(self) -> None:
            captured["closed"] = True

    def fake_create_livekit_api():
        return FakeLiveKitApi()

    monkeypatch.setattr(provisioner, "_create_livekit_api", fake_create_livekit_api)

    result = await provisioner._create_livekit_routing(
        agent_id="agent-123",
        phone_number="+13103410536",
        agent_name="agent-test",
        prefer_existing=False,
    )

    assert captured["created_trunk_numbers"] == ["+13103410536"]
    assert captured["created_trunk_auth_username"] == result["sip_auth_username"]
    assert captured["created_dispatch_trunk_ids"] == ["TRUNK123"]
    assert captured["created_dispatch_name"] == "agent-test-dispatch"
    assert result["livekit_trunk_id"] == "TRUNK123"
    assert result["livekit_dispatch_rule_id"] == "RULE123"
    assert captured["closed"] is True


@pytest.mark.asyncio
async def test_existing_twilio_number_reuses_number_but_recreates_livekit_resources(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provisioner = provisioner_module.TwilioProvisioner(
        account_sid="AC123",
        auth_token="token",
        livekit_url="wss://example.livekit.cloud",
        livekit_api_key="key",
        livekit_api_secret="secret",
        livekit_sip_host="54zk61r57ks.sip.livekit.cloud",
    )
    captured: dict[str, object] = {}

    async def fake_get_agent(agent_id: str):
        assert agent_id == "agent-123"
        return {
            "config_json": {
                "twilio_existing_number": "+13103410536",
            },
            "livekit_agent_name": "agent-test",
        }

    async def fake_create_livekit_routing(**kwargs):
        captured["prefer_existing"] = kwargs["prefer_existing"]
        return {
            "livekit_trunk_id": "TRUNK123",
            "livekit_dispatch_rule_id": "RULE123",
            "sip_auth_username": "sip-user",
            "sip_auth_password": "sip-pass",
        }

    async def fake_update_agent_fields(agent_id: str, fields: dict[str, object]):
        captured["updated_fields"] = fields
        return fields

    def fake_find_incoming_number_sync(phone_number: str):
        assert phone_number == "+13103410536"
        return SimpleNamespace(sid="PN123", phone_number=phone_number)

    def fake_update_webhook_sync(phone_sid: str, new_webhook_url: str, *, clear_voice_routing_overrides: bool = False):
        captured["clear_voice_routing_overrides"] = clear_voice_routing_overrides
        return SimpleNamespace(sid=phone_sid)

    async def fake_to_thread(func, /, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(provisioner_module, "get_agent", fake_get_agent)
    monkeypatch.setattr(provisioner_module, "update_agent_fields", fake_update_agent_fields)
    monkeypatch.setattr(provisioner, "_create_livekit_routing", fake_create_livekit_routing)
    monkeypatch.setattr(provisioner, "_find_incoming_number_sync", fake_find_incoming_number_sync)
    monkeypatch.setattr(provisioner, "_update_webhook_sync", fake_update_webhook_sync)
    monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

    result = await provisioner.provision_number("agent-123", "http://178.104.70.97:8001")

    assert captured["clear_voice_routing_overrides"] is True
    assert captured["prefer_existing"] is False
    assert result["livekit_trunk_id"] == "TRUNK123"
    assert result["livekit_dispatch_rule_id"] == "RULE123"


@pytest.mark.asyncio
async def test_release_number_keeps_existing_twilio_number_but_deletes_livekit_resources(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provisioner = provisioner_module.TwilioProvisioner(
        account_sid="AC123",
        auth_token="token",
        livekit_url="wss://example.livekit.cloud",
        livekit_api_key="key",
        livekit_api_secret="secret",
        livekit_sip_host="54zk61r57ks.sip.livekit.cloud",
    )
    captured: dict[str, object] = {
        "deleted_dispatch_rules": [],
        "deleted_trunks": [],
        "released_phone_sid": None,
    }

    async def fake_get_agent(agent_id: str):
        assert agent_id == "agent-123"
        return {
            "twilio_phone_sid": "PN123",
            "livekit_dispatch_rule_id": "RULE123",
            "livekit_trunk_id": "TRUNK123",
            "config_json": {
                "twilio_existing_number": "+13103410536",
                "twilio_release_on_unpublish": False,
            },
        }

    async def fake_update_agent_fields(agent_id: str, fields: dict[str, object]):
        captured["updated_fields"] = fields
        return fields

    class FakeSipApi:
        async def delete_dispatch_rule(self, request):
            captured["deleted_dispatch_rules"].append(request.sip_dispatch_rule_id)

        async def delete_trunk(self, request):
            captured["deleted_trunks"].append(request.sip_trunk_id)

    class FakeLiveKitApi:
        def __init__(self) -> None:
            self.sip = FakeSipApi()

        async def aclose(self) -> None:
            captured["closed"] = True

    def fake_create_livekit_api():
        return FakeLiveKitApi()

    def fake_release_number_sync(phone_sid: str) -> None:
        captured["released_phone_sid"] = phone_sid

    async def fake_to_thread(func, /, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(provisioner_module, "get_agent", fake_get_agent)
    monkeypatch.setattr(provisioner_module, "update_agent_fields", fake_update_agent_fields)
    monkeypatch.setattr(provisioner, "_create_livekit_api", fake_create_livekit_api)
    monkeypatch.setattr(provisioner, "_release_number_sync", fake_release_number_sync)
    monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

    await provisioner.release_number("agent-123")

    assert captured["deleted_dispatch_rules"] == ["RULE123"]
    assert captured["deleted_trunks"] == ["TRUNK123"]
    assert captured["released_phone_sid"] is None
    assert captured["updated_fields"]["livekit_trunk_id"] is None
    assert captured["updated_fields"]["livekit_dispatch_rule_id"] is None


@pytest.mark.asyncio
async def test_create_livekit_routing_requires_explicit_sip_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LIVEKIT_SIP_HOST", raising=False)
    provisioner = provisioner_module.TwilioProvisioner(
        account_sid="AC123",
        auth_token="token",
        livekit_url="wss://sales-agent-fijyxxqg.livekit.cloud",
        livekit_api_key="key",
        livekit_api_secret="secret",
    )

    with pytest.raises(RuntimeError, match="LIVEKIT_SIP_HOST is required"):
        await provisioner._create_livekit_routing(
            agent_id="agent-123",
            phone_number="+13103410536",
            agent_name="agent-test",
            prefer_existing=False,
        )
