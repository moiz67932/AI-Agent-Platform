"""Post-call processing for transcript extraction, analytics, calendar, and email."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import aiohttp
from google.oauth2 import service_account
from googleapiclient.discovery import build
from openai import AsyncOpenAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from database.db import (
    create_appointment,
    get_call_log_by_sid,
    get_db_pool,
    update_appointment_fields,
    update_call_log,
    upsert_analytics_daily,
)


logger = logging.getLogger("voice_platform.post_call_pipeline")


def _parse_agent_config(agent_config: dict[str, Any] | str | None) -> dict[str, Any]:
    """Normalize an agent config payload into a dictionary.

    Params:
        agent_config: Dictionary or JSON string.
    Returns:
        Parsed dictionary.
    """
    if isinstance(agent_config, dict):
        return agent_config
    if isinstance(agent_config, str) and agent_config.strip():
        parsed = json.loads(agent_config)
        if isinstance(parsed, dict):
            return parsed
    return {}


async def _load_transcript(call_log: dict[str, Any]) -> str:
    """Return the best available transcript text for a call.

    Params:
        call_log: Call log row.
    Returns:
        Transcript text, possibly empty.
    """
    transcript_text = str(call_log.get("transcript_text") or "").strip()
    if transcript_text:
        return transcript_text

    try:
        pool = get_db_pool()
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT speaker, text
                FROM call_transcripts
                WHERE call_id = $1
                ORDER BY turn_index ASC, utterance_time ASC
                """,
                call_log["id"],
            )
    except Exception:
        return ""
    if not rows:
        return ""

    return "\n".join(f"{row['speaker']}: {row['text']}" for row in rows if row["text"])


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((aiohttp.ClientError, RuntimeError)),
    reraise=True,
)
async def _send_confirmation_email(
    *,
    to_email: str,
    subject: str,
    html: str,
) -> None:
    """Send a confirmation email through Resend.

    Params:
        to_email: Recipient email address.
        subject: Email subject line.
        html: HTML email body.
    Returns:
        None.
    Raises:
        RuntimeError: If the Resend API returns an error response.
    """
    api_key = os.getenv("RESEND_API_KEY", "")
    email_from = os.getenv("EMAIL_FROM", "")
    if not api_key or not email_from:
        raise RuntimeError("RESEND_API_KEY and EMAIL_FROM are required")

    payload = {
        "from": email_from,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.resend.com/emails",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as response:
            if response.status >= 400:
                body = await response.text()
                raise RuntimeError(f"Resend API error {response.status}: {body}")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((OSError, RuntimeError)),
    reraise=True,
)
def _create_calendar_event_sync(
    *,
    calendar_id: str,
    summary: str,
    description: str,
    start_iso: str,
    end_iso: str,
    timezone_name: str,
) -> dict[str, Any]:
    """Create a Google Calendar event using service-account credentials.

    Params:
        calendar_id: Target Google Calendar ID.
        summary: Event summary.
        description: Event description.
        start_iso: ISO 8601 start datetime.
        end_iso: ISO 8601 end datetime.
        timezone_name: Event timezone.
    Returns:
        Created Google Calendar event payload.
    Raises:
        RuntimeError: If Google credentials are missing.
    """
    raw_credentials = os.getenv("GOOGLE_CREDENTIALS_JSON", "")
    if not raw_credentials:
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON is required")

    credentials_info = json.loads(raw_credentials)
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=["https://www.googleapis.com/auth/calendar"],
    )
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    event = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_iso, "timeZone": timezone_name},
        "end": {"dateTime": end_iso, "timeZone": timezone_name},
    }
    return service.events().insert(calendarId=calendar_id, body=event).execute()


async def _extract_structured_data(transcript_text: str) -> dict[str, Any]:
    """Use OpenAI to extract structured call data from a transcript.

    Params:
        transcript_text: Full transcript text.
    Returns:
        Structured extraction payload.
    """
    if not transcript_text.strip():
        return {
            "caller_name": None,
            "caller_phone": None,
            "service_requested": None,
            "appointment_datetime": None,
            "appointment_booked": False,
            "call_summary": "Transcript unavailable for this call.",
        }

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract structured call data. Return valid JSON only with keys: "
                    "caller_name, caller_phone, service_requested, appointment_datetime, "
                    "appointment_booked, call_summary. Use null when unknown. "
                    "appointment_datetime must be ISO8601 or null. call_summary must be two sentences max."
                ),
            },
            {"role": "user", "content": transcript_text},
        ],
    )
    content = response.choices[0].message.content or "{}"
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise RuntimeError("Structured extraction response was not a JSON object")
    return parsed


async def post_call_pipeline(call_sid: str, agent_config: dict[str, Any] | str | None) -> None:
    """Run the post-call pipeline with isolated failure domains per step.

    Params:
        call_sid: Twilio Call SID.
        agent_config: Agent configuration dictionary or JSON string.
    Returns:
        None.
    """
    config = _parse_agent_config(agent_config)
    call_log = await get_call_log_by_sid(call_sid)
    if call_log is None:
        logger.warning("[POST_CALL] call_sid=%s missing call_log row", call_sid)
        return

    transcript_text = await _load_transcript(call_log)
    extracted: dict[str, Any] = {
        "caller_name": None,
        "caller_phone": call_log.get("caller_phone"),
        "service_requested": None,
        "appointment_datetime": None,
        "appointment_booked": False,
        "call_summary": call_log.get("summary") or "",
    }
    appointment_row: dict[str, Any] | None = None

    try:
        extracted = await _extract_structured_data(transcript_text)
        await update_call_log(
            str(call_log["id"]),
            {
                "transcript_text": transcript_text or None,
                "summary": extracted.get("call_summary") or call_log.get("summary"),
            },
        )
        logger.info("[POST_CALL] call_sid=%s extraction complete", call_sid)
    except Exception as exc:
        logger.exception("[POST_CALL] call_sid=%s extraction failed: %s", call_sid, exc)

    try:
        appointment_at = None
        if extracted.get("appointment_datetime"):
            appointment_at = datetime.fromisoformat(str(extracted["appointment_datetime"]).replace("Z", "+00:00"))

        duration_seconds = int(call_log.get("duration_seconds") or 0)
        completed_increment = 1 if str(call_log.get("status") or "").lower() == "completed" else 0
        booked_increment = 1 if bool(extracted.get("appointment_booked")) and appointment_at is not None else 0

        if booked_increment:
            appointment_row = await create_appointment(
                agent_id=str(call_log["agent_id"]),
                organization_id=call_log.get("organization_id"),
                clinic_id=call_log.get("clinic_id"),
                call_log_id=str(call_log["id"]),
                caller_name=extracted.get("caller_name"),
                caller_phone=extracted.get("caller_phone") or call_log.get("caller_phone"),
                caller_email=config.get("notification_email"),
                service_requested=extracted.get("service_requested"),
                appointment_at=appointment_at,
                notes=transcript_text or extracted.get("call_summary"),
            )

        await upsert_analytics_daily(
            agent_id=str(call_log["agent_id"]),
            target_date=(call_log.get("created_at") or datetime.now(timezone.utc)).date(),
            total_calls_increment=1,
            completed_calls_increment=completed_increment,
            appointments_booked_increment=booked_increment,
            total_duration_seconds_increment=duration_seconds,
        )
        logger.info("[POST_CALL] call_sid=%s database step complete", call_sid)
    except Exception as exc:
        logger.exception("[POST_CALL] call_sid=%s database step failed: %s", call_sid, exc)

    try:
        appointment_iso = extracted.get("appointment_datetime")
        calendar_id = config.get("calendar_id")
        if appointment_row and appointment_iso and calendar_id:
            appointment_at = datetime.fromisoformat(str(appointment_iso).replace("Z", "+00:00"))
            end_at = appointment_at + timedelta(minutes=30)
            timezone_name = str(config.get("timezone") or "UTC")
            event = await asyncio.to_thread(
                _create_calendar_event_sync,
                calendar_id=str(calendar_id),
                summary=f"{extracted.get('service_requested') or 'Appointment'} - {extracted.get('caller_name') or 'Caller'}",
                description=transcript_text or extracted.get("call_summary") or "",
                start_iso=appointment_at.isoformat(),
                end_iso=end_at.isoformat(),
                timezone_name=timezone_name,
            )
            appointment_row = await update_appointment_fields(
                str(appointment_row["id"]),
                {
                    "calendar_event_id": event.get("id"),
                    "calendar_event_url": event.get("htmlLink"),
                },
            )
            logger.info("[POST_CALL] call_sid=%s calendar step complete", call_sid)
    except Exception as exc:
        logger.exception("[POST_CALL] call_sid=%s calendar step failed: %s", call_sid, exc)

    try:
        notification_email = str(config.get("notification_email") or "").strip()
        if notification_email:
            calendar_link = (appointment_row or {}).get("calendar_event_url")
            html = (
                f"<h2>New Call Summary</h2>"
                f"<p><strong>Caller:</strong> {extracted.get('caller_name') or 'Unknown'}</p>"
                f"<p><strong>Phone:</strong> {extracted.get('caller_phone') or call_log.get('caller_phone') or 'Unknown'}</p>"
                f"<p><strong>Service:</strong> {extracted.get('service_requested') or 'Not identified'}</p>"
                f"<p><strong>Appointment:</strong> {extracted.get('appointment_datetime') or 'Not booked'}</p>"
                f"<p><strong>Calendar:</strong> {calendar_link or 'Not available'}</p>"
                f"<p><strong>Summary:</strong> {extracted.get('call_summary') or 'No summary available.'}</p>"
                f"<details><summary>Full transcript</summary><pre>{transcript_text or 'No transcript available.'}</pre></details>"
            )
            await _send_confirmation_email(
                to_email=notification_email,
                subject=f"Call summary for {config.get('name') or 'your agent'}",
                html=html,
            )
            if appointment_row:
                await update_appointment_fields(str(appointment_row["id"]), {"confirmation_sent": True})
            logger.info("[POST_CALL] call_sid=%s email step complete", call_sid)
    except Exception as exc:
        logger.exception("[POST_CALL] call_sid=%s email step failed: %s", call_sid, exc)
