from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from pathlib import Path
from urllib import error, request
from uuid import UUID

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
root_str = str(ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")

DEFAULT_PLATFORM_BASE_URL = "http://127.0.0.1:8000"
PLATFORM_BASE_URL = str(os.getenv("PLATFORM_BASE_URL") or DEFAULT_PLATFORM_BASE_URL).rstrip("/")


def normalize_agent_id(agent_id: str) -> str:
    candidate = str(agent_id or "").strip()
    if candidate.lower().startswith("agent-"):
        candidate = candidate[6:]
    return str(UUID(candidate))


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


def wait_for_terminal_status(agent_id: str, timeout_seconds: int) -> dict:
    started_at = time.time()
    while True:
        elapsed = int(time.time() - started_at)
        if elapsed > timeout_seconds:
            raise TimeoutError(f"Timed out waiting for redeploy to finish for {agent_id}")

        payload = http_json(
            "GET",
            f"{PLATFORM_BASE_URL}/api/agents/{agent_id}/status",
            timeout=15,
        )
        status = str(payload.get("status") or "unknown")
        print(f"\rWaiting... status={status} ({elapsed}s)", end="", flush=True)

        if status == "live":
            print()
            return payload
        if status in {"error", "failed"}:
            print()
            return payload

        time.sleep(5)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Push local runtime code changes to a published Hetzner agent.")
    parser.add_argument("--agent-id", required=True, help="Published agent UUID or agent-<uuid> to redeploy.")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout in seconds for redeploy and health checks.")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    try:
        normalized_agent_id = normalize_agent_id(args.agent_id)
    except ValueError:
        print(f"Invalid agent ID: {args.agent_id}")
        return 1

    if not check_platform_health():
        return 1

    print(f"Redeploying agent {normalized_agent_id} from local runtime files...")

    try:
        response = http_json(
            "POST",
            f"{PLATFORM_BASE_URL}/api/agents/{normalized_agent_id}/redeploy",
            payload={},
            timeout=args.timeout,
        )
    except (TimeoutError, socket.timeout):
        print("Redeploy request timed out locally. Continuing to poll agent status...")
        response = {}
    except error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)) or "timed out" in str(exc).lower():
            print("Redeploy request timed out locally. Continuing to poll agent status...")
            response = {}
        else:
            print(f"Redeploy request failed: {exc}")
            return 1
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        print(f"Redeploy request failed: {body or exc}")
        return 1
    except Exception as exc:
        if "timed out" in str(exc).lower():
            print("Redeploy request timed out locally. Continuing to poll agent status...")
            response = {}
        else:
            print(f"Redeploy request failed: {exc}")
            return 1

    if response.get("status") == "live":
        status_payload = response
    else:
        try:
            status_payload = wait_for_terminal_status(normalized_agent_id, args.timeout)
        except Exception as exc:
            print(str(exc))
            print_failure_logs(normalized_agent_id)
            return 1

    if status_payload.get("status") != "live":
        print(status_payload.get("deploy_error") or "Redeploy failed.")
        print_failure_logs(normalized_agent_id)
        return 1

    webhook_base_url = status_payload.get("webhook_base_url") or status_payload.get("url")
    print("================================================")
    print("Agent redeploy complete.")
    print(f"Agent ID: {normalized_agent_id}")
    print(f"Agent URL: {webhook_base_url}")
    print("================================================")

    if webhook_base_url and verify_agent_health(str(webhook_base_url)):
        print("PASS: /health returned 200")
        return 0

    print("WARN: direct /health verification from this machine did not return 200, but the platform marked the agent live.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
