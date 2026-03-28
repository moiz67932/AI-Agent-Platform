from __future__ import annotations

import os

import pytest

import agent_wrapper


@pytest.fixture(autouse=True)
def clear_agent_wrapper_cache(monkeypatch: pytest.MonkeyPatch):
    agent_wrapper.get_agent_config.cache_clear()
    monkeypatch.delenv("AGENT_CONFIG", raising=False)
    monkeypatch.delenv("AGENT_ID", raising=False)
    monkeypatch.delenv("LIVEKIT_AGENT_NAME", raising=False)
    monkeypatch.delenv("DEFAULT_TEST_NUMBER", raising=False)
    yield
    agent_wrapper.get_agent_config.cache_clear()


def test_load_agent_runtime_env_sets_dispatch_name_and_default_number(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(
        "AGENT_CONFIG",
        '{"name":"Aria","phone_number":"+15551234567","livekit_agent_name":"agent-aria","timezone":"America/New_York"}',
    )
    monkeypatch.setenv("AGENT_ID", "550e8400-e29b-41d4-a716-446655440000")

    config = agent_wrapper.load_agent_runtime_env()

    assert config["name"] == "Aria"
    assert os.getenv("LIVEKIT_AGENT_NAME") == "agent-aria"
    assert os.getenv("DEFAULT_TEST_NUMBER") == "+15551234567"


def test_build_fallback_context_uses_local_agent_config(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(
        "AGENT_CONFIG",
        (
            '{"name":"Aria","clinic_name":"Bright Smile Dental","clinic_id":"clinic-123",'
            '"organization_id":"org-123","language":"en-US","notification_email":"owner@example.com"}'
        ),
    )
    monkeypatch.setenv("AGENT_ID", "agent-123")

    clinic_info, agent_info, settings, agent_name = agent_wrapper._build_fallback_context("+15557654321")

    assert clinic_info["name"] == "Bright Smile Dental"
    assert clinic_info["id"] == "clinic-123"
    assert agent_info["id"] == "agent-123"
    assert settings["notification_email"] == "owner@example.com"
    assert agent_name == "Aria"


def test_merge_nested_dict_overrides_non_empty_values():
    merged = agent_wrapper._merge_nested_dict(
        {"config_json": {"services": [{"name": "Cleaning"}]}, "timezone": "UTC"},
        {"config_json": {"calendar_id": "clinic@example.com"}, "timezone": "America/New_York"},
    )

    assert merged["config_json"]["services"][0]["name"] == "Cleaning"
    assert merged["config_json"]["calendar_id"] == "clinic@example.com"
    assert merged["timezone"] == "America/New_York"
