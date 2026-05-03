"""Telnyx number provisioning with LiveKit SIP dispatch setup."""

from __future__ import annotations

import json
import logging
import os
import secrets
from typing import Any

from livekit import api

from agent_platform.utils import mask_secret
from database.db import (
    get_agent,
    get_agent_phone_number_assignment,
    update_agent_fields,
    upsert_phone_number_assignment,
)
from services.telnyx_number_service import TelnyxNumberService
from utils.livekit_config import normalize_livekit_sip_host

logger = logging.getLogger("voice_platform.telnyx_provisioner")

DatabaseNumberAssignment = dict[str, Any]


def _normalize_config_json(value: Any) -> dict[str, Any]:
    """Normalize DB JSON values into a dictionary for provisioning logic."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}


def _is_duplicate_livekit_resource_error(exc: Exception) -> bool:
    """Return True when LiveKit rejected a create due to an existing equivalent resource."""
    message = str(exc).lower()
    return "already exists" in message or "duplicate" in message


def _dispatch_rule_matches(
    rule: Any,
    *,
    dispatch_name: str,
    trunk_id: str,
    agent_id: str,
    phone_number: str,
    known_dispatch_rule_id: str | None = None,
) -> bool:
    """Match a dispatch rule by stable routing identity, not only by name."""
    rule_id = str(getattr(rule, "sip_dispatch_rule_id", "") or "")
    if known_dispatch_rule_id and rule_id == known_dispatch_rule_id:
        return True

    if str(getattr(rule, "name", "") or "") == dispatch_name:
        return True

    trunk_ids = {str(item) for item in list(getattr(rule, "trunk_ids", []) or []) if item}
    if trunk_id and trunk_id in trunk_ids:
        return True

    metadata = _normalize_config_json(getattr(rule, "metadata", None))
    if str(metadata.get("agent_id") or "") == agent_id:
        return True
    return str(metadata.get("phone_number") or "") == phone_number and bool(trunk_ids)


class TelnyxProvisioner:
    """Provision Telnyx numbers and bind them to LiveKit SIP dispatch rules."""

    def __init__(
        self,
        *,
        livekit_url: str | None = None,
        livekit_api_key: str | None = None,
        livekit_api_secret: str | None = None,
        livekit_sip_host: str | None = None,
        telnyx_numbers: TelnyxNumberService | None = None,
    ) -> None:
        self.livekit_url = livekit_url or os.getenv("LIVEKIT_URL", "")
        self.livekit_api_key = livekit_api_key or os.getenv("LIVEKIT_API_KEY", "")
        self.livekit_api_secret = livekit_api_secret or os.getenv("LIVEKIT_API_SECRET", "")
        self.livekit_sip_host = normalize_livekit_sip_host(
            livekit_sip_host or os.getenv("LIVEKIT_SIP_HOST", "")
        )
        self.telnyx_numbers = telnyx_numbers or TelnyxNumberService()

    def _create_livekit_api(self) -> api.LiveKitAPI:
        """Construct a LiveKit API client from configured credentials."""
        if not self.livekit_url or not self.livekit_api_key or not self.livekit_api_secret:
            raise RuntimeError("LiveKit URL, API key, and API secret are required")
        return api.LiveKitAPI(
            url=self.livekit_url,
            api_key=self.livekit_api_key,
            api_secret=self.livekit_api_secret,
        )

    async def _create_livekit_routing(
        self,
        *,
        agent_id: str,
        agent_name: str,
        phone_number: str,
        existing_trunk_id: str | None = None,
        existing_dispatch_rule_id: str | None = None,
    ) -> dict[str, str]:
        """Create a LiveKit inbound trunk and SIP dispatch rule for the agent."""
        if not self.livekit_sip_host:
            raise RuntimeError("LIVEKIT_SIP_HOST is required for Telnyx SIP routing")

        sip_auth_username = f"agt-{agent_id.replace('-', '')[:18]}"
        sip_auth_password = secrets.token_urlsafe(24)
        trunk_numbers: list[str] = [phone_number]
        lkapi = self._create_livekit_api()
        try:
            dispatch_name = f"{agent_name}-dispatch"
            trunk_name = f"{agent_name}-trunk"

            async def find_existing_trunk() -> Any | None:
                if existing_trunk_id:
                    try:
                        trunks = await lkapi.sip.list_inbound_trunk(api.ListSIPInboundTrunkRequest())
                        matched = next(
                            (
                                item
                                for item in getattr(trunks, "items", [])
                                if str(getattr(item, "sip_trunk_id", "") or "") == str(existing_trunk_id)
                            ),
                            None,
                        )
                        if matched is not None:
                            return matched
                    except Exception:
                        logger.debug(
                            "Unable to list LiveKit inbound trunks by id for agent=%s",
                            agent_id,
                            exc_info=True,
                        )
                try:
                    trunks = await lkapi.sip.list_inbound_trunk(
                        api.ListSIPInboundTrunkRequest(numbers=[phone_number])
                    )
                    return next(
                        (
                            item
                            for item in getattr(trunks, "items", [])
                            if phone_number in list(getattr(item, "numbers", []) or [])
                        ),
                        None,
                    )
                except Exception:
                    logger.debug(
                        "Unable to list LiveKit inbound trunks by number for agent=%s number=%s",
                        agent_id,
                        phone_number,
                        exc_info=True,
                    )
                    return None

            async def find_existing_dispatch_rule(trunk_id_to_match: str) -> Any | None:
                try:
                    dispatch_rules = await lkapi.sip.list_dispatch_rule(api.ListSIPDispatchRuleRequest())
                except Exception:
                    logger.debug(
                        "Unable to list LiveKit dispatch rules for agent=%s",
                        agent_id,
                        exc_info=True,
                    )
                    return None

                return next(
                    (
                        item
                        for item in getattr(dispatch_rules, "items", [])
                        if _dispatch_rule_matches(
                            item,
                            dispatch_name=dispatch_name,
                            trunk_id=trunk_id_to_match,
                            agent_id=agent_id,
                            phone_number=phone_number,
                            known_dispatch_rule_id=existing_dispatch_rule_id,
                        )
                    ),
                    None,
                )

            existing_trunk = None
            existing_trunk = await find_existing_trunk()

            if existing_trunk is not None:
                updated_trunk = await lkapi.sip.update_inbound_trunk_fields(
                    str(existing_trunk.sip_trunk_id),
                    numbers=trunk_numbers,
                    auth_username=sip_auth_username,
                    auth_password=sip_auth_password,
                    name=trunk_name,
                )
                trunk_id = str(updated_trunk.sip_trunk_id)
                logger.info(
                    "Reused existing LiveKit inbound trunk for agent=%s trunk=%s number=%s",
                    agent_id,
                    trunk_id,
                    phone_number,
                )
            else:
                try:
                    trunk = await lkapi.sip.create_inbound_trunk(
                        api.CreateSIPInboundTrunkRequest(
                            trunk=api.SIPInboundTrunkInfo(
                                name=trunk_name,
                                numbers=trunk_numbers,
                                auth_username=sip_auth_username,
                                auth_password=sip_auth_password,
                            )
                        )
                    )
                    trunk_id = str(getattr(trunk, "sip_trunk_id"))
                except Exception as exc:
                    if not _is_duplicate_livekit_resource_error(exc):
                        raise
                    existing_trunk = await find_existing_trunk()
                    if existing_trunk is None:
                        raise
                    updated_trunk = await lkapi.sip.update_inbound_trunk_fields(
                        str(existing_trunk.sip_trunk_id),
                        numbers=trunk_numbers,
                        auth_username=sip_auth_username,
                        auth_password=sip_auth_password,
                        name=trunk_name,
                    )
                    trunk_id = str(updated_trunk.sip_trunk_id)
                    logger.info(
                        "Recovered duplicate LiveKit inbound trunk for agent=%s trunk=%s number=%s",
                        agent_id,
                        trunk_id,
                        phone_number,
                    )

            room_config = api.RoomConfiguration(
                agents=[
                    api.RoomAgentDispatch(
                        agent_name=agent_name,
                        metadata=json.dumps(
                            {"agent_id": agent_id, "phone_number": phone_number},
                            separators=(",", ":"),
                        ),
                    )
                ]
            )
            existing_dispatch_rule = await find_existing_dispatch_rule(trunk_id)

            if existing_dispatch_rule is not None:
                dispatch_rule = await lkapi.sip.update_dispatch_rule(
                    str(existing_dispatch_rule.sip_dispatch_rule_id),
                    api.SIPDispatchRuleInfo(
                        sip_dispatch_rule_id=str(existing_dispatch_rule.sip_dispatch_rule_id),
                        name=dispatch_name,
                        trunk_ids=[trunk_id],
                        rule=api.SIPDispatchRule(
                            dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                                room_prefix="call-"
                            )
                        ),
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
                try:
                    dispatch_rule = await lkapi.sip.create_dispatch_rule(
                        api.CreateSIPDispatchRuleRequest(
                            dispatch_rule=api.SIPDispatchRuleInfo(
                                name=dispatch_name,
                                trunk_ids=[trunk_id],
                                rule=api.SIPDispatchRule(
                                    dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                                        room_prefix="call-"
                                    )
                                ),
                                room_config=room_config,
                            )
                        )
                    )
                    dispatch_rule_id = str(getattr(dispatch_rule, "sip_dispatch_rule_id"))
                except Exception as exc:
                    if not _is_duplicate_livekit_resource_error(exc):
                        raise
                    existing_dispatch_rule = await find_existing_dispatch_rule(trunk_id)
                    if existing_dispatch_rule is None:
                        raise
                    dispatch_rule = await lkapi.sip.update_dispatch_rule(
                        str(existing_dispatch_rule.sip_dispatch_rule_id),
                        api.SIPDispatchRuleInfo(
                            sip_dispatch_rule_id=str(existing_dispatch_rule.sip_dispatch_rule_id),
                            name=dispatch_name,
                            trunk_ids=[trunk_id],
                            rule=api.SIPDispatchRule(
                                dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                                    room_prefix="call-"
                                )
                            ),
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
                        "Recovered duplicate LiveKit dispatch rule for agent=%s rule=%s trunk=%s",
                        agent_id,
                        dispatch_rule_id,
                        trunk_id,
                    )
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

    async def _resolve_phone_number(
        self,
        *,
        agent_id: str,
        agent: dict[str, Any],
        country: str,
    ) -> tuple[dict[str, Any], DatabaseNumberAssignment | None]:
        """Resolve an existing assigned number or buy a new one."""

        config_json = _normalize_config_json(agent.get("config_json"))
        assignment = await get_agent_phone_number_assignment(agent_id)

        if assignment and assignment.get("phone_e164"):
            phone_number = str(assignment["phone_e164"])
            record = None
            if assignment.get("external_number_id"):
                record = await self.telnyx_numbers.get_phone_number(str(assignment["external_number_id"]))
            if not record:
                record = await self.telnyx_numbers.find_phone_number(phone_number)
            if record:
                return record, assignment

        existing_number = (
            config_json.get("existing_phone_number")
            or config_json.get("telnyx_existing_number")
            or agent.get("phone_number")
        )
        if existing_number:
            record = await self.telnyx_numbers.find_phone_number(str(existing_number))
            if record is None:
                raise LookupError(
                    f"Telnyx number {existing_number} was not found on the configured account"
                )
            return record, assignment

        area_code = config_json.get("area_code") or config_json.get("preferred_area_code")
        available = await self.telnyx_numbers.list_available_phone_numbers(
            country_code=country,
            area_code=str(area_code) if area_code else None,
            page_size=1,
        )
        if not available:
            raise LookupError(f"No Telnyx numbers available for country={country}, area_code={area_code}")
        record = await self.telnyx_numbers.order_phone_number(str(available[0]["phone_number"]))
        return record, assignment

    async def provision_number(
        self,
        agent_id: str,
        webhook_base_url: str,
        *,
        country: str = "US",
    ) -> dict[str, Any]:
        """Provision or attach a Telnyx number and save it on the agent record."""

        agent = await get_agent(agent_id)
        if agent is None:
            raise LookupError(f"Agent {agent_id} was not found")

        telnyx_number, assignment = await self._resolve_phone_number(
            agent_id=agent_id,
            agent=agent,
            country=country,
        )
        fallback_phone_number = str(assignment.get("phone_e164") or "") if assignment else ""
        fallback_external_number_id = str(assignment.get("external_number_id") or "") if assignment else ""
        phone_number = str(telnyx_number.get("phone_number") or fallback_phone_number)
        external_number_id = str(telnyx_number.get("id") or fallback_external_number_id)
        if not phone_number or not external_number_id:
            raise RuntimeError("Resolved Telnyx phone number is missing phone_number or id")

        agent_name = str(agent.get("livekit_agent_name") or f"agent-{agent_id.replace('-', '')[:12]}")
        livekit_routing = await self._create_livekit_routing(
            agent_id=agent_id,
            agent_name=agent_name,
            phone_number=phone_number,
            existing_trunk_id=str(agent.get("livekit_trunk_id") or "") or None,
            existing_dispatch_rule_id=str(agent.get("livekit_dispatch_rule_id") or "") or None,
        )

        application_name = f"{agent_name}-voice"
        existing_voice_connection_id = (
            str(agent.get("voice_connection_id") or "")
            or (str(assignment.get("voice_connection_id") or "") if assignment else "")
            or None
        )
        application = await self.telnyx_numbers.ensure_call_control_application(
            application_id=existing_voice_connection_id,
            application_name=application_name,
            webhook_event_url=f"{webhook_base_url}/telnyx/voice",
            active=True,
        )
        voice_connection_id = str(application.get("id") or "")
        if not voice_connection_id:
            raise RuntimeError("Telnyx Call Control Application response is missing an id")

        await self.telnyx_numbers.attach_phone_number_to_connection(
            external_number_id=external_number_id,
            voice_connection_id=voice_connection_id,
        )

        provider_config_json = {
            "application_name": application_name,
            "webhook_event_url": f"{webhook_base_url}/telnyx/voice",
            "webhook_api_version": self.telnyx_numbers.config.webhook_api_version,
        }
        if self.telnyx_numbers.config.outbound_voice_profile_id:
            provider_config_json["outbound_voice_profile_id"] = (
                self.telnyx_numbers.config.outbound_voice_profile_id
            )

        updated_agent = await update_agent_fields(
            agent_id,
            {
                "phone_number": phone_number,
                "telephony_provider": "telnyx",
                "external_number_id": external_number_id,
                "voice_connection_id": voice_connection_id,
                "provider_config_json": provider_config_json,
                "livekit_agent_name": agent_name,
                **livekit_routing,
            },
        )

        await upsert_phone_number_assignment(
            organization_id=str(agent.get("organization_id")) if agent.get("organization_id") else None,
            clinic_id=str(agent.get("clinic_id")) if agent.get("clinic_id") else None,
            agent_id=agent_id,
            phone_number=phone_number,
            external_number_id=external_number_id,
            voice_connection_id=voice_connection_id,
            telephony_provider="telnyx",
            provider_config_json=provider_config_json,
        )

        logger.info(
            "Provisioned Telnyx number for agent=%s number=%s external_number_id=%s connection=%s",
            agent_id,
            phone_number,
            mask_secret(external_number_id),
            mask_secret(voice_connection_id),
        )
        return {
            "agent": updated_agent,
            "phone_number": phone_number,
            "external_number_id": external_number_id,
            "voice_connection_id": voice_connection_id,
            **livekit_routing,
        }

    async def deprovision_agent(self, agent_id: str) -> None:
        """Disable provider routing and tear down LiveKit resources for an unpublished agent."""

        agent = await get_agent(agent_id)
        if agent is None:
            raise LookupError(f"Agent {agent_id} was not found")

        dispatch_rule_id = agent.get("livekit_dispatch_rule_id")
        trunk_id = agent.get("livekit_trunk_id")
        voice_connection_id = str(agent.get("voice_connection_id") or "")

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

        if voice_connection_id:
            await self.telnyx_numbers.deactivate_call_control_application(voice_connection_id)

        await update_agent_fields(
            agent_id,
            {
                "livekit_trunk_id": None,
                "livekit_dispatch_rule_id": None,
                "sip_auth_username": None,
                "sip_auth_password": None,
            },
        )
