from __future__ import annotations

from scripts import redeploy_agent


def test_redeploy_script_normalize_agent_id_accepts_prefixed_value() -> None:
    assert redeploy_agent.normalize_agent_id("agent-44db9120-b1e4-47d9-a2dc-2348468451f2") == (
        "44db9120-b1e4-47d9-a2dc-2348468451f2"
    )
