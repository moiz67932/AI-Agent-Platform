from __future__ import annotations

import pytest

from services.telnyx_client import TelnyxAPIError, TelnyxConfig, _summarize_telnyx_error_body
from services.telnyx_number_service import TelnyxNumberService


class DummyClient:
    def __init__(self) -> None:
        self.config = TelnyxConfig(
            api_key="key",
            public_key="",
            api_base_url="https://api.telnyx.com/v2",
            outbound_voice_profile_id="",
            webhook_api_version="2",
            webhook_timeout_secs=10,
            signature_tolerance_secs=300,
            disable_signature_verification=False,
        )
        self.calls: list[tuple[str, str, dict[str, object]]] = []

    async def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, object] | None = None,
        params: dict[str, object] | None = None,
        expected_statuses: set[int] | None = None,
    ) -> dict[str, object]:
        self.calls.append((method, path, json_body or {}))
        return {"data": {"id": "app-123"}}


@pytest.mark.asyncio
async def test_create_call_control_application_rejects_localhost_webhook() -> None:
    client = DummyClient()
    service = TelnyxNumberService(client=client)

    with pytest.raises(ValueError, match="AGENTS_DOMAIN=localhost"):
        await service.create_call_control_application(
            application_name="agent-test-voice",
            webhook_event_url="http://localhost:8001/telnyx/voice",
        )

    assert client.calls == []


@pytest.mark.asyncio
async def test_create_call_control_application_rejects_private_ip_webhook() -> None:
    client = DummyClient()
    service = TelnyxNumberService(client=client)

    with pytest.raises(ValueError, match="publicly reachable"):
        await service.create_call_control_application(
            application_name="agent-test-voice",
            webhook_event_url="http://192.168.1.10:8001/telnyx/voice",
        )

    assert client.calls == []


@pytest.mark.asyncio
async def test_create_call_control_application_allows_public_https_webhook() -> None:
    client = DummyClient()
    service = TelnyxNumberService(client=client)

    result = await service.create_call_control_application(
        application_name="agent-test-voice",
        webhook_event_url="https://demo.agents.example.com/telnyx/voice",
    )

    assert result["id"] == "app-123"
    assert client.calls == [
        (
            "POST",
            "/call_control_applications",
            {
                "application_name": "agent-test-voice",
                "active": True,
                "webhook_event_url": "https://demo.agents.example.com/telnyx/voice",
                "webhook_api_version": "2",
                "webhook_timeout_secs": 10,
            },
        )
    ]


def test_summarize_telnyx_error_body_includes_pointer_and_detail() -> None:
    summary = _summarize_telnyx_error_body(
        {
            "errors": [
                {
                    "title": "Invalid value",
                    "detail": "must be a valid URL",
                    "source": {"pointer": "/data/attributes/webhook_event_url"},
                }
            ]
        }
    )

    assert summary == "Invalid value: must be a valid URL [/data/attributes/webhook_event_url]"


@pytest.mark.asyncio
async def test_ensure_call_control_application_reuses_existing_app_by_name() -> None:
    class ReuseByNameClient(DummyClient):
        async def request(
            self,
            method: str,
            path: str,
            *,
            json_body: dict[str, object] | None = None,
            params: dict[str, object] | None = None,
            expected_statuses: set[int] | None = None,
        ) -> dict[str, object]:
            self.calls.append((method, path, json_body or {}))
            if method == "GET" and path == "/call_control_applications":
                return {"data": [{"id": "app-existing", "application_name": "agent-test-voice"}]}
            if method == "PATCH" and path == "/call_control_applications/app-existing":
                return {"data": {"id": "app-existing"}}
            raise AssertionError(f"Unexpected request: {method} {path}")

    client = ReuseByNameClient()
    service = TelnyxNumberService(client=client)

    result = await service.ensure_call_control_application(
        application_id=None,
        application_name="agent-test-voice",
        webhook_event_url="https://demo.agents.example.com/telnyx/voice",
    )

    assert result["id"] == "app-existing"
    assert [call[:2] for call in client.calls] == [
        ("GET", "/call_control_applications"),
        ("PATCH", "/call_control_applications/app-existing"),
    ]


@pytest.mark.asyncio
async def test_ensure_call_control_application_recovers_duplicate_name_error() -> None:
    class DuplicateThenReuseClient(DummyClient):
        def __init__(self) -> None:
            super().__init__()
            self.create_attempts = 0

        async def request(
            self,
            method: str,
            path: str,
            *,
            json_body: dict[str, object] | None = None,
            params: dict[str, object] | None = None,
            expected_statuses: set[int] | None = None,
        ) -> dict[str, object]:
            self.calls.append((method, path, json_body or {}))
            if method == "GET" and path == "/call_control_applications":
                if self.create_attempts == 0:
                    return {"data": []}
                return {"data": [{"id": "app-existing", "application_name": "agent-test-voice"}]}
            if method == "POST" and path == "/call_control_applications":
                self.create_attempts += 1
                raise TelnyxAPIError(
                    "Telnyx API request failed: POST /call_control_applications -> 422 "
                    "(Bad Request: The name you have chosen is already in use. Please choose another name. "
                    "[/application_name])",
                    status=422,
                    body={
                        "errors": [
                            {
                                "detail": "The name you have chosen is already in use. Please choose another name.",
                                "source": {"pointer": "/application_name"},
                            }
                        ]
                    },
                )
            if method == "PATCH" and path == "/call_control_applications/app-existing":
                return {"data": {"id": "app-existing"}}
            raise AssertionError(f"Unexpected request: {method} {path}")

    client = DuplicateThenReuseClient()
    service = TelnyxNumberService(client=client)

    result = await service.ensure_call_control_application(
        application_id=None,
        application_name="agent-test-voice",
        webhook_event_url="https://demo.agents.example.com/telnyx/voice",
    )

    assert result["id"] == "app-existing"
    assert [call[:2] for call in client.calls] == [
        ("GET", "/call_control_applications"),
        ("POST", "/call_control_applications"),
        ("GET", "/call_control_applications"),
        ("PATCH", "/call_control_applications/app-existing"),
    ]
