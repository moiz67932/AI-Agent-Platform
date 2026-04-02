from __future__ import annotations

import pytest

from agent_platform.server_manager import AgentServerManager


def test_parse_env_content_round_trips_rendered_values() -> None:
    manager = AgentServerManager.__new__(AgentServerManager)
    content = (
        'LIVEKIT_SIP_HOST="54zk61r57ks.sip.livekit.cloud"\n'
        'SIP_AUTH_USERNAME="agent-user"\n'
        'SIP_AUTH_PASSWORD="secret-value"\n'
        'WEBHOOK_BASE_URL="http://178.104.70.97:8001"\n'
    )

    parsed = manager._parse_env_content(content)

    assert parsed["LIVEKIT_SIP_HOST"] == "54zk61r57ks.sip.livekit.cloud"
    assert parsed["SIP_AUTH_USERNAME"] == "agent-user"
    assert parsed["SIP_AUTH_PASSWORD"] == "secret-value"
    assert parsed["WEBHOOK_BASE_URL"] == "http://178.104.70.97:8001"


def test_clear_remote_runtime_bundle_removes_all_runtime_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = AgentServerManager.__new__(AgentServerManager)
    commands: list[tuple[str, bool]] = []

    def fake_exec(client, command: str, *, check: bool = True) -> str:
        commands.append((command, check))
        return ""

    monkeypatch.setattr(manager, "_exec", fake_exec)

    manager._clear_remote_runtime_bundle(object(), "/opt/agents/agent-123")

    assert len(commands) == 1
    command, check = commands[0]
    assert command.startswith("rm -rf ")
    assert "/opt/agents/agent-123/agent.py" in command
    assert "/opt/agents/agent-123/utils" in command
    assert "/opt/agents/agent-123/services" in command
    assert check is False


def test_reload_runtime_processes_requires_supervisor_commands_to_succeed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = AgentServerManager.__new__(AgentServerManager)
    manager.agents_domain = "localhost"
    commands: list[tuple[str, bool]] = []

    def fake_exec(client, command: str, *, check: bool = True) -> str:
        commands.append((command, check))
        return ""

    monkeypatch.setattr(manager, "_exec", fake_exec)

    manager._reload_runtime_processes(object(), "agent-123")

    assert commands == [
        ("supervisorctl reread", True),
        ("supervisorctl update", True),
        ("supervisorctl restart agent-agent-123-worker agent-agent-123-web", True),
    ]


@pytest.mark.asyncio
async def test_verify_remote_env_detects_sip_password_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = AgentServerManager.__new__(AgentServerManager)
    manager.host = "178.104.70.97"
    manager.username = "root"
    manager.key_path = "C:/Users/Moiz/Desktop/id_ed25519"
    manager.agents_domain = "localhost"
    manager.base_remote_dir = "/opt/agents"
    manager.log_dir = "/var/log/agents"

    def fake_build_env_map(agent_id: str, agent_config: dict[str, str], port: int, subdomain: str) -> dict[str, str]:
        return {
            "LIVEKIT_SIP_HOST": "54zk61r57ks.sip.livekit.cloud",
            "LIVEKIT_AGENT_NAME": "agent-f48d9e2a591b",
            "SIP_AUTH_USERNAME": "expected-user",
            "SIP_AUTH_PASSWORD": "expected-pass",
            "DEFAULT_TEST_NUMBER": "+13103410536",
            "PORT": "8001",
            "WORKER_PORT": "9001",
            "WEBHOOK_BASE_URL": "http://178.104.70.97:8001",
        }

    class FakeClient:
        def close(self) -> None:
            return None

    def fake_connect():
        return FakeClient()

    def fake_read_remote_env(client, agent_id: str) -> dict[str, str]:
        return {
            "LIVEKIT_SIP_HOST": "54zk61r57ks.sip.livekit.cloud",
            "LIVEKIT_AGENT_NAME": "agent-f48d9e2a591b",
            "SIP_AUTH_USERNAME": "expected-user",
            "SIP_AUTH_PASSWORD": "actual-pass",
            "DEFAULT_TEST_NUMBER": "+13103410536",
            "PORT": "8001",
            "WORKER_PORT": "9001",
            "WEBHOOK_BASE_URL": "http://178.104.70.97:8001",
        }

    monkeypatch.setattr(manager, "_build_env_map", fake_build_env_map)
    monkeypatch.setattr(manager, "_connect", fake_connect)
    monkeypatch.setattr(manager, "_read_remote_env", fake_read_remote_env)

    with pytest.raises(RuntimeError, match="Remote env verification failed"):
        await manager.verify_remote_env("agent-123", {}, 8001, "test-agent", attempts=1)
