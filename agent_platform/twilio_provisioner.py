"""Twilio phone number provisioning with LiveKit SIP dispatch setup."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from typing import Any

from livekit import api
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from agent_platform.utils import mask_secret
from database.db import get_agent, update_agent_fields

logger = logging.getLogger("voice_platform.twilio_provisioner")


class TwilioProvisioner:
    """Provision Twilio numbers and bind them to LiveKit SIP dispatch rules."""

    def __init__(
        self,
        *,
        account_sid: str | None = None,
        auth_token: str | None = None,
        livekit_url: str | None = None,
        livekit_api_key: str | None = None,
        livekit_api_secret: str | None = None,
        livekit_sip_host: str | None = None,
    ) -> None:
        """Initialize the Twilio and LiveKit clients."""
        resolved_sid = account_sid or os.getenv("TWILIO_ACCOUNT_SID")
        resolved_token = auth_token or os.getenv("TWILIO_AUTH_TOKEN")
        if not resolved_sid or not resolved_token:
            raise RuntimeError("Twilio credentials are required")

        self.twilio = TwilioClient(resolved_sid, resolved_token)
        self.livekit_url = livekit_url or os.getenv("LIVEKIT_URL", "")
        self.livekit_api_key = livekit_api_key or os.getenv("LIVEKIT_API_KEY", "")
        self.livekit_api_secret = livekit_api_secret or os.getenv("LIVEKIT_API_SECRET", "")
        self.livekit_sip_host = livekit_sip_host or os.getenv("LIVEKIT_SIP_HOST", "")

    def _create_livekit_api(self) -> api.LiveKitAPI:
        """Construct a LiveKit API client from configured credentials."""
        if not self.livekit_url or not self.livekit_api_key or not self.livekit_api_secret:
            raise RuntimeError("LiveKit URL, API key, and API secret are required")
        return api.LiveKitAPI(
            url=self.livekit_url,
            api_key=self.livekit_api_key,
            api_secret=self.livekit_api_secret,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _search_available_number_sync(self, country: str, area_code: str | None = None) -> Any:
        """Find an available Twilio voice number."""
        local_numbers = self.twilio.available_phone_numbers(country).local
        kwargs: dict[str, Any] = {"limit": 1}
        if area_code and country.upper() == "US":
            kwargs["area_code"] = area_code
        matches = local_numbers.list(**kwargs)
        if not matches:
            raise LookupError(f"No Twilio numbers available for country={country}, area_code={area_code}")
        return matches[0]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _purchase_number_sync(self, phone_number: str, webhook_base_url: str) -> Any:
        """Purchase a Twilio number and configure its webhooks."""
        return self.twilio.incoming_phone_numbers.create(
            phone_number=phone_number,
            voice_url=f"{webhook_base_url}/twilio/voice",
            voice_method="POST",
            status_callback=f"{webhook_base_url}/twilio/status",
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _update_webhook_sync(self, phone_sid: str, new_webhook_url: str) -> Any:
        """Update the Twilio voice webhook URL for an existing number."""
        return self.twilio.incoming_phone_numbers(phone_sid).update(
            voice_url=f"{new_webhook_url}/twilio/voice",
            voice_method="POST",
            status_callback=f"{new_webhook_url}/twilio/status",
            status_callback_method="POST",
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _release_number_sync(self, phone_sid: str) -> None:
        """Release a Twilio number from the account."""
        self.twilio.incoming_phone_numbers(phone_sid).delete()

    async def _create_livekit_routing(
        self,
        *,
        agent_id: str,
        agent_name: str,
        phone_number: str,
    ) -> dict[str, str]:
        """Create a LiveKit inbound trunk and SIP dispatch rule for the agent."""
        if not self.livekit_sip_host:
            raise RuntimeError("LIVEKIT_SIP_HOST is required for Twilio SIP routing")

        sip_auth_username = f"agt-{agent_id.replace('-', '')[:18]}"
        sip_auth_password = secrets.token_urlsafe(24)
        lkapi = self._create_livekit_api()
        try:
            trunk = await lkapi.sip.create_inbound_trunk(
                api.CreateSIPInboundTrunkRequest(
                    trunk=api.SIPInboundTrunkInfo(
                        name=f"{agent_name}-trunk",
                        numbers=[phone_number],
                        auth_username=sip_auth_username,
                        auth_password=sip_auth_password,
                    )
                )
            )
            trunk_id = getattr(trunk, "sip_trunk_id")

            dispatch_rule = await lkapi.sip.create_dispatch_rule(
                api.CreateSIPDispatchRuleRequest(
                    dispatch_rule=api.SIPDispatchRuleInfo(
                        name=f"{agent_name}-dispatch",
                        trunk_ids=[trunk_id],
                        rule=api.SIPDispatchRule(
                            dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                                room_prefix="call-"
                            )
                        ),
                        room_config=api.RoomConfiguration(
                            agents=[
                                api.RoomAgentDispatch(
                                    agent_name=agent_name,
                                    metadata=json.dumps(
                                        {
                                            "agent_id": agent_id,
                                            "phone_number": phone_number,
                                        },
                                        separators=(",", ":"),
                                    ),
                                )
                            ]
                        ),
                    )
                )
            )
            dispatch_rule_id = getattr(dispatch_rule, "sip_dispatch_rule_id")
        finally:
            await lkapi.aclose()

        logger.info(
            "Provisioned LiveKit routing for agent=%s trunk=%s rule=%s sip_user=%s",
            agent_id,
            trunk_id,
            dispatch_rule_id,
            sip_auth_username,
        )
        return {
            "livekit_trunk_id": trunk_id,
            "livekit_dispatch_rule_id": dispatch_rule_id,
            "sip_auth_username": sip_auth_username,
            "sip_auth_password": sip_auth_password,
        }

    async def provision_number(
        self,
        agent_id: str,
        webhook_base_url: str,
        *,
        country: str = "US",
    ) -> dict[str, Any]:
        """Provision a phone number and save it on the agent record."""
        agent = await get_agent(agent_id)
        if agent is None:
            raise LookupError(f"Agent {agent_id} was not found")

        config_json = agent.get("config_json") or {}
        area_code = None
        if isinstance(config_json, dict):
            area_code = config_json.get("area_code") or config_json.get("twilio_area_code")

        available = await asyncio.to_thread(self._search_available_number_sync, country, area_code)
        purchased = await asyncio.to_thread(self._purchase_number_sync, available.phone_number, webhook_base_url)

        agent_name = str(agent.get("livekit_agent_name") or f"agent-{agent_id.replace('-', '')[:12]}")
        livekit_routing = await self._create_livekit_routing(
            agent_id=agent_id,
            agent_name=agent_name,
            phone_number=purchased.phone_number,
        )

        updated_agent = await update_agent_fields(
            agent_id,
            {
                "phone_number": purchased.phone_number,
                "twilio_phone_sid": purchased.sid,
                "livekit_agent_name": agent_name,
                **livekit_routing,
            },
        )
        logger.info(
            "Provisioned Twilio number for agent=%s sid=%s number=%s",
            agent_id,
            purchased.sid,
            purchased.phone_number,
        )
        return {
            "agent": updated_agent,
            "phone_number": purchased.phone_number,
            "phone_sid": purchased.sid,
            **livekit_routing,
        }

    async def release_number(self, agent_id: str) -> None:
        """Release the agent's Twilio number and remove LiveKit SIP routing."""
        agent = await get_agent(agent_id)
        if agent is None:
            raise LookupError(f"Agent {agent_id} was not found")

        phone_sid = agent.get("twilio_phone_sid")
        dispatch_rule_id = agent.get("livekit_dispatch_rule_id")
        trunk_id = agent.get("livekit_trunk_id")

        if dispatch_rule_id or trunk_id:
            lkapi = self._create_livekit_api()
            try:
                if dispatch_rule_id:
                    await lkapi.sip.delete_dispatch_rule(
                        api.DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=str(dispatch_rule_id))
                    )
                if trunk_id:
                    await lkapi.sip.delete_trunk(api.DeleteSIPTrunkRequest(sip_trunk_id=str(trunk_id)))
            finally:
                await lkapi.aclose()

        if phone_sid:
            await asyncio.to_thread(self._release_number_sync, str(phone_sid))

        await update_agent_fields(
            agent_id,
            {
                "phone_number": None,
                "twilio_phone_sid": None,
                "livekit_trunk_id": None,
                "livekit_dispatch_rule_id": None,
                "sip_auth_username": None,
                "sip_auth_password": None,
            },
        )

    async def update_webhook(self, phone_sid: str, new_webhook_url: str) -> dict[str, Any]:
        """Update the Twilio webhook URL for a previously purchased number."""
        updated = await asyncio.to_thread(self._update_webhook_sync, phone_sid, new_webhook_url)
        logger.info(
            "Updated Twilio webhook sid=%s voice_url=%s",
            updated.sid,
            new_webhook_url,
        )
        return {
            "phone_sid": updated.sid,
            "voice_url": f"{new_webhook_url}/twilio/voice",
            "status_callback": f"{new_webhook_url}/twilio/status",
        }
