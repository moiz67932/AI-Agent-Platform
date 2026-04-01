"""FastAPI webhook server for Twilio voice callbacks and local agent health."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from livekit import api
from twilio.request_validator import RequestValidator

from database.db import (
    create_call_log,
    get_call_log_by_sid,
    init_db_pool,
    close_db_pool,
    update_call_log,
)
from post_call_pipeline import post_call_pipeline
from utils.livekit_config import normalize_livekit_sip_host


load_dotenv(".env")
load_dotenv(".env.local")

logger = logging.getLogger("voice_platform.webhook_server")
app = FastAPI(title="Agent Webhook Server")


def _agent_config() -> dict[str, Any]:
    """Return the parsed per-agent runtime config from environment.

    Returns:
        Parsed agent configuration dictionary.
    """
    raw = (os.getenv("AGENT_CONFIG") or "{}").strip()
    if not raw:
        return {}
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def _agent_name() -> str:
    """Return the explicit LiveKit agent name for this runtime.

    Returns:
        Agent dispatch name.
    """
    config = _agent_config()
    return str(
        os.getenv("LIVEKIT_AGENT_NAME")
        or config.get("livekit_agent_name")
        or f"agent-{os.getenv('AGENT_ID', 'default').replace('-', '')[:12]}"
    )


def _log_twilio_event(event: str, payload: dict[str, Any]) -> None:
    """Log the Twilio fields most useful for call-bridge debugging."""
    keys = [
        "CallSid",
        "ParentCallSid",
        "CallStatus",
        "Direction",
        "From",
        "To",
        "DialCallSid",
        "DialCallStatus",
        "DialSipCallId",
        "DialSipResponseCode",
        "SipResponseCode",
        "CallDuration",
    ]
    summary = {key: payload.get(key) for key in keys if payload.get(key) not in (None, "")}
    logger.info("[TWILIO] %s %s", event, summary)


def _build_twiml_sip_response(phone_number: str) -> str:
    """Render the TwiML response that bridges Twilio voice to LiveKit SIP.

    Params:
        phone_number: Purchased Twilio phone number for this agent.
    Returns:
        TwiML XML string.
    Raises:
        RuntimeError: If SIP routing env vars are missing.
    """
    sip_host = normalize_livekit_sip_host(os.getenv("LIVEKIT_SIP_HOST", ""))
    sip_username = os.getenv("SIP_AUTH_USERNAME", "").strip()
    sip_password = os.getenv("SIP_AUTH_PASSWORD", "").strip()
    webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "").rstrip("/")
    if not sip_host or not sip_username or not sip_password:
        raise RuntimeError("LIVEKIT_SIP_HOST, SIP_AUTH_USERNAME, and SIP_AUTH_PASSWORD are required")
    if not webhook_base_url:
        raise RuntimeError("WEBHOOK_BASE_URL is required")

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Dial answerOnBridge="true" callerId="{phone_number}" action="{webhook_base_url}/twilio/dial-action" method="POST">'
        f'<Sip username="{sip_username}" password="{sip_password}" '
        f'statusCallback="{webhook_base_url}/twilio/sip-status" '
        'statusCallbackEvent="initiated ringing answered completed" '
        'statusCallbackMethod="POST">'
        f"sip:{phone_number}@{sip_host};transport=tcp"
        "</Sip></Dial>"
        "</Response>"
    )


async def _validate_twilio_request(request: Request, form_data: dict[str, Any]) -> None:
    """Validate Twilio request signatures for incoming webhooks.

    Params:
        request: FastAPI request object.
        form_data: Parsed request form fields.
    Returns:
        None.
    Raises:
        HTTPException: If signature validation fails.
    """
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not auth_token:
        raise HTTPException(status_code=500, detail="TWILIO_AUTH_TOKEN is not configured")

    signature = request.headers.get("X-Twilio-Signature", "")
    webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "").rstrip("/")
    validation_url = f"{webhook_base_url}{request.url.path}"
    if request.url.query:
        validation_url = f"{validation_url}?{request.url.query}"

    validator = RequestValidator(auth_token)
    if not validator.validate(validation_url, form_data, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


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


@app.post("/twilio/voice")
async def twilio_voice(request: Request) -> PlainTextResponse:
    """Handle Twilio voice webhooks and hand calls off to LiveKit SIP.

    Params:
        request: FastAPI request object.
    Returns:
        TwiML response that bridges the call into LiveKit.
    """
    form = await request.form()
    payload = {key: value for key, value in form.items()}
    await _validate_twilio_request(request, payload)
    _log_twilio_event("voice_webhook", payload)

    config = _agent_config()
    call_sid = str(payload.get("CallSid") or "")
    caller_phone = str(payload.get("From") or "")
    phone_number = str(config.get("phone_number") or payload.get("To") or "")
    existing_call = await get_call_log_by_sid(call_sid) if call_sid else None
    if existing_call is None and call_sid:
        await create_call_log(
            agent_id=str(os.getenv("AGENT_ID")),
            clinic_id=config.get("clinic_id"),
            organization_id=config.get("organization_id") or config.get("org_id"),
            twilio_call_sid=call_sid,
            livekit_room=None,
            caller_phone=caller_phone or None,
            status="initiated",
        )

    twiml = _build_twiml_sip_response(phone_number)
    return PlainTextResponse(twiml, media_type="application/xml")


@app.post("/twilio/status")
async def twilio_status(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    """Handle Twilio status callbacks and trigger post-call processing.

    Params:
        request: FastAPI request object.
        background_tasks: FastAPI background task manager.
    Returns:
        JSON status payload.
    """
    form = await request.form()
    payload = {key: value for key, value in form.items()}
    await _validate_twilio_request(request, payload)
    _log_twilio_event("call_status", payload)

    call_sid = str(payload.get("CallSid") or "")
    call_status = str(payload.get("CallStatus") or "").lower()
    duration = int(payload.get("CallDuration") or 0)
    call_log = await get_call_log_by_sid(call_sid)
    if call_log is None and call_sid:
        config = _agent_config()
        call_log = await create_call_log(
            agent_id=str(os.getenv("AGENT_ID")),
            clinic_id=config.get("clinic_id"),
            organization_id=config.get("organization_id") or config.get("org_id"),
            twilio_call_sid=call_sid,
            livekit_room=None,
            caller_phone=str(payload.get("From") or "") or None,
            status=call_status or "initiated",
        )

    if call_log is not None:
        updates: dict[str, Any] = {
            "status": call_status or call_log.get("status"),
            "duration_seconds": duration,
        }
        if call_status == "completed":
            updates["ended_at"] = datetime.now(timezone.utc)
        await update_call_log(str(call_log["id"]), updates)
        if call_status == "completed":
            background_tasks.add_task(post_call_pipeline, call_sid, _agent_config())

    return JSONResponse({"ok": True, "call_sid": call_sid, "status": call_status})


@app.post("/twilio/dial-action")
async def twilio_dial_action(request: Request) -> PlainTextResponse:
    """Log the result of the Twilio <Dial><Sip> attempt and keep failures debuggable."""
    form = await request.form()
    payload = {key: value for key, value in form.items()}
    await _validate_twilio_request(request, payload)
    _log_twilio_event("dial_action", payload)

    dial_status = str(payload.get("DialCallStatus") or "").lower()
    sip_response_code = str(payload.get("DialSipResponseCode") or "")
    if dial_status not in {"completed", "answered"}:
        logger.error(
            "[TWILIO] SIP bridge failed status=%s sip_response_code=%s parent_call=%s dial_call=%s",
            dial_status or "<unknown>",
            sip_response_code or "<unknown>",
            payload.get("CallSid") or "<unknown>",
            payload.get("DialCallSid") or "<unknown>",
        )
        return PlainTextResponse(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>'
            "We could not connect your call right now. Please try again later."
            "</Say></Response>",
            media_type="application/xml",
        )

    return PlainTextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml",
    )


@app.post("/twilio/sip-status")
async def twilio_sip_status(request: Request) -> JSONResponse:
    """Capture SIP-leg progress events from Twilio for bridge debugging."""
    form = await request.form()
    payload = {key: value for key, value in form.items()}
    await _validate_twilio_request(request, payload)
    _log_twilio_event("sip_status", payload)
    return JSONResponse({"ok": True})


@app.post("/internal/test")
async def internal_test_call(
    background_tasks: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
) -> JSONResponse:
    """Create a browser-test room and explicitly dispatch this agent.

    Params:
        background_tasks: Unused background task manager required by FastAPI signature.
        x_internal_secret: Shared secret header for internal-only access.
    Returns:
        Room name, participant token, and LiveKit URL.
    Raises:
        HTTPException: If authentication or LiveKit config is missing.
    """
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
