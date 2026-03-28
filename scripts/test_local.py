from __future__ import annotations

import asyncio
import importlib
import json
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Any
from urllib import error, request

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
root_str = str(ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")

import asyncpg
import paramiko

from agent_platform.server_manager import load_ssh_key, normalize_key_path

REQUIRED_ENV_VARS = [
    "HETZNER_SERVER_IP",
    "HETZNER_SSH_KEY_PATH",
    "DATABASE_URL",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "OPENAI_API_KEY",
]

IMPORT_CHECKS = [
    ("asyncpg", "import asyncpg"),
    ("paramiko", "import paramiko"),
    ("twilio.rest.Client", "from twilio.rest import Client"),
    ("database.db.init_pool", "from database.db import init_pool"),
    ("agent_platform.utils.generate_subdomain", "from agent_platform.utils import generate_subdomain"),
    (
        "agent_platform.server_manager.AgentServerManager",
        "from agent_platform.server_manager import AgentServerManager",
    ),
    (
        "agent_platform.twilio_provisioner.TwilioProvisioner",
        "from agent_platform.twilio_provisioner import TwilioProvisioner",
    ),
    ("webhook_server.app", "from webhook_server import app"),
    ("post_call_pipeline.post_call_pipeline", "from post_call_pipeline import post_call_pipeline"),
    ("agent_wrapper.wrap_entrypoint", "from agent_wrapper import wrap_entrypoint"),
    ("main.platform_app", "from main import app as platform_app"),
]

REQUIRED_ROUTE_SIGNATURES = {
    ("GET", "/"),
    ("GET", "/health"),
    ("POST", "/api/agents/{agent_id}/publish"),
    ("POST", "/api/agents/{agent_id}/unpublish"),
}


def print_test_header(number: int, title: str) -> None:
    print(f"\nTEST {number} - {title}")


def test_required_env_vars() -> bool:
    missing = [name for name in REQUIRED_ENV_VARS if not str(os.getenv(name) or "").strip()]
    if missing:
        print("FAIL")
        print("Missing required env vars:")
        for name in missing:
            print(f"  - {name}")
        return False
    print("PASS")
    return True


def test_ssh_key_exists() -> bool:
    key_path = os.getenv("HETZNER_SSH_KEY_PATH", "")
    try:
        normalized = normalize_key_path(key_path)
    except Exception as exc:
        print("FAIL")
        print(exc)
        return False

    if os.path.exists(normalized):
        print(f"PASS: SSH key found at {normalized}")
        return True

    print("FAIL")
    print(f"Resolved path: {normalized}")
    return False


def test_ssh_connection() -> bool:
    server_ip = str(os.getenv("HETZNER_SERVER_IP") or "").strip()
    key_path = str(os.getenv("HETZNER_SSH_KEY_PATH") or "").strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        loaded_key = load_ssh_key(key_path)
        client.connect(
            hostname=server_ip,
            username="root",
            pkey=loaded_key,
            look_for_keys=False,
            allow_agent=False,
            timeout=30,
            banner_timeout=30,
            auth_timeout=30,
        )
        _, stdout, stderr = client.exec_command("python3 --version", timeout=30)
        output = stdout.read().decode("utf-8", "ignore").strip() or stderr.read().decode("utf-8", "ignore").strip()
        print("PASS")
        print(output or "python3 --version returned no output")
        return True
    except Exception as exc:
        print("FAIL")
        print(exc)
        print("Run this manually to debug:")
        print(f"ssh -i {key_path} root@{server_ip}")
        return False
    finally:
        client.close()


async def _database_checks() -> tuple[bool, list[str]]:
    messages: list[str] = []
    connection = await asyncpg.connect(os.getenv("DATABASE_URL", ""))
    try:
        try:
            count = await connection.fetchval("SELECT COUNT(*) FROM port_registry")
        except asyncpg.UndefinedTableError:
            return False, ["Run database/schema.sql in Supabase first"]

        required_tables = [
            "agents",
            "call_logs",
            "appointments",
            "analytics_daily",
        ]
        rows = await connection.fetch(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
            """,
            required_tables,
        )
        found_tables = {row["table_name"] for row in rows}
        missing_tables = [name for name in required_tables if name not in found_tables]
        if missing_tables:
            return False, [f"Missing tables: {', '.join(missing_tables)}", "Run database/schema.sql in Supabase first"]

        if count == 500:
            messages.append("port_registry count is 500")
            return True, messages
        if count == 0:
            return False, ["Run scripts/init_port_registry.py first"]
        return False, [f"Expected 500 rows in port_registry, found {count}"]
    finally:
        await connection.close()


def test_database_connection() -> bool:
    try:
        passed, messages = asyncio.run(_database_checks())
    except Exception as exc:
        print("FAIL")
        print(exc)
        return False

    if passed:
        print("PASS")
        for message in messages:
            print(message)
        return True

    print("FAIL")
    for message in messages:
        print(message)
    return False


def test_python_imports() -> bool:
    all_passed = True
    for label, statement in IMPORT_CHECKS:
        try:
            exec(statement, {})
            print(f"PASS  {label}")
        except Exception as exc:
            print(f"FAIL  {label}")
            print(f"      {exc}")
            all_passed = False
    return all_passed


def _load_main_module() -> ModuleType:
    return importlib.import_module("main")


def test_main_routes() -> bool:
    try:
        app = _load_main_module().app
    except Exception as exc:
        print("FAIL")
        print(exc)
        return False

    route_signatures: set[tuple[str, str]] = set()
    full_route_list: list[str] = []
    for route in app.routes:
        methods = sorted(getattr(route, "methods", []) or [])
        path = getattr(route, "path", "")
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            route_signatures.add((method, path))
            full_route_list.append(f"{method} {path}")

    print("Routes:")
    for route_line in sorted(full_route_list):
        print(f"  {route_line}")

    missing = sorted(REQUIRED_ROUTE_SIGNATURES - route_signatures)
    if missing:
        print("FAIL")
        for method, path in missing:
            print(f"Missing route: {method} {path}")
        return False

    print("PASS")
    return True


def test_ngrok_status() -> bool:
    try:
        with request.urlopen("http://localhost:4040/api/tunnels", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        print("FAIL")
        print("ngrok not running. Start with: ngrok http 8000")
        return False

    tunnels = payload.get("tunnels") or []
    public_url = next((item.get("public_url") for item in tunnels if item.get("public_url")), None)
    if not public_url:
        print("FAIL")
        print("ngrok API responded, but no public tunnel is active.")
        return False

    print("PASS")
    print(f"Twilio webhook base: {public_url}")
    return True


def main() -> int:
    tests = [
        ("Required env vars present", test_required_env_vars),
        ("SSH key file exists on disk", test_ssh_key_exists),
        ("SSH connection to Hetzner", test_ssh_connection),
        ("Database connection", test_database_connection),
        ("Python imports", test_python_imports),
        ("main.py routes", test_main_routes),
        ("ngrok status", test_ngrok_status),
    ]

    passed = 0
    for index, (title, fn) in enumerate(tests, start=1):
        print_test_header(index, title)
        if fn():
            passed += 1

    print(f"\n{passed}/7 tests passed")
    if passed == 7:
        print("All checks passed. Ready to run publish.")
        return 0

    print("Fix the above before running publish.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
