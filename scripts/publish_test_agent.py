from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
import time
from itertools import cycle
from pathlib import Path
from urllib import error, request

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
root_str = str(ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")

DEFAULT_PLATFORM_BASE_URL = "http://127.0.0.1:8000"
PLATFORM_BASE_URL = str(os.getenv("PLATFORM_BASE_URL") or DEFAULT_PLATFORM_BASE_URL).rstrip("/")
TEST_TWILIO_NUMBER = "+13103410536"


def http_json(method: str, url: str, payload: dict | None = None, timeout: int = 10) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=data, headers=headers, method=method)
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


def candidate_platform_base_urls() -> list[str]:
    configured = PLATFORM_BASE_URL.rstrip("/")
    candidates: list[str] = [configured]

    if configured == "http://localhost:8000":
        candidates.append(DEFAULT_PLATFORM_BASE_URL)
    elif configured == DEFAULT_PLATFORM_BASE_URL:
        candidates.append("http://localhost:8000")

    return candidates


def check_platform_health() -> bool:
    global PLATFORM_BASE_URL

    errors: list[str] = []
    for base_url in candidate_platform_base_urls():
        try:
            payload = http_json("GET", f"{base_url}/health", timeout=5)
        except Exception as exc:
            errors.append(f"{base_url}/health -> {exc}")
            continue

        if payload.get("status") == "ok":
            PLATFORM_BASE_URL = base_url
            return True

        errors.append(f"{base_url}/health -> unexpected payload: {payload}")

    print("Platform API health check failed.")
    print("Start the platform API first: python run.py")
    print("Tried:")
    for item in errors:
        print(f"  - {item}")
    print("Tip: if the API is already running, set PLATFORM_BASE_URL explicitly or use 127.0.0.1 instead of localhost.")
    return False


async def find_existing_test_agents() -> list[str]:
    connection = await asyncpg.connect(os.getenv("DATABASE_URL", ""))
    try:
        rows = await connection.fetch(
            """
            SELECT id
            FROM agents
            WHERE name = 'Test Agent'
              AND config_json->>'twilio_existing_number' = $1
            ORDER BY created_at DESC
            """,
            TEST_TWILIO_NUMBER,
        )
        return [str(row["id"]) for row in rows]
    finally:
        await connection.close()


async def create_or_reuse_test_agent(existing_agent_id: str | None = None) -> str:
    connection = await asyncpg.connect(os.getenv("DATABASE_URL", ""))
    try:
        seed_row = await connection.fetchrow(
            """
            SELECT organization_id, clinic_id
            FROM agents
            WHERE organization_id IS NOT NULL AND clinic_id IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        if seed_row is None:
            raise RuntimeError(
                "No existing agent row with organization_id and clinic_id was found. "
                "Create one manually first, then retry publish_test_agent.py."
            )

        config = {
            "name": "Test Agent",
            "persona": "You are a friendly receptionist for Test Business.",
            "business_name": "Test Business",
            "services": ["consultation", "general appointment"],
            "business_hours": "Mon-Fri 9am-5pm",
            "notification_email": "test@example.com",
            "calendar_id": None,
            "industry_type": "dental",
            "greeting_text": "Hi, thanks for calling Test Business! How can I help?",
            # Trial-account testing path: reuse the already-owned Twilio number +13103410536
            # so this test agent does not attempt to buy a new number.
            # Because this shared number and its LiveKit routing can only belong to one
            # test agent row at a time, this script reuses a single Test Agent record.
            # To move back to the normal production purchase flow later, remove the
            # `twilio_existing_number` and `twilio_release_on_unpublish` keys below.
            "twilio_existing_number": TEST_TWILIO_NUMBER,
            "twilio_release_on_unpublish": False,
        }

        if existing_agent_id:
            await connection.execute(
                """
                UPDATE agents
                SET organization_id = $1::uuid,
                    clinic_id = $2::uuid,
                    name = 'Test Agent',
                    config_json = $3::jsonb,
                    status = 'offline',
                    deploy_error = NULL,
                    phone_number = NULL,
                    twilio_phone_sid = NULL,
                    livekit_trunk_id = NULL,
                    livekit_dispatch_rule_id = NULL,
                    sip_auth_username = NULL,
                    sip_auth_password = NULL,
                    port = NULL,
                    subdomain = NULL,
                    updated_at = NOW()
                WHERE id = $4::uuid
                """,
                str(seed_row["organization_id"]),
                str(seed_row["clinic_id"]),
                json.dumps(config),
                existing_agent_id,
            )
            return existing_agent_id

        row = await connection.fetchrow(
            """
            INSERT INTO agents (id, user_id, organization_id, clinic_id, name, config_json, status)
            VALUES (
              gen_random_uuid(),
              gen_random_uuid(),
              $1::uuid,
              $2::uuid,
              'Test Agent',
              $3::jsonb,
              'offline'
            )
            RETURNING id
            """,
            str(seed_row["organization_id"]),
            str(seed_row["clinic_id"]),
            json.dumps(config),
        )
        return str(row["id"])
    finally:
        await connection.close()


def print_failure_logs(agent_id: str) -> None:
    try:
        payload = http_json("GET", f"{PLATFORM_BASE_URL}/api/agents/{agent_id}/logs?lines=30", timeout=15)
    except Exception as exc:
        print(f"Unable to fetch logs: {exc}")
        return

    print("Last 30 log lines:")
    print(payload.get("logs") or "<no logs returned>")


def verify_agent_health(url: str) -> bool:
    try:
        with request.urlopen(f"{url.rstrip('/')}/health", timeout=10) as response:
            return response.status == 200
    except Exception:
        return False


def main() -> int:
    if not check_platform_health():
        return 1

    existing_agent_ids = asyncio.run(find_existing_test_agents())
    existing_agent_id = existing_agent_ids[0] if existing_agent_ids else None
    if existing_agent_ids:
        print(f"Cleaning up {len(existing_agent_ids)} existing shared-number test agent(s)...")
        for candidate_id in existing_agent_ids:
            try:
                http_json(
                    "POST",
                    f"{PLATFORM_BASE_URL}/api/agents/{candidate_id}/unpublish",
                    payload={},
                    timeout=120,
                )
            except Exception as exc:
                print(f"Warning: could not unpublish previous test agent {candidate_id}: {exc}")
        print(f"Reusing existing shared-number test agent: {existing_agent_id}")

    agent_id = asyncio.run(create_or_reuse_test_agent(existing_agent_id))
    print(f"Created test agent: {agent_id}")
    print(f"Using existing Twilio test number: {TEST_TWILIO_NUMBER}")

    try:
        publish_response = http_json(
            "POST",
            f"{PLATFORM_BASE_URL}/api/agents/{agent_id}/publish",
            payload={},
            timeout=600,
        )
    except (TimeoutError, socket.timeout):
        print("Publish request timed out locally. Continuing to poll agent status...")
        publish_response = {}
    except error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)) or "timed out" in str(exc).lower():
            print("Publish request timed out locally. Continuing to poll agent status...")
            publish_response = {}
        else:
            print(f"Publish request failed: {exc}")
            return 1
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        print(f"Publish request failed: {body or exc}")
        return 1
    except Exception as exc:
        if "timed out" in str(exc).lower():
            print("Publish request timed out locally. Continuing to poll agent status...")
            publish_response = {}
        else:
            print(f"Publish request failed: {exc}")
            return 1

    if publish_response.get("status") == "live":
        status_payload = publish_response
    else:
        status_payload = {}

    spinner = cycle("|/-\\")
    started_at = time.time()

    try:
        while not status_payload or status_payload.get("status") != "live":
            elapsed = int(time.time() - started_at)
            if elapsed > 600:
                print("\nTimed out waiting for agent to go live.")
                print_failure_logs(agent_id)
                return 1

            try:
                status_payload = http_json(
                    "GET",
                    f"{PLATFORM_BASE_URL}/api/agents/{agent_id}/status",
                    timeout=15,
                )
            except Exception as exc:
                print(f"\nStatus check failed: {exc}")
                print_failure_logs(agent_id)
                return 1

            status = str(status_payload.get("status") or "unknown")
            print(f"\r{next(spinner)} Waiting... status={status} ({elapsed}s)", end="", flush=True)

            if status == "live":
                break
            if status in {"error", "failed"}:
                print()
                print(status_payload.get("deploy_error") or "Publish failed.")
                print_failure_logs(agent_id)
                return 1
            time.sleep(5)
    except KeyboardInterrupt:
        print("\nInterrupted while waiting for publish.")
        return 1

    print()
    phone_number = status_payload.get("phone_number") or publish_response.get("phone_number")
    url = status_payload.get("url") or publish_response.get("webhook_base_url")

    print("================================================")
    print("Agent is LIVE!")
    print(f"Phone number: {phone_number}")
    print(f"Agent URL: {url}")
    print(f"Agent ID: {agent_id}")
    print("Call this number to test your agent.")
    print("================================================")

    if url and verify_agent_health(str(url)):
        print("PASS: /health returned 200")
        return 0

    print("FAIL: /health check did not return 200")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
