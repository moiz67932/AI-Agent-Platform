# Deployment

This flow assumes:

- Python 3.11+
- A Supabase/PostgreSQL database
- LiveKit Cloud credentials
- A Twilio account
- A Hetzner VPS reachable over SSH

## 1. Install dependencies

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2. Apply the database schema

Run [database/schema.sql](/c:/Users/Moiz/Desktop/Agent/Agent/database/schema.sql) in the Supabase SQL editor, then seed the port table:

```powershell
$env:DATABASE_URL="postgresql://..."
python scripts/init_port_registry.py
```

## 3. Configure environment variables

Copy [`.env.example`](/c:/Users/Moiz/Desktop/Agent/Agent/.env.example) to `.env` and fill in:

- Hetzner SSH access
- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_SIP_HOST`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`, `EMAIL_FROM`
- `GOOGLE_CREDENTIALS_JSON`
- `INTERNAL_SECRET`

For local development set:

```env
AGENTS_DOMAIN=localhost
ENVIRONMENT=development
```

For production set:

```env
AGENTS_DOMAIN=agents.yourdomain.com
ENVIRONMENT=production
```

## 4. Prepare the Hetzner server

SSH into the server and install the runtime:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip nginx supervisor
sudo mkdir -p /opt/agents /var/log/agents
sudo chown -R $USER:$USER /opt/agents /var/log/agents
```

If you are using a real domain, point `*.agents.yourdomain.com` at the server and install your wildcard certificate separately before enabling production traffic.

## 5. Start the platform API

Create a small FastAPI app that includes [agent_platform/routes/agents.py](/c:/Users/Moiz/Desktop/Agent/Agent/agent_platform/routes/agents.py). A minimal example:

```python
from fastapi import FastAPI
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

root = Path(__file__).resolve().parent
spec = spec_from_file_location("voice_platform_routes", root / "agent_platform" / "routes" / "agents.py")
module = module_from_spec(spec)
spec.loader.exec_module(module)

app = FastAPI()
app.include_router(module.router)
```

Run it locally:

```powershell
uvicorn app:app --host 0.0.0.0 --port 8000
```

## 6. Expose the platform API for Twilio during local development

```powershell
ngrok http 8000
```

Use the public HTTPS URL when you test Twilio callbacks locally.

## 7. Create or update an agent row

Insert an `agents` row with at least:

- `id`
- `organization_id`
- `clinic_id`
- `name`
- `config_json`

The `config_json` should include the business-facing runtime data such as:

```json
{
  "name": "Bright Smile AI",
  "clinic_name": "Bright Smile Dental",
  "timezone": "America/New_York",
  "country": "US",
  "phone_region": "US",
  "calendar_id": "clinic@example.com",
  "notification_email": "owner@example.com",
  "working_hours": {
    "mon": [{"start": "09:00", "end": "17:00"}]
  },
  "services": [
    {"name": "Cleaning", "duration": 60}
  ]
}
```

## 8. Publish the agent

Call the publish endpoint:

```powershell
curl -X POST http://localhost:8000/api/agents/<agent-id>/publish
```

The publish flow will:

- reserve a port from `port_registry`
- generate a subdomain
- upload the runtime to Hetzner
- create a Python virtual environment remotely
- install dependencies
- write supervisor config
- write nginx config unless `AGENTS_DOMAIN=localhost`
- buy a Twilio number
- create a LiveKit SIP inbound trunk for that number
- create a LiveKit SIP dispatch rule that targets the agent’s unique `LIVEKIT_AGENT_NAME`
- write the final `.env` to the remote host
- start both supervisor processes

## 9. Verify health

If `AGENTS_DOMAIN=localhost`, use:

```powershell
python scripts/verify_agent.py --health-url http://localhost:<assigned-port>/health --phone-number +15555550100
```

If production DNS is live, use:

```powershell
python scripts/verify_agent.py --health-url https://<subdomain>.agents.yourdomain.com/health --phone-number +15555550100
```

## 10. Make the first live call

After publish returns a Twilio number, call it from a real phone. The runtime path is:

1. Twilio hits `/twilio/voice` on the agent’s webhook server.
2. The webhook returns TwiML that dials LiveKit SIP using the per-agent SIP credentials.
3. LiveKit matches the inbound trunk for that number.
4. LiveKit applies the per-agent dispatch rule and dispatches the unique `LIVEKIT_AGENT_NAME`.
5. `worker_main.py` starts the wrapped agent entrypoint.
6. `agent_wrapper.py` injects `AGENT_ID` and `AGENT_CONFIG` as fallback context.
7. Your existing `agent.py` answers the call and uses Supabase tools as before.

## 11. Restart or unpublish

Restart:

```powershell
curl -X POST http://localhost:8000/api/agents/<agent-id>/restart
```

Restart only bounces the remote Supervisor processes. It does not upload your latest local `agent.py`, `utils/`, or other runtime files.

To push local runtime code changes into an agent that is already live on Hetzner, run:

```powershell
python scripts/redeploy_agent.py --agent-id <agent-id>
```

The redeploy flow re-uploads the runtime bundle, refreshes the remote `.env`, reinstalls `requirements.txt`, restarts the worker/webhook, and waits for `/health` to return `200`.

Unpublish:

```powershell
curl -X POST http://localhost:8000/api/agents/<agent-id>/unpublish
```

## 12. First browser test without Twilio

After publish, trigger the internal test endpoint with the shared secret:

```powershell
curl -X POST http://localhost:<assigned-port>/internal/test -H "X-Internal-Secret: change-me"
```

That returns a LiveKit room name and token so you can verify the worker dispatch path without placing a phone call.
