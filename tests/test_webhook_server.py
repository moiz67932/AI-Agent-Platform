from __future__ import annotations

import webhook_server


def test_build_twiml_sip_response_uses_explicit_project_sip_host(monkeypatch) -> None:
    monkeypatch.setenv("LIVEKIT_SIP_HOST", "54zk61r57ks.sip.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_URL", "wss://sales-agent-fijyxxqg.livekit.cloud")
    monkeypatch.setenv("SIP_AUTH_USERNAME", "sip-user")
    monkeypatch.setenv("SIP_AUTH_PASSWORD", "sip-pass")
    monkeypatch.setenv("WEBHOOK_BASE_URL", "http://178.104.70.97:8001")

    twiml = webhook_server._build_twiml_sip_response("+13103410536")

    assert 'callerId="+13103410536"' in twiml
    assert 'answerOnBridge="true"' in twiml
    assert 'action="http://178.104.70.97:8001/twilio/dial-action"' in twiml
    assert 'statusCallback="http://178.104.70.97:8001/twilio/sip-status"' in twiml
    assert 'statusCallbackEvent="initiated ringing answered completed"' in twiml
    assert 'sip:+13103410536@54zk61r57ks.sip.livekit.cloud;transport=tcp' in twiml


def test_build_twiml_sip_response_requires_webhook_base_url(monkeypatch) -> None:
    monkeypatch.setenv("LIVEKIT_SIP_HOST", "54zk61r57ks.sip.livekit.cloud")
    monkeypatch.setenv("SIP_AUTH_USERNAME", "sip-user")
    monkeypatch.setenv("SIP_AUTH_PASSWORD", "sip-pass")
    monkeypatch.delenv("WEBHOOK_BASE_URL", raising=False)

    try:
        webhook_server._build_twiml_sip_response("+13103410536")
    except RuntimeError as exc:
        assert "WEBHOOK_BASE_URL is required" in str(exc)
    else:
        raise AssertionError("Expected RuntimeError when WEBHOOK_BASE_URL is missing")


def test_build_twiml_sip_response_does_not_guess_sip_host_from_livekit_url(monkeypatch) -> None:
    monkeypatch.delenv("LIVEKIT_SIP_HOST", raising=False)
    monkeypatch.setenv("LIVEKIT_URL", "wss://sales-agent-fijyxxqg.livekit.cloud")
    monkeypatch.setenv("SIP_AUTH_USERNAME", "sip-user")
    monkeypatch.setenv("SIP_AUTH_PASSWORD", "sip-pass")
    monkeypatch.setenv("WEBHOOK_BASE_URL", "http://178.104.70.97:8001")

    try:
        webhook_server._build_twiml_sip_response("+13103410536")
    except RuntimeError as exc:
        assert "LIVEKIT_SIP_HOST" in str(exc)
    else:
        raise AssertionError("Expected RuntimeError when LIVEKIT_SIP_HOST is missing")
