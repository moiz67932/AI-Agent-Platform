"""FastAPI webhook server for Telnyx voice callbacks and local agent health."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from livekit import api

from database.db import (
    close_db_pool,
    create_call_log,
    get_call_log_by_provider_call_id,
    init_db_pool,
    record_telephony_webhook_event,
    update_call_log,
)
from post_call_pipeline import post_call_pipeline
from services.telnyx_voice import (
    TelnyxVoiceService,
    build_livekit_sip_destination,
    decode_client_state,
)
from services.telnyx_webhook_verifier import (
    TelnyxWebhookVerificationError,
    TelnyxWebhookVerifier,
)
from utils.livekit_config import normalize_livekit_sip_host


load_dotenv(".env")
load_dotenv(".env.local")

logger = logging.getLogger("voice_platform.webhook_server")
app = FastAPI(title="Agent Webhook Server")
_telnyx_voice = TelnyxVoiceService()
_telnyx_verifier = TelnyxWebhookVerifier()


def _agent_config() -> dict[str, Any]:
    """Return the parsed per-agent runtime config from environment."""
    raw = (os.getenv("AGENT_CONFIG") or "{}").strip()
    if not raw:
        return {}
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def _agent_name() -> str:
    """Return the explicit LiveKit agent name for this runtime."""
    config = _agent_config()
    return str(
        os.getenv("LIVEKIT_AGENT_NAME")
        or config.get("livekit_agent_name")
        or f"agent-{os.getenv('AGENT_ID', 'default').replace('-', '')[:12]}"
    )


def _agent_id() -> str:
    """Return the deployed agent identifier for logging and persistence."""
    config = _agent_config()
    return str(os.getenv("AGENT_ID") or config.get("agent_db_id") or "")


def _log_telnyx_event(event_type: str, payload: dict[str, Any], *, attempt: Any) -> None:
    """Log the provider fields most useful for call-bridge debugging."""
    summary = {
        "event_id": payload.get("event_id"),
        "call_control_id": payload.get("call_control_id"),
        "call_leg_id": payload.get("call_leg_id"),
        "call_session_id": payload.get("call_session_id"),
        "direction": payload.get("direction"),
        "from": payload.get("from"),
        "to": payload.get("to"),
        "state": payload.get("state"),
        "hangup_cause": payload.get("hangup_cause"),
        "attempt": attempt,
    }
    logger.info("[TELNYX] %s %s", event_type, {k: v for k, v in summary.items() if v not in (None, "")})


def _build_livekit_destination(phone_number: str) -> str:
    """Build the LiveKit SIP URI for this agent runtime."""
    sip_host = normalize_livekit_sip_host(os.getenv("LIVEKIT_SIP_HOST", ""))
    if not sip_host:
        raise RuntimeError("LIVEKIT_SIP_HOST is required")
    return build_livekit_sip_destination(phone_number, sip_host)


def _parse_event(raw_body: bytes) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], str, str]:
    """Parse a Telnyx webhook body into envelope and call payload objects."""
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Telnyx webhook payload must be an object")

    data = payload.get("data")
    if not isinstance(data, dict):
        metadata = payload.get("metadata")
        event = metadata.get("event") if isinstance(metadata, dict) else None
        if isinstance(event, dict):
            data = event
    if not isinstance(data, dict) and isinstance(payload.get("payload"), dict):
        data = payload

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Telnyx webhook is missing data")

    call_payload = data.get("payload")
    if not isinstance(call_payload, dict):
        raise HTTPException(status_code=400, detail="Telnyx webhook is missing payload")

    event_id = str(data.get("id") or "").strip()
    event_type = _normalize_telnyx_event_type(str(data.get("event_type") or "").strip())
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Telnyx webhook is missing id or event_type")

    return payload, data, call_payload, event_id, event_type


def _normalize_telnyx_event_type(event_type: str) -> str:
    """Normalize Telnyx v1 and v2 event names to the dotted v2 form."""
    legacy_event_types = {
        "call_initiated": "call.initiated",
        "call_answered": "call.answered",
        "call_hangup": "call.hangup",
        "call_bridged": "call.bridged",
    }
    return legacy_event_types.get(event_type, event_type)


def _derive_status(event_type: str, call_payload: dict[str, Any]) -> str:
    """Map Telnyx webhook data to the platform's call status field."""
    if event_type == "call.hangup":
        return "completed"
    if event_type == "call.bridged":
        return "in_progress"
    return str(call_payload.get("state") or event_type.replace("call.", "")).lower()


def _event_time(data: dict[str, Any]) -> datetime | None:
    """Parse the provider event timestamp when available."""
    occurred_at = str(data.get("occurred_at") or "").strip()
    if not occurred_at:
        return None
    try:
        return datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
    except ValueError:
        return None


def _duration_seconds(call_payload: dict[str, Any], *, ended_at: datetime | None) -> int | None:
    """Best-effort duration extraction for Telnyx hangup events."""
    raw_duration = call_payload.get("call_duration") or call_payload.get("call_duration_secs")
    if raw_duration not in (None, ""):
        try:
            return int(raw_duration)
        except (TypeError, ValueError):
            pass

    started_at = str(call_payload.get("start_time") or "").strip()
    if started_at and ended_at is not None:
        try:
            started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            return max(0, int((ended_at - started).total_seconds()))
        except ValueError:
            return None
    return None


def _should_bridge(event_type: str, direction: str, client_state: dict[str, Any]) -> bool:
    """Return whether an answered Telnyx call should be transferred to LiveKit SIP."""
    if event_type != "call.answered":
        return False
    if direction == "incoming":
        return True
    return bool(client_state.get("bridge_to_agent"))


async def _bridge_call_to_agent(
    *,
    call_control_id: str,
    phone_number: str,
    client_state: dict[str, Any],
) -> None:
    """Transfer a Telnyx call leg into the agent's LiveKit SIP route."""
    sip_auth_username = os.getenv("SIP_AUTH_USERNAME", "").strip()
    sip_auth_password = os.getenv("SIP_AUTH_PASSWORD", "").strip()
    if not sip_auth_username or not sip_auth_password:
        raise RuntimeError("SIP_AUTH_USERNAME and SIP_AUTH_PASSWORD are required")

    await _telnyx_voice.transfer_call(
        call_control_id=call_control_id,
        destination=_build_livekit_destination(phone_number),
        from_number=phone_number,
        command_id=f"transfer-{call_control_id}",
        sip_auth_username=sip_auth_username,
        sip_auth_password=sip_auth_password,
        client_state=client_state or {"bridge_to_agent": True},
    )


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize the database pool on server startup."""
    await init_db_pool()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Close the database pool on server shutdown."""
    await close_db_pool()


@app.get("/health")
async def health() -> JSONResponse:
    """Return the local health status for this agent runtime."""
    return JSONResponse(
        {
            "status": "ok",
            "agent_id": os.getenv("AGENT_ID"),
            "port": int(os.getenv("PORT", "0")),
        }
    )


@app.post("/telnyx/voice")
async def telnyx_voice_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Handle Telnyx Voice API webhooks and bridge calls into LiveKit SIP."""

    raw_body = await request.body()
    try:
        _telnyx_verifier.verify(
            raw_body=raw_body,
            signature=request.headers.get("telnyx-signature-ed25519"),
            timestamp=request.headers.get("telnyx-timestamp"),
        )
    except TelnyxWebhookVerificationError as exc:
        logger.warning(
            "[TELNYX] Webhook verification failed: %s headers_present=%s",
            exc,
            {
                "telnyx-signature-ed25519": bool(request.headers.get("telnyx-signature-ed25519")),
                "telnyx-timestamp": bool(request.headers.get("telnyx-timestamp")),
            },
        )
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        envelope, data, call_payload, event_id, event_type = _parse_event(raw_body)
    except HTTPException as exc:
        logger.warning("[TELNYX] Webhook parse failed: %s", exc.detail)
        raise

    provider_call_id = str(call_payload.get("call_control_id") or "").strip()
    if not provider_call_id:
        logger.warning(
            "[TELNYX] Webhook missing call_control_id event_id=%s event_type=%s payload_keys=%s",
            event_id,
            event_type,
            sorted(call_payload.keys()),
        )
        raise HTTPException(status_code=400, detail="Telnyx webhook is missing call_control_id")
    agent_id = _agent_id()
    inserted = await record_telephony_webhook_event(
        event_id=event_id,
        telephony_provider="telnyx",
        agent_id=agent_id or None,
        provider_call_id=provider_call_id or None,
        event_type=event_type,
        payload={"data": data},
    )
    if not inserted:
        return JSONResponse({"ok": True, "duplicate": True, "event_id": event_id})

    attempt = (envelope.get("meta") or {}).get("attempt") if isinstance(envelope, dict) else None
    _log_telnyx_event(
        event_type,
        {
            "event_id": event_id,
            "call_control_id": call_payload.get("call_control_id"),
            "call_leg_id": call_payload.get("call_leg_id"),
            "call_session_id": call_payload.get("call_session_id"),
            "direction": call_payload.get("direction"),
            "from": call_payload.get("from"),
            "to": call_payload.get("to"),
            "state": call_payload.get("state"),
            "hangup_cause": call_payload.get("hangup_cause"),
        },
        attempt=attempt,
    )

    config = _agent_config()
    phone_number = str(config.get("phone_number") or call_payload.get("to") or "").strip()
    caller_phone = str(call_payload.get("from") or "").strip() or None
    client_state = decode_client_state(str(call_payload.get("client_state") or ""))
    direction = str(call_payload.get("direction") or "").strip().lower()
    existing_call = await get_call_log_by_provider_call_id(provider_call_id) if provider_call_id else None

    if provider_call_id and existing_call is None:
        existing_call = await create_call_log(
            agent_id=agent_id,
            clinic_id=config.get("clinic_id"),
            organization_id=config.get("organization_id") or config.get("org_id"),
            telephony_provider="telnyx",
            provider_call_id=provider_call_id,
            provider_call_leg_id=str(call_payload.get("call_leg_id") or "") or None,
            provider_call_session_id=str(call_payload.get("call_session_id") or "") or None,
            livekit_room=None,
            caller_phone=caller_phone,
            status=_derive_status(event_type, call_payload),
        )

    if existing_call is not None:
        updates: dict[str, Any] = {
            "status": _derive_status(event_type, call_payload),
            "provider_call_leg_id": str(call_payload.get("call_leg_id") or "") or existing_call.get("provider_call_leg_id"),
            "provider_call_session_id": str(call_payload.get("call_session_id") or "") or existing_call.get("provider_call_session_id"),
        }
        ended_at = _event_time(data)
        if event_type == "call.hangup":
            updates["ended_at"] = ended_at or datetime.now(timezone.utc)
            duration = _duration_seconds(call_payload, ended_at=ended_at)
            if duration is not None:
                updates["duration_seconds"] = duration
        await update_call_log(str(existing_call["id"]), updates)

    if event_type == "call.initiated" and direction == "incoming":
        await _telnyx_voice.answer_call(
            call_control_id=provider_call_id,
            command_id=f"answer-{event_id}",
            client_state={"bridge_to_agent": True, **client_state},
        )
    elif _should_bridge(event_type, direction, client_state):
        await _bridge_call_to_agent(
            call_control_id=provider_call_id,
            phone_number=phone_number,
            client_state={"bridge_to_agent": True, **client_state},
        )
    elif event_type == "call.hangup" and provider_call_id and not client_state.get("test_mode"):
        background_tasks.add_task(post_call_pipeline, provider_call_id, config)

    return JSONResponse({"ok": True, "event_id": event_id, "event_type": event_type})


@app.post("/internal/test")
async def internal_test_call(
    background_tasks: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
) -> JSONResponse:
    """Create a browser-test room and explicitly dispatch this agent."""
    del background_tasks
    expected_secret = os.getenv("INTERNAL_SECRET", "")
    if not expected_secret or x_internal_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    livekit_url = os.getenv("LIVEKIT_URL", "")
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")
    if not livekit_url or not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="LiveKit is not configured")

    room_name = f"test-{os.getenv('AGENT_ID', 'agent')[:8]}-{int(datetime.now(timezone.utc).timestamp())}"
    participant_identity = f"tester-{os.getenv('AGENT_ID', 'agent')[:8]}"

    token = (
        api.AccessToken(api_key=api_key, api_secret=api_secret)
        .with_identity(participant_identity)
        .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True))
        .to_jwt()
    )

    lkapi = api.LiveKitAPI(url=livekit_url, api_key=api_key, api_secret=api_secret)
    try:
        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                room=room_name,
                agent_name=_agent_name(),
                metadata=json.dumps(
                    {
                        "agent_id": os.getenv("AGENT_ID"),
                        "test_mode": True,
                    },
                    separators=(",", ":"),
                ),
            )
        )
    finally:
        await lkapi.aclose()

    return JSONResponse({"room_name": room_name, "token": token, "livekit_url": livekit_url})
