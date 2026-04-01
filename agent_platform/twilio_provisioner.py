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
from utils.livekit_config import normalize_livekit_sip_host

logger = logging.getLogger("voice_platform.twilio_provisioner")


def _normalize_config_json(value: Any) -> dict[str, Any]:
    """Normalize DB JSON values into a dictionary for Twilio provisioning logic."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}


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
        self.livekit_sip_host = normalize_livekit_sip_host(
            livekit_sip_host or os.getenv("LIVEKIT_SIP_HOST", "")
        )

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
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _update_webhook_sync(
        self,
        phone_sid: str,
        new_webhook_url: str,
        *,
        clear_voice_routing_overrides: bool = False,
    ) -> Any:
        """Update the Twilio voice webhook URL for an existing number.

        When we reuse an already-owned Twilio number for local testing, the number may still
        have a Twilio `trunk_sid` or `voice_application_sid` attached from an earlier SIP
        setup. Twilio ignores `voice_url` whenever either override is present, so we explicitly
        clear them in the testing flow to force inbound calls back through `/twilio/voice`.

        To return to a pure SIP-trunk-based production flow later, stop passing
        `clear_voice_routing_overrides=True` when updating the number.
        """
        update_kwargs: dict[str, Any] = {
            "voice_url": f"{new_webhook_url}/twilio/voice",
            "voice_method": "POST",
            "status_callback": f"{new_webhook_url}/twilio/status",
            "status_callback_method": "POST",
        }
        if clear_voice_routing_overrides:
            update_kwargs["trunk_sid"] = ""
            update_kwargs["voice_application_sid"] = ""
        return self.twilio.incoming_phone_numbers(phone_sid).update(**update_kwargs)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((TwilioRestException, OSError)),
        reraise=True,
    )
    def _find_incoming_number_sync(self, phone_number: str) -> Any:
        """Look up an already-owned Twilio incoming number by E.164 phone number."""
        matches = self.twilio.incoming_phone_numbers.list(phone_number=phone_number, limit=1)
        if not matches:
            raise LookupError(
                f"Twilio number {phone_number} was not found on the configured account. "
                "Verify the account SID/auth token point to the account that owns this number."
            )
        return matches[0]

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
        prefer_existing: bool = False,
    ) -> dict[str, str]:
        """Create a LiveKit inbound trunk and SIP dispatch rule for the agent."""
        if not self.livekit_sip_host:
            raise RuntimeError("LIVEKIT_SIP_HOST is required for Twilio SIP routing")

        sip_auth_username = f"agt-{agent_id.replace('-', '')[:18]}"
        sip_auth_password = secrets.token_urlsafe(24)
        # LiveKit's Twilio Voice integration expects the inbound trunk to include the same
        # purchased phone number that appears in the TwiML SIP URI user part.
        trunk_numbers: list[str] = [phone_number]
        lkapi = self._create_livekit_api()
        try:
            existing_trunk = None
            if prefer_existing:
                trunks = await lkapi.sip.list_inbound_trunk(
                    api.ListSIPInboundTrunkRequest(numbers=[phone_number])
                )
                existing_trunk = next(
                    (item for item in trunks.items if phone_number in list(item.numbers)),
                    None,
                )

            if existing_trunk is not None:
                updated_trunk = await lkapi.sip.update_inbound_trunk_fields(
                    str(existing_trunk.sip_trunk_id),
                    numbers=trunk_numbers,
                    auth_username=sip_auth_username,
                    auth_password=sip_auth_password,
                    name=f"{agent_name}-trunk",
                )
                trunk_id = str(updated_trunk.sip_trunk_id)
                logger.info(
                    "Reused existing LiveKit inbound trunk for agent=%s trunk=%s number=%s",
                    agent_id,
                    trunk_id,
                    phone_number,
                )
            else:
                trunk = await lkapi.sip.create_inbound_trunk(
                    api.CreateSIPInboundTrunkRequest(
                        trunk=api.SIPInboundTrunkInfo(
                            name=f"{agent_name}-trunk",
                            numbers=trunk_numbers,
                            auth_username=sip_auth_username,
                            auth_password=sip_auth_password,
                        )
                    )
                )
                trunk_id = str(getattr(trunk, "sip_trunk_id"))

            room_config = api.RoomConfiguration(
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
            )
            rule = api.SIPDispatchRule(
                dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                    room_prefix="call-"
                )
            )

            # Bind the dispatch rule to the specific inbound trunk created for this phone
            # number so LiveKit doesn't have to infer routing across unrelated trunks.
            dispatch_rule_trunk_ids: list[str] = [trunk_id]

            existing_dispatch_rule = None
            if prefer_existing:
                dispatch_rules = await lkapi.sip.list_dispatch_rule(
                    api.ListSIPDispatchRuleRequest()
                )
                existing_dispatch_rule = next(
                    (
                        item
                        for item in dispatch_rules.items
                        if str(item.name or "") == f"{agent_name}-dispatch"
                    ),
                    None,
                )

            if existing_dispatch_rule is not None:
                dispatch_rule = await lkapi.sip.update_dispatch_rule(
                        str(existing_dispatch_rule.sip_dispatch_rule_id),
                        api.SIPDispatchRuleInfo(
                            sip_dispatch_rule_id=str(existing_dispatch_rule.sip_dispatch_rule_id),
                            name=f"{agent_name}-dispatch",
                            trunk_ids=dispatch_rule_trunk_ids,
                            rule=rule,
                            hide_phone_number=bool(existing_dispatch_rule.hide_phone_number),
                            inbound_numbers=list(existing_dispatch_rule.inbound_numbers),
                            metadata=str(existing_dispatch_rule.metadata or ""),
                        attributes=dict(existing_dispatch_rule.attributes),
                        room_preset=str(existing_dispatch_rule.room_preset or ""),
                        room_config=room_config,
                        krisp_enabled=bool(existing_dispatch_rule.krisp_enabled),
                        media_encryption=existing_dispatch_rule.media_encryption,
                    ),
                )
                dispatch_rule_id = str(dispatch_rule.sip_dispatch_rule_id)
                logger.info(
                    "Reused existing LiveKit dispatch rule for agent=%s rule=%s trunk=%s",
                    agent_id,
                    dispatch_rule_id,
                    trunk_id,
                )
            else:
                dispatch_rule = await lkapi.sip.create_dispatch_rule(
                    api.CreateSIPDispatchRuleRequest(
                        dispatch_rule=api.SIPDispatchRuleInfo(
                            name=f"{agent_name}-dispatch",
                            trunk_ids=dispatch_rule_trunk_ids,
                            rule=rule,
                            room_config=room_config,
                        )
                    )
                )
                dispatch_rule_id = str(getattr(dispatch_rule, "sip_dispatch_rule_id"))
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

        config_json = _normalize_config_json(agent.get("config_json"))
        area_code = config_json.get("area_code") or config_json.get("twilio_area_code")

        existing_number = config_json.get("twilio_existing_number")
        logger.info(
            "Twilio provisioning mode for agent=%s existing_number=%s",
            agent_id,
            existing_number or "<purchase-new-number>",
        )

        if existing_number:
            # Trial-account testing path: reuse an already-owned number instead of trying to buy one.
            # To return to the normal production purchase flow, remove `twilio_existing_number`
            # from the agent config so this method falls back to searching and purchasing a new number.
            logger.info(
                "Reusing existing Twilio number for agent=%s number=%s",
                agent_id,
                existing_number,
            )
            purchased = await asyncio.to_thread(self._find_incoming_number_sync, str(existing_number))
            await asyncio.to_thread(
                self._update_webhook_sync,
                purchased.sid,
                webhook_base_url,
                clear_voice_routing_overrides=True,
            )
        else:
            available = await asyncio.to_thread(self._search_available_number_sync, country, area_code)
            purchased = await asyncio.to_thread(self._purchase_number_sync, available.phone_number, webhook_base_url)

        agent_name = str(agent.get("livekit_agent_name") or f"agent-{agent_id.replace('-', '')[:12]}")
        livekit_routing = await self._create_livekit_routing(
            agent_id=agent_id,
            agent_name=agent_name,
            phone_number=purchased.phone_number,
            # Reusing the Twilio number is useful for trial-account testing, but we create
            # fresh LiveKit SIP resources on every publish. Reusing old trunks/dispatch rules
            # can preserve stale SIP auth/routing state across publishes and cause Twilio's
            # outbound SIP leg to fail even though the webhook itself is healthy.
            prefer_existing=False,
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
        config_json = _normalize_config_json(agent.get("config_json"))
        release_twilio_number = bool(config_json.get("twilio_release_on_unpublish", True))
        # Always tear down LiveKit SIP resources on unpublish. Even when the Twilio number is
        # intentionally retained for testing, the trunk/dispatch rule should be recreated on
        # the next publish so SIP auth and dispatch state start clean every time.
        release_livekit_resources = True

        if release_livekit_resources and (dispatch_rule_id or trunk_id):
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
        elif dispatch_rule_id or trunk_id:
            logger.info(
                "Keeping existing LiveKit SIP resources for agent=%s trunk=%s rule=%s",
                agent_id,
                trunk_id or "<none>",
                dispatch_rule_id or "<none>",
            )

        if phone_sid and release_twilio_number:
            await asyncio.to_thread(self._release_number_sync, str(phone_sid))
        elif phone_sid:
            logger.info(
                "Keeping existing Twilio number attached to account for agent=%s sid=%s",
                agent_id,
                mask_secret(str(phone_sid)),
            )

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
