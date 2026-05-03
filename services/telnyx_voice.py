"""Telnyx Voice API helpers for inbound and outbound call control."""

from __future__ import annotations

import base64
import json
from typing import Any

from services.telnyx_client import TelnyxClient


class TelnyxVoiceService:
    """Issue Telnyx call control commands."""

    def __init__(self, client: TelnyxClient | None = None) -> None:
        self.client = client or TelnyxClient()

    async def answer_call(
        self,
        *,
        call_control_id: str,
        command_id: str,
        client_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Answer an inbound call leg."""

        body: dict[str, Any] = {"command_id": command_id}
        if client_state:
            body["client_state"] = encode_client_state(client_state)
        payload = await self.client.request(
            "POST",
            f"/calls/{call_control_id}/actions/answer",
            json_body=body,
        )
        return dict(payload.get("data") or {})

    async def transfer_call(
        self,
        *,
        call_control_id: str,
        destination: str,
        from_number: str,
        command_id: str,
        sip_auth_username: str | None = None,
        sip_auth_password: str | None = None,
        sip_transport_protocol: str = "TCP",
        client_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Transfer a live call to a SIP URI or phone number."""

        body: dict[str, Any] = {
            "to": destination,
            "from": from_number,
            "command_id": command_id,
            "sip_transport_protocol": sip_transport_protocol,
        }
        if sip_auth_username:
            body["sip_auth_username"] = sip_auth_username
        if sip_auth_password:
            body["sip_auth_password"] = sip_auth_password
        if client_state:
            body["client_state"] = encode_client_state(client_state)

        payload = await self.client.request(
            "POST",
            f"/calls/{call_control_id}/actions/transfer",
            json_body=body,
        )
        return dict(payload.get("data") or {})

    async def hangup_call(
        self,
        *,
        call_control_id: str,
        command_id: str,
    ) -> dict[str, Any]:
        """Hang up a Telnyx call leg."""

        payload = await self.client.request(
            "POST",
            f"/calls/{call_control_id}/actions/hangup",
            json_body={"command_id": command_id},
        )
        return dict(payload.get("data") or {})

    async def make_outbound_call(
        self,
        *,
        to_number: str,
        from_number: str,
        voice_connection_id: str,
        command_id: str,
        webhook_url: str | None = None,
        timeout_secs: int = 30,
        time_limit_secs: int = 600,
        client_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create an outbound PSTN or SIP call from the agent number."""

        body: dict[str, Any] = {
            "to": to_number,
            "from": from_number,
            "connection_id": voice_connection_id,
            "command_id": command_id,
            "timeout_secs": timeout_secs,
            "time_limit_secs": time_limit_secs,
        }
        if webhook_url:
            body["webhook_url"] = webhook_url
            body["webhook_url_method"] = "POST"
        if client_state:
            body["client_state"] = encode_client_state(client_state)

        payload = await self.client.request("POST", "/calls", json_body=body)
        return dict(payload.get("data") or {})


def build_livekit_sip_destination(phone_number: str, livekit_sip_host: str) -> str:
    """Build the LiveKit SIP URI for a specific agent phone number."""

    return f"sip:{phone_number}@{livekit_sip_host}"


def encode_client_state(state: dict[str, Any]) -> str:
    """Encode JSON client state as the base64 string Telnyx expects."""

    raw = json.dumps(state, separators=(",", ":"), sort_keys=True)
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


def decode_client_state(value: str | None) -> dict[str, Any]:
    """Decode Telnyx client_state data into a JSON dictionary."""

    if not value:
        return {}
    try:
        raw = base64.b64decode(value).decode("utf-8")
        decoded = json.loads(raw)
    except Exception:
        return {}
    return decoded if isinstance(decoded, dict) else {}
