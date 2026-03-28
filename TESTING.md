# Testing

## Local testing with ngrok and no real server

1. Set `AGENTS_DOMAIN=localhost` in `.env`.
2. Start the FastAPI platform API on `localhost:8000`.
3. Start `ngrok http 8000`.
4. Publish an agent through `POST /api/agents/{agent_id}/publish`.
5. Use the returned assigned port to hit:

```powershell
curl http://localhost:<assigned-port>/health
```

6. Trigger the built-in browser test path:

```powershell
curl -X POST http://localhost:<assigned-port>/internal/test -H "X-Internal-Secret: <INTERNAL_SECRET>"
```

That verifies:

- the worker process is running
- the explicit LiveKit agent dispatch name is correct
- the agent wrapper is loading `AGENT_CONFIG`

For a real inbound Twilio test while `AGENTS_DOMAIN=localhost`, you also need a public tunnel or reverse proxy to the assigned agent webhook port, not just the platform API on port `8000`.

## Making a real Twilio test call

1. Publish the agent so the platform buys a Twilio number and creates the LiveKit SIP routing.
2. Wait for the publish response to show `status=live`.
3. Call the returned `phone_number`.
4. Watch the webhook server logs and worker logs at the same time.

Expected path:

- Twilio sends `POST /twilio/voice`
- the webhook returns TwiML with `<Dial><Sip>`
- Twilio bridges the call to LiveKit SIP
- LiveKit dispatches the unique `LIVEKIT_AGENT_NAME`
- the worker joins and your existing `agent.py` handles the conversation

## Verifying database writes after a call

Check the new platform tables:

```sql
select * from call_logs order by created_at desc limit 20;
select * from analytics_daily order by date desc;
```

If the transcript exists, the post-call pipeline should also create or update:

```sql
select * from appointments order by created_at desc limit 20;
```

Your existing agent will continue writing to the original Supabase tables it already uses, including `call_sessions` and its appointment flow.

## Verifying the calendar event

If the transcript extraction marks `appointment_booked=true` and the agent config includes `calendar_id`, confirm:

```sql
select calendar_event_id, calendar_event_url
from appointments
where agent_id = '<agent-id>'
order by created_at desc
limit 5;
```

If `calendar_event_id` is null, inspect the webhook server stderr log for Google API failures.

## Verifying the email

The post-call pipeline sends email through Resend to `agent_config["notification_email"]`.

Successful sends will set:

```sql
select confirmation_sent
from appointments
where agent_id = '<agent-id>'
order by created_at desc
limit 5;
```

If `confirmation_sent` stays false, inspect the webhook server stderr log for Resend API failures.

## Checking deployed supervisor logs

Use the platform endpoint:

```powershell
curl "http://localhost:8000/api/agents/<agent-id>/logs?lines=100"
```

Or SSH to the server and inspect:

```bash
tail -n 100 /var/log/agents/agent-<agent-id>-worker.out.log
tail -n 100 /var/log/agents/agent-<agent-id>-worker.err.log
tail -n 100 /var/log/agents/agent-<agent-id>-web.out.log
tail -n 100 /var/log/agents/agent-<agent-id>-web.err.log
```

## Common failure modes

- `publish` fails before deployment completes: check SSH connectivity, remote package install permissions, and whether the server has `python3-venv`, `nginx`, and `supervisor`.
- Twilio number provisions but calls do not reach the worker: check `LIVEKIT_SIP_HOST`, the generated inbound trunk, and the LiveKit SIP dispatch rule tied to the purchased phone number.
- The worker starts but answers with the wrong business context: verify `AGENT_ID`, `AGENT_CONFIG`, and the `livekit_agent_name` written into the remote `.env`.
- Multiple agents collide on startup: verify `PORT` and `WORKER_PORT` are unique per deployment.
- `call_logs` update but appointments do not appear: the post-call pipeline only creates an appointment when transcript extraction returns a booked appointment and a concrete ISO datetime.
- Calendar or email side effects fail while the call still completes: this is expected isolation behavior; inspect the webhook stderr log for the specific downstream error.
