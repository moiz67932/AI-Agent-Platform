## Is the platform API running? (your laptop)

`curl http://localhost:8000/health`
Expected: `{"status": "ok"}`

Start it: `python run.py`

Run in background (Windows):
Option 1 - new terminal window that stays open:
`start cmd /k "cd C:\Users\Moiz\Desktop\Agent\Agent && python run.py"`

Option 2 - PM2 (recommended for reliability):
`npm install -g pm2`
`pm2 start "python run.py" --name "agent-platform" --cwd "C:\Users\Moiz\Desktop\Agent\Agent"`
`pm2 save`
`pm2 startup`
`pm2 list`
`pm2 logs agent-platform`

## Is ngrok running?

Check: `curl http://localhost:4040/api/tunnels`
Start: `ngrok http 8000`
The URL shown (`https://xxxx.ngrok.io`) is your Twilio webhook base.
Note: Free ngrok URL changes every restart. Update Twilio webhook each time.
Fix: Get ngrok paid plan ($8/mo) for a static URL, or use your domain.

## Is a deployed agent running on Hetzner?

SSH in: `ssh -i C:/Users/Moiz/Desktop/id_ed25519 root@178.104.70.97`

Check all agent processes:
`supervisorctl status`

Expected output for healthy agent:
`agent-abc123-webhook    RUNNING   pid 1234, uptime 0:05:30`
`agent-abc123-worker     RUNNING   pid 1235, uptime 0:05:29`

If STOPPED or FATAL, restart:
`supervisorctl restart agent-abc123-webhook`
`supervisorctl restart agent-abc123-worker`

Read webhook logs (last 50 lines):
`tail -50 /var/log/agents/agent-abc123-webhook.log`

Read worker logs (live follow):
`tail -f /var/log/agents/agent-abc123-worker.log`

Check nginx:
`nginx -t`
`systemctl status nginx`

Check a specific agent port:
`curl http://localhost:8001/health`

## Did a call go through correctly?

Check Twilio console: `console.twilio.com -> Monitor -> Logs -> Calls`
Check LiveKit dashboard: `cloud.livekit.io -> your project -> Rooms`
Check Supabase: `supabase.com -> your project -> Table Editor -> call_logs`

After a call, these should be updated:
`call_logs`: new row with `status=completed`
`appointments`: new row if appointment was booked
`analytics_daily`: `total_calls` incremented

## Common failures and fixes

### "SSH key not found"

Check `HETZNER_SSH_KEY_PATH` in `.env`
Verify: `python -c "import os; print(os.path.exists('C:/Users/Moiz/Desktop/id_ed25519'))"`
Should print `True`.

### "Port already in use" during deploy

Check stuck ports in Supabase:
`SELECT * FROM port_registry WHERE agent_id IS NOT NULL;`

Free a stuck port manually:
`UPDATE port_registry SET agent_id = NULL, allocated_at = NULL WHERE port = 8001;`

### Twilio webhook 400/403

Signature validation failing.
Check `TWILIO_AUTH_TOKEN` exactly matches Twilio console.
Check the webhook URL in Twilio exactly matches `WEBHOOK_BASE_URL` in agent `.env`.

### Agent answers but wrong persona

The `AGENT_CONFIG` `.env` var on the server is stale.
Re-run publish or SSH in and update `/opt/agents/agent-ID/.env` manually,
then: `supervisorctl restart agent-ID-webhook agent-ID-worker`

### Supabase connection refused

Free tier Supabase projects pause after 1 week of inactivity.
Go to `supabase.com -> your project -> click "Resume project"`.

### Post-call email not received

Check `RESEND_API_KEY` is valid.
Check Resend dashboard for send errors.
Check `post_call_pipeline` logs in `/var/log/agents/agent-ID-webhook.log`

## GitHub workflow - keeping code updated

Daily workflow:
`git add .`
`git commit -m "describe your change"`
`git push origin main`

Update a live agent after code change:
Option 1 - Re-publish (easiest):
`POST http://localhost:8000/api/agents/{id}/unpublish`
`POST http://localhost:8000/api/agents/{id}/publish`

Option 2 - Pull on server (faster):
`ssh root@178.104.70.97`
`cd /opt/platform && git pull`
`cp /opt/platform/agent.py /opt/agents/agent-{id}/agent.py`
`cp /opt/platform/agent_wrapper.py /opt/agents/agent-{id}/agent_wrapper.py`
`supervisorctl restart agent-{id}-webhook agent-{id}-worker`

## Process that must be running for calls to work

On Hetzner server (always on - Supervisor handles this automatically):
`agent-{id}-webhook` (FastAPI, handles Twilio callbacks)
`agent-{id}-worker` (LiveKit worker, handles the actual call)

On your laptop (only needed to publish/manage - NOT needed for calls):
`python run.py`
`ngrok http 8000`

Once an agent is published to Hetzner, calls work 24/7 without
your laptop being on. Supervisor auto-restarts on crash.
