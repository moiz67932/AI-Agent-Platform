"""
One-shot cleanup script:
  1. SSH into Hetzner and remove all agent supervisor programs, dirs, nginx configs, logs.
  2. Delete all LiveKit SIP inbound trunks and dispatch rules.

Run from the repo root:
    python scripts/cleanup_all_agents.py
"""

from __future__ import annotations

import asyncio
import os
import sys

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")


# ── Step 1: SSH cleanup ───────────────────────────────────────────────────────

def ssh_cleanup() -> None:
    import paramiko
    from agent_platform.server_manager import load_ssh_key

    host = os.environ["HETZNER_SERVER_IP"]
    key_path = os.environ["HETZNER_SSH_KEY_PATH"]
    pkey = load_ssh_key(key_path)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username="root", pkey=pkey,
                   look_for_keys=False, allow_agent=False, timeout=30)

    def run(cmd: str, check: bool = True) -> str:
        print(f"  $ {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", "ignore").strip()
        err = stderr.read().decode("utf-8", "ignore").strip()
        if out:
            print(f"    {out}")
        if err and exit_code != 0:
            print(f"    STDERR: {err}")
        if check and exit_code != 0:
            raise RuntimeError(f"Command failed (exit {exit_code}): {err or out}")
        return out

    print("\n[SSH] Connected to", host)

    # Stop all agent supervisor programs
    print("\n[SSH] Stopping all agent supervisor programs...")
    run("supervisorctl stop all", check=False)

    # Remove all agent supervisor config files
    print("\n[SSH] Removing supervisor configs...")
    run("ls /etc/supervisor/conf.d/", check=False)
    run(
        "for f in /etc/supervisor/conf.d/agent-*.conf; do "
        "  [ -f \"$f\" ] && echo \"Removing $f\" && rm -f \"$f\"; "
        "done",
        check=False,
    )

    # Remove all agent nginx configs
    print("\n[SSH] Removing nginx configs...")
    run(
        "for f in /etc/nginx/sites-enabled/agent-*.conf; do "
        "  [ -f \"$f\" ] && echo \"Removing $f\" && rm -f \"$f\"; "
        "done",
        check=False,
    )

    # Remove all agent deployment directories
    print("\n[SSH] Removing agent directories from /opt/agents/...")
    run("ls /opt/agents/ 2>/dev/null || echo '(empty)'", check=False)
    run("rm -rf /opt/agents/agent-*", check=False)

    # Remove log files
    print("\n[SSH] Removing agent log files...")
    run("rm -f /var/log/agents/agent-*.log", check=False)

    # Reload supervisor and nginx
    print("\n[SSH] Reloading supervisor...")
    run("supervisorctl reread", check=False)
    run("supervisorctl update", check=False)

    print("\n[SSH] Reloading nginx...")
    nginx_test = run("nginx -t 2>&1", check=False)
    if "ok" in nginx_test.lower() or "successful" in nginx_test.lower() or nginx_test == "":
        run("systemctl reload nginx", check=False)
    else:
        print(f"  nginx -t output: {nginx_test}")
        print("  Skipping nginx reload (may not be installed or config error)")

    # Final verification
    print("\n[SSH] Verification — remaining supervisor programs:")
    run("supervisorctl status 2>/dev/null || echo '(none running)'", check=False)
    print("\n[SSH] Verification — /opt/agents contents:")
    run("ls /opt/agents/ 2>/dev/null || echo '(empty)'", check=False)

    client.close()
    print("\n[SSH] Done. Server is clean.")


# ── Step 2: LiveKit SIP cleanup ───────────────────────────────────────────────

async def livekit_cleanup() -> None:
    from livekit import api as lkapi_module

    lk_url = os.environ.get("LIVEKIT_URL", "")
    lk_key = os.environ.get("LIVEKIT_API_KEY", "")
    lk_secret = os.environ.get("LIVEKIT_API_SECRET", "")

    if not lk_url or not lk_key or not lk_secret:
        print("\n[LiveKit] Skipping — LIVEKIT_URL / API_KEY / API_SECRET not set.")
        return

    print(f"\n[LiveKit] Connecting to {lk_url}")
    lkapi = lkapi_module.LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret)

    try:
        # Delete all dispatch rules
        print("\n[LiveKit] Fetching dispatch rules...")
        rules_response = await lkapi.sip.list_dispatch_rule(lkapi_module.ListSIPDispatchRuleRequest())
        rules = list(rules_response.items)
        if rules:
            print(f"  Found {len(rules)} dispatch rule(s).")
            for rule in rules:
                rule_id = str(rule.sip_dispatch_rule_id)
                name = str(rule.name or rule_id)
                print(f"  Deleting dispatch rule: {name} ({rule_id})")
                await lkapi.sip.delete_dispatch_rule(
                    lkapi_module.DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=rule_id)
                )
                print(f"    Deleted.")
        else:
            print("  No dispatch rules found.")

        # Delete all inbound trunks
        print("\n[LiveKit] Fetching inbound trunks...")
        trunks_response = await lkapi.sip.list_inbound_trunk(lkapi_module.ListSIPInboundTrunkRequest())
        trunks = list(trunks_response.items)
        if trunks:
            print(f"  Found {len(trunks)} inbound trunk(s).")
            for trunk in trunks:
                trunk_id = str(trunk.sip_trunk_id)
                name = str(trunk.name or trunk_id)
                numbers = list(trunk.numbers)
                print(f"  Deleting trunk: {name} ({trunk_id}) numbers={numbers}")
                await lkapi.sip.delete_trunk(
                    lkapi_module.DeleteSIPTrunkRequest(sip_trunk_id=trunk_id)
                )
                print(f"    Deleted.")
        else:
            print("  No inbound trunks found.")

    finally:
        await lkapi.aclose()

    print("\n[LiveKit] Done. All SIP resources removed.")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    print("=" * 60)
    print("AGENT PLATFORM CLEANUP")
    print("=" * 60)

    print("\n>>> STEP 1: SSH server cleanup")
    try:
        await asyncio.to_thread(ssh_cleanup)
    except Exception as exc:
        print(f"\n[SSH] ERROR: {exc}")
        print("Continuing to LiveKit cleanup...")

    print("\n>>> STEP 2: LiveKit SIP cleanup")
    try:
        await livekit_cleanup()
    except Exception as exc:
        print(f"\n[LiveKit] ERROR: {exc}")

    print("\n" + "=" * 60)
    print("Cleanup complete. Now run the SQL in Supabase to wipe the DB.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
