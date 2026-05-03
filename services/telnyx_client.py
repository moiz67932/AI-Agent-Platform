"""Async Telnyx REST client used by telephony services."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import aiohttp


logger = logging.getLogger("voice_platform.telnyx_client")


def _summarize_telnyx_error_body(body: Any) -> str:
    """Return a compact human-readable summary for a Telnyx error payload."""
    if not isinstance(body, dict):
        return ""

    errors = body.get("errors")
    if isinstance(errors, list) and errors:
        parts: list[str] = []
        for item in errors:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            detail = str(item.get("detail") or "").strip()
            source = item.get("source")
            pointer = ""
            if isinstance(source, dict):
                pointer = str(source.get("pointer") or source.get("parameter") or "").strip()
            fragment = ": ".join(part for part in (title, detail) if part)
            if pointer:
                fragment = f"{fragment} [{pointer}]" if fragment else f"[{pointer}]"
            if fragment:
                parts.append(fragment)
        if parts:
            return "; ".join(parts)

    detail = body.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    return ""


class TelnyxAPIError(RuntimeError):
    """Raised when the Telnyx API returns an error response."""

    def __init__(
        self,
        message: str,
        *,
        status: int,
        body: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass(slots=True)
class TelnyxConfig:
    """Runtime configuration for Telnyx integrations."""

    api_key: str
    public_key: str
    api_base_url: str
    outbound_voice_profile_id: str
    webhook_api_version: str
    webhook_timeout_secs: int
    signature_tolerance_secs: int
    disable_signature_verification: bool


def load_telnyx_config() -> TelnyxConfig:
    """Load Telnyx configuration from the environment."""

    return TelnyxConfig(
        api_key=os.getenv("TELNYX_API_KEY", "").strip(),
        public_key=os.getenv("TELNYX_PUBLIC_KEY", "").strip(),
        api_base_url=os.getenv("TELNYX_API_BASE_URL", "https://api.telnyx.com/v2").rstrip("/"),
        outbound_voice_profile_id=os.getenv("TELNYX_OUTBOUND_VOICE_PROFILE_ID", "").strip(),
        webhook_api_version=os.getenv("TELNYX_WEBHOOK_API_VERSION", "2").strip() or "2",
        webhook_timeout_secs=max(1, int(os.getenv("TELNYX_WEBHOOK_TIMEOUT_SECS", "10"))),
        signature_tolerance_secs=max(
            1,
            int(os.getenv("TELNYX_WEBHOOK_SIGNATURE_TOLERANCE_SECS", "300")),
        ),
        disable_signature_verification=(
            os.getenv("TELNYX_DISABLE_WEBHOOK_SIGNATURE_VERIFICATION", "").strip().lower()
            in {"1", "true", "yes", "on"}
        ),
    )


class TelnyxClient:
    """Small async HTTP client for the Telnyx v2 REST API."""

    def __init__(self, config: TelnyxConfig | None = None) -> None:
        self.config = config or load_telnyx_config()
        if not self.config.api_key:
            raise RuntimeError("TELNYX_API_KEY is required")

    async def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        expected_statuses: set[int] | None = None,
    ) -> dict[str, Any]:
        """Perform a JSON request against the Telnyx API with basic retries."""

        url = f"{self.config.api_base_url}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Accept": "application/json",
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        expected = expected_statuses or {200, 201, 202}
        retryable_statuses = {408, 409, 425, 429, 500, 502, 503, 504}
        timeout = aiohttp.ClientTimeout(total=30)
        last_error: Exception | None = None

        for attempt in range(1, 4):
            try:
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.request(
                        method.upper(),
                        url,
                        headers=headers,
                        params=params,
                        json=json_body,
                    ) as response:
                        text = await response.text()
                        payload: Any
                        if text:
                            try:
                                payload = json.loads(text)
                            except json.JSONDecodeError:
                                payload = {"raw": text}
                        else:
                            payload = {}

                        if response.status in expected:
                            if isinstance(payload, dict):
                                return payload
                            return {"data": payload}

                        detail = _summarize_telnyx_error_body(payload)
                        message = f"Telnyx API request failed: {method.upper()} {path} -> {response.status}"
                        if detail:
                            message = f"{message} ({detail})"
                        error = TelnyxAPIError(message, status=response.status, body=payload)
                        if response.status not in retryable_statuses or attempt >= 3:
                            raise error
                        last_error = error
            except (aiohttp.ClientError, asyncio.TimeoutError, TelnyxAPIError) as exc:
                last_error = exc
                if isinstance(exc, TelnyxAPIError) and exc.status not in retryable_statuses:
                    raise
                if attempt >= 3:
                    break
                sleep_for = 2 ** (attempt - 1)
                logger.warning(
                    "Retrying Telnyx request method=%s path=%s attempt=%s sleep=%ss error=%s",
                    method.upper(),
                    path,
                    attempt,
                    sleep_for,
                    exc,
                )
                await asyncio.sleep(sleep_for)

        raise RuntimeError(f"Telnyx request failed after retries: {last_error}")
