"""Telnyx number and Call Control Application management helpers."""

from __future__ import annotations

import ipaddress
import logging
from typing import Any
from urllib.parse import urlparse

from services.telnyx_client import TelnyxAPIError, TelnyxClient, load_telnyx_config


logger = logging.getLogger("voice_platform.telnyx_number_service")


def _validate_call_control_webhook_url(webhook_event_url: str) -> None:
    """Reject webhook URLs that Telnyx cannot reasonably deliver to in deployment."""
    parsed = urlparse(str(webhook_event_url or "").strip())
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(
            "Telnyx webhook URL is invalid. Set a full public URL such as "
            "'https://agent.example.com/telnyx/voice'."
        )

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise ValueError(
            "Telnyx webhook URL is missing a hostname. Set a full public URL such as "
            "'https://agent.example.com/telnyx/voice'."
        )

    if hostname == "localhost" or hostname.endswith(".local"):
        raise ValueError(
            f"Telnyx webhook URL must be publicly reachable, but got {webhook_event_url!r}. "
            "Using AGENTS_DOMAIN=localhost produces local-only URLs. Set AGENTS_DOMAIN to a real "
            "public domain or expose the agent through a public tunnel/reverse proxy."
        )

    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = None

    if ip is not None and (ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_unspecified):
        raise ValueError(
            f"Telnyx webhook URL must be publicly reachable, but got {webhook_event_url!r}. "
            "Private, loopback, and link-local addresses are not valid for Telnyx Call Control "
            "Application webhooks."
        )


def _is_duplicate_call_control_application_name_error(exc: Exception) -> bool:
    """Return True when Telnyx rejected a create because the application name is taken."""
    if not isinstance(exc, TelnyxAPIError) or exc.status != 422:
        return False

    message = str(exc).lower()
    if "name you have chosen is already in use" in message:
        return True

    body = exc.body
    if not isinstance(body, dict):
        return False
    errors = body.get("errors")
    if not isinstance(errors, list):
        return False
    for item in errors:
        if not isinstance(item, dict):
            continue
        detail = str(item.get("detail") or "").lower()
        pointer = str((item.get("source") or {}).get("pointer") or "").lower() if isinstance(item.get("source"), dict) else ""
        if "already in use" in detail and "application_name" in pointer:
            return True
    return False


class TelnyxNumberService:
    """Manage Telnyx phone numbers and Call Control Applications."""

    def __init__(self, client: TelnyxClient | None = None) -> None:
        self.client = client or TelnyxClient()
        self.config = self.client.config

    async def list_available_phone_numbers(
        self,
        *,
        country_code: str = "US",
        area_code: str | None = None,
        page_size: int = 20,
    ) -> list[dict[str, Any]]:
        """Search Telnyx inventory for purchasable phone numbers."""

        params: dict[str, Any] = {
            "page[size]": page_size,
            "filter[country_code]": country_code.upper(),
        }
        if area_code and country_code.upper() == "US":
            params["filter[phone_number][starts_with]"] = f"+1{area_code}"

        payload = await self.client.request("GET", "/available_phone_numbers", params=params)
        return list(payload.get("data") or [])

    async def get_phone_number(self, external_number_id: str) -> dict[str, Any]:
        """Retrieve a Telnyx phone number by its external ID."""

        payload = await self.client.request("GET", f"/phone_numbers/{external_number_id}")
        return dict(payload.get("data") or {})

    async def find_phone_number(self, phone_number: str) -> dict[str, Any] | None:
        """Find an already-owned number by E.164 phone number."""

        payload = await self.client.request(
            "GET",
            "/phone_numbers",
            params={"filter[phone_number]": phone_number, "page[size]": 1},
        )
        items = list(payload.get("data") or [])
        return dict(items[0]) if items else None

    async def order_phone_number(self, phone_number: str) -> dict[str, Any]:
        """Buy a phone number and return the activated phone number record."""

        await self.client.request(
            "POST",
            "/number_orders",
            json_body={"phone_numbers": [{"phone_number": phone_number}]},
            expected_statuses={200, 201, 202},
        )
        record = await self.find_phone_number(phone_number)
        if record is None:
            raise RuntimeError(f"Ordered Telnyx phone number {phone_number} but could not retrieve the record")
        return record

    async def release_phone_number(self, phone_number: str) -> dict[str, Any]:
        """Release a phone number using Telnyx's delete-batch job API."""

        payload = await self.client.request(
            "POST",
            "/phone_numbers/jobs/delete_phone_numbers",
            json_body={"phone_numbers": [phone_number]},
            expected_statuses={200, 202},
        )
        return dict(payload.get("data") or {})

    async def attach_phone_number_to_connection(
        self,
        *,
        external_number_id: str,
        voice_connection_id: str,
    ) -> dict[str, Any]:
        """Assign a Telnyx number to a Call Control Application."""

        payload = await self.client.request(
            "PATCH",
            f"/phone_numbers/{external_number_id}",
            json_body={"connection_id": voice_connection_id},
        )
        return dict(payload.get("data") or {})

    async def create_call_control_application(
        self,
        *,
        application_name: str,
        webhook_event_url: str,
        active: bool = True,
    ) -> dict[str, Any]:
        """Create a Telnyx Call Control Application for an agent."""
        _validate_call_control_webhook_url(webhook_event_url)

        body: dict[str, Any] = {
            "application_name": application_name,
            "active": active,
            "webhook_event_url": webhook_event_url,
            "webhook_api_version": self.config.webhook_api_version,
            "webhook_timeout_secs": self.config.webhook_timeout_secs,
        }
        if self.config.outbound_voice_profile_id:
            body["outbound"] = {
                "outbound_voice_profile_id": self.config.outbound_voice_profile_id,
            }

        payload = await self.client.request("POST", "/call_control_applications", json_body=body)
        return dict(payload.get("data") or {})

    async def list_call_control_applications(
        self,
        *,
        page_size: int = 250,
    ) -> list[dict[str, Any]]:
        """Return a page of Telnyx Call Control Applications."""
        payload = await self.client.request(
            "GET",
            "/call_control_applications",
            params={"page[size]": page_size},
        )
        return list(payload.get("data") or [])

    async def find_call_control_application_by_name(
        self,
        application_name: str,
    ) -> dict[str, Any] | None:
        """Find an existing Call Control Application by exact application name."""
        items = await self.list_call_control_applications()
        for item in items:
            if str(item.get("application_name") or "") == application_name:
                return dict(item)
        return None

    async def update_call_control_application(
        self,
        *,
        application_id: str,
        application_name: str,
        webhook_event_url: str,
        active: bool = True,
    ) -> dict[str, Any]:
        """Update the Call Control Application bound to an agent."""
        _validate_call_control_webhook_url(webhook_event_url)

        body: dict[str, Any] = {
            "application_name": application_name,
            "active": active,
            "webhook_event_url": webhook_event_url,
            "webhook_api_version": self.config.webhook_api_version,
            "webhook_timeout_secs": self.config.webhook_timeout_secs,
        }
        if self.config.outbound_voice_profile_id:
            body["outbound"] = {
                "outbound_voice_profile_id": self.config.outbound_voice_profile_id,
            }

        payload = await self.client.request(
            "PATCH",
            f"/call_control_applications/{application_id}",
            json_body=body,
        )
        return dict(payload.get("data") or {})

    async def ensure_call_control_application(
        self,
        *,
        application_id: str | None,
        application_name: str,
        webhook_event_url: str,
        active: bool = True,
    ) -> dict[str, Any]:
        """Create or update a Call Control Application."""

        if application_id:
            try:
                return await self.update_call_control_application(
                    application_id=application_id,
                    application_name=application_name,
                    webhook_event_url=webhook_event_url,
                    active=active,
                )
            except Exception:
                logger.exception(
                    "Failed to update existing Telnyx application id=%s, creating a new one",
                    application_id,
                )

        existing_application = await self.find_call_control_application_by_name(application_name)
        if existing_application and existing_application.get("id"):
            return await self.update_call_control_application(
                application_id=str(existing_application["id"]),
                application_name=application_name,
                webhook_event_url=webhook_event_url,
                active=active,
            )

        try:
            return await self.create_call_control_application(
                application_name=application_name,
                webhook_event_url=webhook_event_url,
                active=active,
            )
        except Exception as exc:
            if not _is_duplicate_call_control_application_name_error(exc):
                raise
            existing_application = await self.find_call_control_application_by_name(application_name)
            if not existing_application or not existing_application.get("id"):
                raise
            logger.info(
                "Recovered duplicate Telnyx Call Control Application name=%s by reusing id=%s",
                application_name,
                existing_application["id"],
            )
            return await self.update_call_control_application(
                application_id=str(existing_application["id"]),
                application_name=application_name,
                webhook_event_url=webhook_event_url,
                active=active,
            )

    async def deactivate_call_control_application(self, application_id: str) -> dict[str, Any]:
        """Deactivate a Call Control Application without deleting it."""

        payload = await self.client.request(
            "PATCH",
            f"/call_control_applications/{application_id}",
            json_body={"active": False},
        )
        return dict(payload.get("data") or {})


def telnyx_webhook_url_path() -> str:
    """Return the stable voice webhook path used across the platform."""

    return "/telnyx/voice"
