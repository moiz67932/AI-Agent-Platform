# Hetzner Redeploy Commands

Use this when local code changes need to show up on the already-published Hetzner agent.

## From This Repo

Start the platform API if it is not already running:

```bash
.venv/Scripts/python.exe run.py
```

In a second terminal, redeploy the live agent:

```bash
.venv/Scripts/python.exe scripts/redeploy_agent.py --agent-id agent-87112821-4661-4dd9-a22e-ba57b48feb17
```

The redeploy command uploads the current runtime files, refreshes the remote `.env`, installs `requirements.txt`, restarts the remote webhook and worker processes, and waits for health to pass.

## If The Platform API Uses Another URL

Set `PLATFORM_BASE_URL` before redeploying:

```bash
export PLATFORM_BASE_URL="http://127.0.0.1:8000"
.venv/Scripts/python.exe scripts/redeploy_agent.py --agent-id agent-87112821-4661-4dd9-a22e-ba57b48feb17
```

## Quick Verify

After the command says the agent is live, place a test call to the agent number and watch logs from the platform UI or API.

Restart-only is not enough for code changes:

```bash
curl -X POST http://127.0.0.1:8000/api/agents/87112821-4661-4dd9-a22e-ba57b48feb17/restart
```

Use restart only when the remote code and config are already correct.
