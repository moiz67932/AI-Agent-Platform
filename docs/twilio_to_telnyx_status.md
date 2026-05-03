# Twilio to Telnyx Migration Status

This file describes the current state of the repository's telephony migration from Twilio to Telnyx.

## Current Status

The migration is in progress, not fully complete yet.

What is already in place:

- A new Telnyx-first Python telephony path has been added for agent publish, inbound voice webhooks, outbound demo calls, and provider-neutral database storage.
- The deployed agent webhook server now has a Telnyx voice endpoint at `/telnyx/voice`.
- The platform publish flow now provisions a Telnyx number/application path instead of the old Twilio provisioner in the Python deployment layer.
- The schema and DB helpers have started moving away from Twilio-specific fields such as `twilio_phone_sid` and `twilio_call_sid`.

What is not finished yet:

- Twilio still exists in the Node backend, React frontend, setup docs, test files, helper scripts, and dependency manifests.
- `post_call_pipeline.py` still has Twilio-shaped naming and needs to be finished against the new provider-neutral call IDs.
- The new Telnyx path needs a full end-to-end validation pass after the remaining cleanup is done.
- The Telnyx MCP setup was started, but it still needs a final safe configuration pass and successful in-tool verification.

## What Has Already Been Done

### 1. Telnyx service layer added

New service modules now exist under `services/`:

- `services/telnyx_client.py`
- `services/telnyx_number_service.py`
- `services/telnyx_voice.py`
- `services/telnyx_webhook_verifier.py`

These cover:

- Telnyx API config loading from environment
- async REST calls with retry handling
- number lookup, ordering, and attachment to a Telnyx voice connection
- inbound call answer and transfer commands
- outbound call creation
- webhook signature verification

### 2. Python publish flow moved toward Telnyx

The old Python publish path in [agent_platform/routes/agents.py](/mnt/c/Users/Moiz/Desktop/Agent/Agent/agent_platform/routes/agents.py) now uses `TelnyxProvisioner` instead of `TwilioProvisioner`.

That file now also includes:

- provider-neutral runtime config fields like `telephony_provider`, `external_number_id`, `voice_connection_id`, and `provider_config_json`
- outbound demo call endpoint: `POST /api/agents/{agent_id}/outbound-call`
- publish response fields for the Telnyx number and connection metadata

### 3. Telnyx number provisioning path added

[agent_platform/telnyx_provisioner.py](/mnt/c/Users/Moiz/Desktop/Agent/Agent/agent_platform/telnyx_provisioner.py) now handles:

- reusing an assigned number when possible
- ordering a new Telnyx number when needed
- creating LiveKit SIP routing
- creating or updating a Telnyx Call Control Application
- attaching the number to that Telnyx application
- saving provider-neutral metadata back into the database

### 4. Webhook server moved from TwiML to Telnyx events

[webhook_server.py](/mnt/c/Users/Moiz/Desktop/Agent/Agent/webhook_server.py) has been rewritten around a Telnyx webhook model.

The current intent is:

- receive JSON voice webhooks at `/telnyx/voice`
- verify `telnyx-signature-ed25519` and `telnyx-timestamp`
- store webhook events idempotently
- answer inbound calls on `call.initiated`
- transfer answered calls into LiveKit SIP on `call.answered`
- update provider-neutral `call_logs`
- trigger post-call processing on `call.hangup`

### 5. DB storage is becoming provider-neutral

[database/schema.sql](/mnt/c/Users/Moiz/Desktop/Agent/Agent/database/schema.sql) and [database/db.py](/mnt/c/Users/Moiz/Desktop/Agent/Agent/database/db.py) now include the new Telnyx-oriented/provider-neutral fields and helpers:

- `telephony_provider`
- `external_number_id`
- `voice_connection_id`
- `provider_config_json`
- `provider_call_id`
- `provider_call_leg_id`
- `provider_call_session_id`
- `telephony_webhook_events` for retry-safe event processing

## What Still Needs Polishing

These areas still contain Twilio and should be treated as remaining migration work.

### High priority

- `post_call_pipeline.py`
  - still references Twilio-shaped call ID wording
- `requirements.txt`
  - still includes the Python Twilio SDK
- `agent_platform/backend/package.json`
  - still includes the Node Twilio SDK
- `tests/test_webhook_server.py`
  - still expects TwiML behavior
- `tests/test_twilio_provisioner.py`
  - still tests the old Twilio provisioner

### Dashboard / API still Twilio-branded

- `agent_platform/backend/src/services/twilioService.js`
- `agent_platform/backend/src/routes/numbers.js`
- `agent_platform/backend/src/routes/integrations.js`
- `agent_platform/backend/src/routes/onboarding.js`
- `agent_platform/frontend/src/pages/PhoneNumbers.tsx`
- `agent_platform/frontend/src/pages/Integrations.tsx`
- `agent_platform/frontend/src/pages/Onboarding.tsx`
- `agent_platform/frontend/src/pages/Landing.tsx`
- `agent_platform/frontend/src/types/index.ts`

These still need:

- Telnyx naming
- Telnyx number workflows
- removal of Twilio env assumptions
- cleanup of Twilio UI copy and onboarding text

### Docs and scripts still Twilio-based

- `README.md`
- `DEPLOYMENT.md`
- `TESTING.md`
- `MONITORING.md`
- `FEATURES.md`
- `CHANGES.md`
- `TWILIO_IMPLEMENTATION.md`
- `scripts/test_local.py`
- `scripts/check_imports.py`
- `scripts/publish_test_agent.py`
- `scripts/bootstrap_server.sh`

### MCP / config cleanup still needed

- The repo already has a Telnyx MCP server config path in `.codex/config.toml`.
- That setup still needs a safe secret-handling pass and a final working handshake check from Codex.
- The MCP work should be considered partially prepared, not production-ready yet.

## Workflow Now

The intended workflow after the current Python-side migration is:

1. Publish an agent.
2. The platform resolves an existing assigned Telnyx number or orders a new one.
3. The platform creates LiveKit SIP routing for that exact number.
4. The platform creates or updates a Telnyx Call Control Application.
5. The Telnyx number is attached to that Call Control Application using `connection_id`.
6. The application's webhook is pointed at the deployed agent runtime endpoint: `https://<agent-webhook-base>/telnyx/voice`.
7. When someone calls that same public number, Telnyx sends a webhook to `/telnyx/voice`.
8. The webhook server verifies the signature, answers the call, and transfers it to LiveKit SIP.
9. LiveKit dispatches the call to the correct AI agent worker.
10. When the platform places an outbound demo call, it uses that same Telnyx number as the caller ID.
11. If the lead calls back, the same number routes back through the inbound Telnyx webhook flow to the AI agent.

## How The Number Is Connected

The current intended connection path is:

`Telnyx Number -> Telnyx Call Control Application -> /telnyx/voice webhook -> transfer to LiveKit SIP -> LiveKit dispatch rule -> agent runtime`

In practical terms:

- The public phone number lives in Telnyx.
- That number is attached to a Telnyx Call Control Application.
- The application points to this repo's deployed webhook server.
- The webhook server then transfers the call to `sip:+E164@<LIVEKIT_SIP_HOST>` using the per-agent SIP auth generated during publish.
- LiveKit matches the trunk/dispatch rule and hands the call to the correct worker.

This is what enables the same exact number to do both jobs:

- outbound demo call source number
- inbound callback number for the AI agent

## How To Check That Everything Is Working

## 1. Configuration checks

Before testing, confirm these are populated in the relevant runtime environment:

- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_OUTBOUND_VOICE_PROFILE_ID`
- `TELNYX_WEBHOOK_API_VERSION`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_SIP_HOST`
- `DATABASE_URL`

Also confirm the published agent receives runtime values for:

- `phone_number`
- `voice_connection_id`
- `sip_auth_username`
- `sip_auth_password`

## 2. Publish flow check

Run the platform API and publish an agent. The publish response should include:

- `phone_number`
- `external_number_id`
- `voice_connection_id`
- `livekit_trunk_id`
- `livekit_dispatch_rule_id`

If any of those are missing, the number is not fully wired yet.

Example:

```bash
curl -X POST http://localhost:8000/api/agents/<AGENT_ID>/publish
```

## 3. Inbound call check

Call the assigned Telnyx number from a real phone.

Expected behavior:

- Telnyx delivers a webhook to `/telnyx/voice`
- the webhook server accepts the signature
- the call is answered
- the call is transferred into LiveKit SIP
- the AI agent picks up the call

What to verify:

- webhook server logs show `call.initiated`, `call.answered`, and later `call.hangup`
- `call_logs` contains a row with `telephony_provider = 'telnyx'`
- `telephony_webhook_events` contains the inbound events

## 4. Outbound call check

Trigger an outbound demo call:

```bash
curl -X POST http://localhost:8000/api/agents/<AGENT_ID>/outbound-call \
  -H "Content-Type: application/json" \
  -d '{"to_number":"+15551234567"}'
```

Expected behavior:

- the call is created through Telnyx
- the destination phone sees the agent's public Telnyx number as caller ID
- once answered, the call bridges into the same AI agent flow

## 5. Callback-on-the-same-number check

After receiving the outbound demo call:

1. Reject or finish the call.
2. Call back the same displayed number.
3. Confirm the callback reaches the AI agent through the inbound flow.

This is the most important product-level validation because it proves the public demo number is handling both outbound and inbound correctly.

## 6. Local service commands

Useful local commands from the current repo shape:

```bash
pip install -r requirements.txt
uvicorn webhook_server:app --host 0.0.0.0 --port 8001
cd agent_platform/backend && npm run dev
cd agent_platform/frontend && npm run dev
```

## 7. Sanity checks worth running

Python compile check:

```bash
python -m py_compile webhook_server.py agent_platform/routes/agents.py agent_platform/telnyx_provisioner.py services/telnyx_client.py services/telnyx_number_service.py services/telnyx_voice.py services/telnyx_webhook_verifier.py database/db.py
```

Current tests still need migration, so treat test results carefully until the Twilio test suite is rewritten for Telnyx.

## Recommended Next Cleanup Pass

To finish the migration cleanly, the next pass should do this in order:

1. Finish provider-neutral updates in `post_call_pipeline.py`.
2. Replace the remaining Twilio tests with Telnyx tests.
3. Migrate the Node backend number/integration routes to Telnyx.
4. Update the React UI copy and flows from Twilio to Telnyx.
5. Remove Twilio packages from Python and Node manifests.
6. Rewrite setup and deployment docs to be Telnyx-first.
7. Re-run end-to-end publish, inbound, outbound, and callback verification.

## Bottom Line

The repo is no longer purely Twilio-first. The Python deployment/runtime path has already been moved substantially toward a Telnyx-first architecture.

But the migration is not finished yet. The telephony core is mid-conversion, while the dashboard, docs, tests, and dependency cleanup still need another polishing pass before this can be called a full Twilio removal.
