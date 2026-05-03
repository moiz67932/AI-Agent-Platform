from __future__ import annotations

import json

from fastapi import HTTPException

import webhook_server


def _call_initiated_event() -> dict:
    return {
        "record_type": "event",
        "event_type": "call.initiated",
        "id": "evt-123",
        "occurred_at": "2026-04-23T08:00:00.000000Z",
        "payload": {
            "call_control_id": "v3:call-control",
            "call_leg_id": "leg-123",
            "call_session_id": "session-123",
            "from": "+12025550133",
            "to": "+12025550131",
            "direction": "incoming",
            "state": "parked",
        },
    }


def test_parse_event_accepts_telnyx_data_envelope() -> None:
    event = _call_initiated_event()
    body = json.dumps({"data": event, "meta": {"attempt": 1}}).encode()

    envelope, data, call_payload, event_id, event_type = webhook_server._parse_event(body)

    assert envelope["meta"]["attempt"] == 1
    assert data == event
    assert call_payload["call_control_id"] == "v3:call-control"
    assert event_id == "evt-123"
    assert event_type == "call.initiated"


def test_parse_event_accepts_telnyx_voice_metadata_event_envelope() -> None:
    event = _call_initiated_event()
    body = json.dumps(
        {
            "call_leg_id": "leg-123",
            "call_session_id": "session-123",
            "event_timestamp": "2026-04-23T08:00:00.000000Z",
            "metadata": {
                "attempt": 1,
                "event": event,
                "status": "delivered",
            },
            "name": "call.initiated",
        }
    ).encode()

    envelope, data, call_payload, event_id, event_type = webhook_server._parse_event(body)

    assert envelope["metadata"]["attempt"] == 1
    assert data == event
    assert call_payload["call_control_id"] == "v3:call-control"
    assert event_id == "evt-123"
    assert event_type == "call.initiated"


def test_parse_event_accepts_telnyx_v1_top_level_event_envelope() -> None:
    event = _call_initiated_event()
    body = json.dumps(event).encode()

    envelope, data, call_payload, event_id, event_type = webhook_server._parse_event(body)

    assert envelope == event
    assert data == event
    assert call_payload["call_control_id"] == "v3:call-control"
    assert event_id == "evt-123"
    assert event_type == "call.initiated"


def test_parse_event_normalizes_telnyx_v1_underscore_event_names() -> None:
    event = _call_initiated_event()
    event["event_type"] = "call_initiated"
    body = json.dumps(event).encode()

    _, _, _, _, event_type = webhook_server._parse_event(body)

    assert event_type == "call.initiated"


def test_parse_event_rejects_non_telnyx_voice_payload() -> None:
    try:
        webhook_server._parse_event(b'{"data":{"event_type":"call.initiated"}}')
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail == "Telnyx webhook is missing payload"
    else:
        raise AssertionError("Expected malformed Telnyx event to fail")
