from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_platform import telnyx_provisioner as provisioner_module


@pytest.mark.asyncio
async def test_create_livekit_routing_reuses_dispatch_rule_matched_by_trunk_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provisioner = provisioner_module.TelnyxProvisioner(
        livekit_url="wss://example.livekit.cloud",
        livekit_api_key="key",
        livekit_api_secret="secret",
        livekit_sip_host="54zk61r57ks.sip.livekit.cloud",
    )
    captured: dict[str, object] = {}

    existing_trunk = SimpleNamespace(sip_trunk_id="TRUNK123", numbers=["+13103410536"])
    existing_rule = SimpleNamespace(
        sip_dispatch_rule_id="RULE123",
        name="old-dispatch-name",
        trunk_ids=["TRUNK123"],
        hide_phone_number=False,
        inbound_numbers=[],
        metadata="",
        attributes={},
        room_preset="",
        krisp_enabled=False,
        media_encryption=None,
    )

    class FakeSipApi:
        async def list_inbound_trunk(self, request):
            return SimpleNamespace(items=[existing_trunk])

        async def update_inbound_trunk_fields(self, trunk_id, **kwargs):
            captured["updated_trunk_id"] = trunk_id
            captured["updated_trunk_name"] = kwargs["name"]
            return SimpleNamespace(sip_trunk_id=trunk_id)

        async def list_dispatch_rule(self, request):
            return SimpleNamespace(items=[existing_rule])

        async def update_dispatch_rule(self, dispatch_rule_id, dispatch_rule):
            captured["updated_dispatch_rule_id"] = dispatch_rule_id
            captured["updated_dispatch_name"] = dispatch_rule.name
            captured["updated_dispatch_trunk_ids"] = list(dispatch_rule.trunk_ids)
            return SimpleNamespace(sip_dispatch_rule_id=dispatch_rule_id)

        async def create_dispatch_rule(self, request):
            raise AssertionError("create_dispatch_rule should not be called when a matching rule exists")

    class FakeLiveKitApi:
        def __init__(self) -> None:
            self.sip = FakeSipApi()

        async def aclose(self) -> None:
            captured["closed"] = True

    monkeypatch.setattr(provisioner, "_create_livekit_api", lambda: FakeLiveKitApi())

    result = await provisioner._create_livekit_routing(
        agent_id="agent-123",
        agent_name="agent-test",
        phone_number="+13103410536",
    )

    assert result["livekit_trunk_id"] == "TRUNK123"
    assert result["livekit_dispatch_rule_id"] == "RULE123"
    assert captured["updated_trunk_id"] == "TRUNK123"
    assert captured["updated_trunk_name"] == "agent-test-trunk"
    assert captured["updated_dispatch_rule_id"] == "RULE123"
    assert captured["updated_dispatch_name"] == "agent-test-dispatch"
    assert captured["updated_dispatch_trunk_ids"] == ["TRUNK123"]
    assert captured["closed"] is True
