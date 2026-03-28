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

PLATFORM_BASE_URL = "http://localhost:8000"


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


def check_platform_health() -> bool:
    try:
        payload = http_json("GET", f"{PLATFORM_BASE_URL}/health", timeout=5)
    except Exception:
        print("Start the platform API first: python run.py")
        return False
    return payload.get("status") == "ok"


async def create_test_agent() -> str:
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
        }

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

    agent_id = asyncio.run(create_test_agent())
    print(f"Created test agent: {agent_id}")

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
