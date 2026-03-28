from dotenv import load_dotenv

from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
root_str = str(ROOT)
if root_str not in sys.path:
    sys.path.insert(0, root_str)

load_dotenv(".env")
load_dotenv(".env.local")

results = []

checks = [
    ("asyncpg", "import asyncpg"),
    ("paramiko", "import paramiko"),
    ("fastapi", "from fastapi import FastAPI"),
    ("twilio", "from twilio.rest import Client"),
    ("livekit.agents", "from livekit.agents import AgentServer"),
    ("database.db", "from database.db import init_pool, close_pool"),
    ("agent_platform.utils", "from agent_platform.utils import generate_subdomain, mask_secret"),
    ("agent_platform.server_manager", "from agent_platform.server_manager import AgentServerManager"),
    ("agent_platform.twilio_provisioner", "from agent_platform.twilio_provisioner import TwilioProvisioner"),
    ("webhook_server", "from webhook_server import app"),
    ("post_call_pipeline", "from post_call_pipeline import post_call_pipeline"),
    ("agent_wrapper", "from agent_wrapper import wrap_entrypoint"),
    ("main", "from main import app"),
]

for name, stmt in checks:
    try:
        exec(stmt, {})
        print(f"  PASS  {name}")
        results.append(True)
    except Exception as e:
        print(f"  FAIL  {name}")
        print(f"        {e}")
        results.append(False)

passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} imports OK")
if passed == total:
    print("Import chain is clean.")
    sys.exit(0)
else:
    print(f"{total - passed} import(s) failed. Fix before running platform.")
    sys.exit(1)
