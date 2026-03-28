# Changes

This document summarizes everything implemented in this session for the multi-tenant AI voice agent platform, how the new architecture works, what files were added or changed, and what still needs end-to-end validation.

## Goal of this session

The target was to build the backend/runtime foundation for a platform where:

1. A business owner configures an AI receptionist.
2. They click Publish.
3. The platform deploys a dedicated runtime for that tenant.
4. The platform provisions a phone number.
5. Calls route from Twilio to LiveKit to the correct dedicated worker.
6. The existing production-grade `agent.py` handles the conversation.
7. Post-call data flows into call logs, analytics, appointments, calendar, and email.

The main constraint was to preserve the structure of the existing `agent.py` and avoid rewriting its core conversation logic.

## High-level result

The codebase now has a Python-based multi-tenant platform layer that adds:

- a database schema for agent deployment state, ports, call logs, and daily analytics
- an async database access layer using `asyncpg`
- an SSH deployment manager for per-agent runtime deployment to Hetzner
- a Twilio provisioning layer
- LiveKit SIP trunk and dispatch-rule provisioning per agent
- a FastAPI webhook server for deployed runtimes
- a post-call processing pipeline
- a thin agent wrapper that injects per-tenant runtime config into the existing agent
- FastAPI routes for publish, unpublish, restart, logs, analytics, calls, and appointments
- operational docs for deployment and testing
- focused tests for the new wrapper and helper layer

## Most important architectural decisions

### 1. The core agent was not rewritten

The existing `agent.py` remains the main voice logic.

Instead of changing the agent deeply, I added [agent_wrapper.py](/c:/Users/Moiz/Desktop/Agent/Agent/agent_wrapper.py), which:

- reads `AGENT_ID` and `AGENT_CONFIG` from env
- sets `LIVEKIT_AGENT_NAME` from tenant config
- sets a fallback `DEFAULT_TEST_NUMBER`
- patches `fetch_clinic_context_optimized()` at runtime
- merges database-loaded context with per-agent local config
- falls back fully to env-based tenant context if DB lookup is missing or mismatched

This keeps the existing SIP-number-based behavior intact while making each deployed agent runtime tenant-aware.

### 2. Each tenant gets its own explicit LiveKit dispatch identity

The deployment/provisioning flow now assigns each tenant its own `LIVEKIT_AGENT_NAME`.

That means:

- the deployed `worker_main.py` registers with a unique agent name
- LiveKit SIP dispatch rules can explicitly target the correct tenant worker
- you avoid the old shared-worker problem where all calls hit one common dispatch identity

### 3. Twilio routing uses the supported SIP path into LiveKit

The webhook server does not use Twilio Media Streams for this path.

Instead, `/twilio/voice` returns TwiML that uses:

- `<Dial><Sip>...`

This is important because:

- it matches LiveKit’s supported telephony path
- it preserves SIP metadata like called number and caller number
- your existing `agent.py` already expects that metadata
- it works cleanly with LiveKit SIP trunks and SIP dispatch rules

### 4. A per-agent LiveKit inbound trunk and dispatch rule are created

When a Twilio number is provisioned, the platform also creates:

- a LiveKit inbound SIP trunk for that phone number
- a SIP dispatch rule that targets that agent’s unique `LIVEKIT_AGENT_NAME`

That gives deterministic routing:

Twilio number -> LiveKit SIP trunk -> LiveKit dispatch rule -> correct worker

## Files added

### Database

[database/schema.sql](/c:/Users/Moiz/Desktop/Agent/Agent/database/schema.sql)

Added a platform schema for:

- `agents`
- `port_registry`
- `call_logs`
- `appointments`
- `analytics_daily`

Important details:

- `port_registry` supports the per-agent port model
- `agents` now stores deployment state and telephony routing info
- `call_logs` captures Twilio-call lifecycle state for the platform layer
- `appointments` was extended in a way that tries to stay compatible with your existing Supabase schema
- update triggers were added for `updated_at`

[database/db.py](/c:/Users/Moiz/Desktop/Agent/Agent/database/db.py)

Added a full async DB helper layer with:

- global asyncpg pool init/close
- transaction context manager
- atomic `get_next_free_port()` using `SELECT ... FOR UPDATE SKIP LOCKED`
- agent reads/updates
- call log create/read/update
- appointment create/update
- analytics daily upsert
- paginated calls and appointments queries

### Scripts

[scripts/init_port_registry.py](/c:/Users/Moiz/Desktop/Agent/Agent/scripts/init_port_registry.py)

Seeds ports `8001-8500` into `port_registry`.

[scripts/verify_agent.py](/c:/Users/Moiz/Desktop/Agent/Agent/scripts/verify_agent.py)

CLI utility that polls `/health` until the deployed agent is live.

### Platform helper layer

[platform/utils.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/utils.py)

Added:

- `slugify()`
- `generate_subdomain()`
- `mask_secret()`

These are used by publish/deploy/provisioning flows.

[platform/server_manager.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/server_manager.py)

Added the SSH/SFTP deployment manager.

Main features:

- Paramiko-based SSH connection management
- retry logic with `tenacity`
- remote directory creation
- runtime bundle upload
- `.env` rendering and upload
- per-agent Supervisor config generation
- per-agent nginx config generation
- remote venv creation and dependency install
- Supervisor reread/update/restart
- nginx reload for real-domain deployments
- `/health` polling after deploy
- remove, restart, status, and log-tail operations

This file is the main deployment engine for Hetzner.

[platform/twilio_provisioner.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/twilio_provisioner.py)

Added the Twilio provisioning layer.

Main features:

- search available Twilio numbers
- purchase a number
- configure Twilio webhook URLs
- release numbers
- update existing webhooks

It also provisions LiveKit telephony resources:

- `SIPInboundTrunk`
- `SIPDispatchRule`

per agent.

That means the Twilio provisioner is not only buying numbers; it is also wiring the number into LiveKit so calls reach the correct worker.

### Runtime side

[webhook_server.py](/c:/Users/Moiz/Desktop/Agent/Agent/webhook_server.py)

Added the per-agent deployed FastAPI runtime server.

Endpoints:

- `GET /health`
- `POST /twilio/voice`
- `POST /twilio/status`
- `POST /internal/test`

Behavior:

- reads `.env`
- validates Twilio signatures
- inserts/updates `call_logs`
- returns TwiML SIP bridge for inbound calls
- triggers post-call processing when Twilio reports call completion
- exposes an internal explicit-dispatch browser test route

[post_call_pipeline.py](/c:/Users/Moiz/Desktop/Agent/Agent/post_call_pipeline.py)

Added the post-call pipeline with isolated failure boundaries.

Step 1:

- loads transcript from `call_logs` or `call_transcripts`
- sends transcript to OpenAI `gpt-4o-mini`
- extracts:
  - caller name
  - caller phone
  - service requested
  - appointment datetime
  - whether an appointment was booked
  - short summary

Step 2:

- updates `call_logs`
- inserts appointment if applicable
- upserts `analytics_daily`

Step 3:

- creates a Google Calendar event if appointment + calendar config exist

Step 4:

- sends a Resend notification email
- marks `confirmation_sent`

Each step is inside its own `try/except`, so failure in one downstream integration does not prevent the others.

[agent_wrapper.py](/c:/Users/Moiz/Desktop/Agent/Agent/agent_wrapper.py)

This is the key compatibility layer.

It:

- loads tenant config from env
- sets the runtime agent name
- creates a tenant fallback context
- merges DB context with env context
- overrides the clinic-context fetch used by `agent.py`
- delegates to the real `agent.entrypoint()`

### Platform API routes

[platform/routes/agents.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/routes/agents.py)

Added the main platform router.

Endpoints:

- `POST /api/agents/{agent_id}/publish`
- `POST /api/agents/{agent_id}/unpublish`
- `POST /api/agents/{agent_id}/restart`
- `GET /api/agents/{agent_id}/logs`
- `GET /api/agents/{agent_id}/analytics`
- `GET /api/agents/{agent_id}/calls`
- `GET /api/agents/{agent_id}/appointments`

Publish behavior:

1. fetches the agent row
2. reserves a free port atomically
3. generates subdomain
4. marks the agent as deploying
5. deploys the runtime to the server
6. provisions Twilio + LiveKit routing
7. syncs final env values back to the remote host
8. marks the agent live

Rollback behavior:

- if deployment fails, it cleans up remote resources when possible
- if telephony provisioning fails, it releases resources when possible
- it releases the reserved port
- it stores the failure message on the agent row

### Documentation and env

[requirements.txt](/c:/Users/Moiz/Desktop/Agent/Agent/requirements.txt)

Replaced with a pinned dependency set that includes the new infra layer:

- `asyncpg`
- `paramiko`
- `twilio`
- `python-multipart`
- `tenacity`
- pinned versions for the existing voice stack

[`.env.example`](/c:/Users/Moiz/Desktop/Agent/Agent/.env.example)

Added a complete environment template covering:

- Hetzner
- database
- Supabase
- LiveKit
- Twilio
- OpenAI
- Resend
- Google service account JSON
- internal platform secret
- per-agent runtime values

[DEPLOYMENT.md](/c:/Users/Moiz/Desktop/Agent/Agent/DEPLOYMENT.md)

Rewritten with a zero-to-first-live-call deployment flow.

[TESTING.md](/c:/Users/Moiz/Desktop/Agent/Agent/TESTING.md)

Added practical testing guidance for:

- localhost + ngrok
- Twilio live call testing
- DB verification
- calendar/email verification
- supervisor log inspection
- common failure modes

### Tests

[tests/test_platform_utils.py](/c:/Users/Moiz/Desktop/Agent/Agent/tests/test_platform_utils.py)

Added tests for:

- stable subdomain generation
- secret masking

[tests/test_agent_wrapper.py](/c:/Users/Moiz/Desktop/Agent/Agent/tests/test_agent_wrapper.py)

Added tests for:

- env loading into runtime identity
- fallback tenant context construction
- nested config merge behavior

## Existing files changed

[worker_main.py](/c:/Users/Moiz/Desktop/Agent/Agent/worker_main.py)

This file needed a small but critical runtime change.

What changed:

- now loads `.env`
- now uses `WORKER_PORT` instead of always forcing `8080`
- now imports the wrapper entrypoint instead of importing `agent.entrypoint` directly
- now registers `@server.rtc_session(agent_name=get_livekit_agent_name())`

Why this matters:

- without this, multiple deployed workers on one server would conflict on port `8080`
- without this, each runtime would still use one shared dispatch identity

[config.py](/c:/Users/Moiz/Desktop/Agent/Agent/config.py)

Changed to load `.env` before `.env.local`.

Why this matters:

- remote runtimes deployed by the platform use `.env`
- local development can still keep using `.env.local`

## How the platform works now

### Publish flow

When `POST /api/agents/{agent_id}/publish` is called:

1. The router loads the agent row.
2. It reserves the next free port atomically from `port_registry`.
3. It generates a unique subdomain.
4. It writes deployment state to the `agents` row.
5. It starts two async tasks in parallel:
   - deploy runtime to Hetzner
   - provision Twilio number + LiveKit SIP routing
6. The deploy task:
   - creates `/opt/agents/agent-{id}/`
   - uploads runtime files
   - writes `.env`
   - creates venv
   - installs dependencies
   - writes Supervisor config
   - optionally writes nginx config
   - restarts services
   - polls `/health`
7. The provisioning task:
   - buys a Twilio number
   - creates a LiveKit SIP inbound trunk for that number
   - creates a LiveKit SIP dispatch rule pointing at that tenant’s unique `LIVEKIT_AGENT_NAME`
   - stores telephony IDs and SIP credentials on the agent row
8. The platform re-syncs the final env to the runtime so it has phone number and SIP credentials.
9. The router marks the agent as `live`.

### Inbound call flow

Once live, the call path is:

1. Caller dials the Twilio number.
2. Twilio calls `POST /twilio/voice` on the tenant webhook server.
3. The webhook validates the Twilio signature.
4. The webhook inserts or updates a `call_logs` row.
5. The webhook returns TwiML using `<Dial><Sip>` to the tenant’s LiveKit SIP route.
6. Twilio bridges the call into LiveKit SIP.
7. LiveKit matches the number to the per-agent inbound trunk.
8. LiveKit applies the dispatch rule for that trunk.
9. LiveKit dispatches the unique tenant worker by `LIVEKIT_AGENT_NAME`.
10. `worker_main.py` runs the wrapped entrypoint.
11. `agent_wrapper.py` injects `AGENT_ID` and `AGENT_CONFIG` into context loading.
12. The existing `agent.py` handles the call.

### Tenant context loading

The new wrapper makes context resolution work like this:

1. Try the normal database-based called-number lookup.
2. If DB lookup succeeds and matches the tenant, merge it with env-based tenant config.
3. If DB lookup fails, use env-based fallback tenant context.
4. If DB lookup resolves to a different tenant than the runtime’s `AGENT_ID` or `clinic_id`, use fallback tenant context instead.

This protects against accidental cross-tenant context bleed.

### Post-call flow

When Twilio later calls `/twilio/status` with `CallStatus=completed`:

1. The runtime updates `call_logs`.
2. It starts `post_call_pipeline()` as a background task.
3. The pipeline:
   - extracts structured outcome data from transcript
   - updates summary/transcript
   - creates appointment if applicable
   - upserts daily analytics
   - optionally creates Google Calendar event
   - optionally sends Resend email

## What desired functionalities are now covered

The following desired platform capabilities were integrated in this session:

### Deployment and runtime management

- per-tenant runtime directory creation
- remote environment generation
- remote dependency installation
- supervisor process management
- nginx config generation for domain mode
- health polling after deploy
- restart and remove flows
- log tailing and process status

### Port and subdomain allocation

- atomic port reservation
- release on teardown or publish failure
- deterministic unique subdomain generation

### Telephony provisioning

- search and buy Twilio phone number
- set Twilio voice and status webhooks
- update webhooks later if needed
- release phone number on unpublish

### LiveKit telephony routing

- per-agent explicit `LIVEKIT_AGENT_NAME`
- per-agent SIP inbound trunk
- per-agent SIP dispatch rule
- deterministic dispatch to the intended worker

### Agent runtime multi-tenancy

- env-driven `AGENT_ID`
- env-driven `AGENT_CONFIG`
- per-runtime context injection
- fallback context if DB lookup is slow or missing
- dispatch identity isolation

### Post-call business actions

- structured transcript extraction
- call summary persistence
- appointment creation
- analytics rollup
- Google Calendar event creation
- Resend email notification

### Operational support

- `.env.example`
- deploy guide
- testing guide
- verification script

## Verification completed

The following checks were completed in this session:

### Syntax verification

Passed:

```powershell
python -m py_compile database\db.py scripts\init_port_registry.py platform\utils.py platform\server_manager.py platform\twilio_provisioner.py webhook_server.py post_call_pipeline.py agent_wrapper.py platform\routes\agents.py scripts\verify_agent.py worker_main.py config.py
```

### Focused tests

Passed:

```powershell
pytest tests\test_platform_utils.py tests\test_agent_wrapper.py
```

Results:

- 5 tests passed

## Known gaps and important caveats

This is important so expectations are clear.

### 1. Full end-to-end publish was not executed in this session

I did not run a real publish against:

- Hetzner
- Twilio
- LiveKit Cloud
- Supabase
- Google Calendar
- Resend

So the code is implemented and syntax-checked, but external-service integration still needs a real test.

### 2. New infra packages are not currently installed in this environment

The repo’s local environment did not have some new dependencies installed at the time of verification, including:

- `asyncpg`
- `paramiko`
- `twilio`

That means the new runtime/control-plane code compiled statically, but I did not fully import-and-run every external integration path locally.

### 3. Twilio local testing needs a public route to the tenant webhook port

If `AGENTS_DOMAIN=localhost`, the platform API can be tunneled with ngrok, but real Twilio inbound call tests also need a public route to the deployed tenant webhook port, not just `localhost:8000`.

### 4. The platform route module uses file-path dynamic loading

Because the folder is named `platform`, importing `platform.*` directly would collide with Python’s standard library `platform` module.

To avoid that, [platform/routes/agents.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/routes/agents.py), [platform/server_manager.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/server_manager.py), and [platform/twilio_provisioner.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/twilio_provisioner.py) use local file-path loading for sibling modules.

This works, but it is a compatibility workaround, not the prettiest long-term package structure.

### 5. The current webhook call path uses SIP bridge, not custom manual AgentDispatch on inbound voice webhook

This was intentional.

Reason:

- it aligns with current LiveKit SIP docs
- it preserves SIP metadata
- it cleanly supports per-agent explicit routing
- it is a better fit for your current `agent.py`

So if you were expecting the webhook to create a room and return `<Connect><Stream>`, that is not what was implemented. The supported SIP/TwiML bridge path is what was integrated.

## What happens now in the codebase

### Before this session

- one sophisticated voice agent existed
- no Python multi-tenant platform backend existed
- no deploy manager existed
- no new webhook server existed
- no post-call pipeline existed
- no per-tenant dispatch identity existed
- no per-agent Hetzner deployment workflow existed

### After this session

The repo now has the first full Python platform skeleton for:

- publishing a tenant
- deploying a tenant
- assigning tenant runtime identity
- provisioning phone + SIP + dispatch routing
- accepting inbound calls on a tenant-specific webhook server
- dispatching the correct worker
- enriching call outcomes after completion

## Recommended next steps

The next highest-value actions are:

1. Install the new dependencies from [requirements.txt](/c:/Users/Moiz/Desktop/Agent/Agent/requirements.txt).
2. Apply [database/schema.sql](/c:/Users/Moiz/Desktop/Agent/Agent/database/schema.sql) to Supabase.
3. Seed `port_registry` with [scripts/init_port_registry.py](/c:/Users/Moiz/Desktop/Agent/Agent/scripts/init_port_registry.py).
4. Wire a small FastAPI app that includes [platform/routes/agents.py](/c:/Users/Moiz/Desktop/Agent/Agent/platform/routes/agents.py).
5. Run one local publish using `AGENTS_DOMAIN=localhost`.
6. Verify the generated remote `.env`, Supervisor config, and health endpoint.
7. Run one real Twilio call to validate:
   - Twilio -> webhook
   - webhook -> SIP bridge
   - SIP trunk match
   - dispatch rule match
   - correct worker dispatch
   - post-call pipeline side effects

## Short summary

This session built the missing multi-tenant platform foundation around your existing LiveKit receptionist:

- database layer
- deployment engine
- Twilio + LiveKit provisioning
- runtime webhook server
- post-call pipeline
- tenant-aware wrapper
- platform API routes
- docs and tests

The core agent logic stays yours. The new code makes it deployable as isolated tenant runtimes with explicit call routing and post-call business workflows.
