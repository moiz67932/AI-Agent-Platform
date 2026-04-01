# Twilio + LiveKit + Hetzner Implementation Notes

## Purpose

This document explains how the current PSTN voice path is implemented in this repository, how Twilio, LiveKit, Supabase, and the Hetzner server are connected, which files own each part of the flow, what the current account limitations are, and what is still failing in the current test setup.

This is written as an engineering handoff and debugging reference, not just a high-level summary.

## Current Environment

This platform currently uses:

- A local FastAPI management API running from the laptop via `python run.py`
- A Hetzner Ubuntu server that runs per-agent webhook and worker processes
- A Supabase database that stores agent state, ports, phone metadata, and deployment metadata
- A Twilio trial account with an already-owned number: `+13103410536`
- A LiveKit Cloud project used for SIP ingress and agent dispatch

Important current constraint:

- Twilio is still on a trial account, so inbound calls play the Twilio trial message before the actual webhook logic runs
- The current test flow reuses an existing Twilio number instead of buying a new one
- The current unresolved runtime issue is in the Twilio-to-LiveKit SIP handoff after the Twilio trial prompt

## Two Different Planes In This System

This system has two separate planes:

### 1. Management Plane

This is the part that publishes and unpublishes agents.

It is:

- laptop `run.py` / `main.py`
- FastAPI routes in `agent_platform/routes/agents.py`
- SSH deploy logic in `agent_platform/server_manager.py`
- Twilio / LiveKit provisioning logic in `agent_platform/twilio_provisioner.py`
- Supabase state in `database/db.py`

This plane decides:

- which agent row is being published
- which port to allocate
- which files to upload
- which Twilio number is used
- which LiveKit trunk and dispatch rule are created
- which supervisor processes run on the server

### 2. Call Runtime Plane

This is the part that actually handles the phone call.

It is:

- Twilio inbound phone number
- Hetzner webhook server in `webhook_server.py`
- LiveKit SIP trunk + dispatch rule
- LiveKit worker runtime in `worker_main.py`
- agent logic in `agent.py`
- multi-tenant wrapper in `agent_wrapper.py`

This plane decides:

- how Twilio receives an inbound PSTN call
- how Twilio gets TwiML from the webhook server
- how Twilio creates the SIP leg into LiveKit
- how LiveKit dispatches the call to a room
- how the worker joins and runs the voice agent

## End-To-End Call Flow

The intended inbound phone-call flow is:

1. A caller dials `+13103410536`
2. Twilio receives the PSTN call
3. Because the account is trial, Twilio plays the trial disclaimer first
4. After the keypad press, Twilio sends `POST /twilio/voice` to the deployed Hetzner webhook
5. `webhook_server.py` returns TwiML containing `<Dial><Sip>...</Sip></Dial>`
6. Twilio creates a child SIP call to the LiveKit SIP host
7. LiveKit SIP matches the inbound trunk
8. LiveKit SIP finds a dispatch rule
9. LiveKit creates a SIP participant in a room
10. The LiveKit agent worker joins the room
11. `agent.py` answers and runs the conversation
12. `post_call_pipeline.py` runs after the call

The important distinction is:

- Twilio does not talk directly to `worker_main.py`
- Twilio first talks to `webhook_server.py`
- `webhook_server.py` tells Twilio to create a SIP call into LiveKit
- LiveKit then dispatches the call to the worker

## How An Agent Spins Up On Hetzner

The platform does not require the full repository to be cloned on the server before publish.

Instead, publish works like this:

1. The platform API receives `POST /api/agents/{agent_id}/publish`
2. `agent_platform/routes/agents.py` loads the agent row from Supabase
3. A free port is selected from `port_registry`
4. `AgentServerManager.deploy_agent(...)` in `agent_platform/server_manager.py` runs
5. It SSHes into Hetzner
6. It creates `/opt/agents/agent-<agent-id>`
7. It uploads the runtime files needed for that single agent
8. It writes a per-agent `.env`
9. It creates a Python virtualenv on Hetzner
10. It installs `requirements.txt`
11. It writes Supervisor config for:
    - the webhook process on `800x`
    - the worker process on `900x`
12. It restarts Supervisor programs
13. It polls `http://<hetzner-ip>:<port>/health`

Per deployed agent, the server normally runs:

- one webhook process
- one worker process

Even when no one is calling, those processes still consume some RAM and a little CPU because:

- Python remains resident
- plugins are loaded
- the worker remains registered with LiveKit

## Current Runtime Ports

The current convention is:

- `800x` for per-agent webhook HTTP
- `900x` for per-agent worker health / internal worker process HTTP

Example:

- `8001` webhook
- `9001` worker

## Twilio Implementation

### Twilio Number Strategy

Because the account is still trial, the current test flow does not try to buy a new number.

Instead:

- `scripts/publish_test_agent.py` creates or reuses a test agent row
- the agent config contains:
  - `twilio_existing_number`
  - `twilio_release_on_unpublish = false`
- `agent_platform/twilio_provisioner.py` detects that and reuses `+13103410536`

This means:

- the same Twilio number is repointed to the newest test deployment
- unpublish does not release that number from the Twilio account

### Twilio Webhook Configuration

When the number is reused, the provisioner updates the Twilio number to point to:

- `voice_url = http://<hetzner-ip>:<port>/twilio/voice`
- `status_callback = http://<hetzner-ip>:<port>/twilio/status`

It also clears Twilio voice routing overrides that would block webhook-based routing:

- `trunk_sid`
- `voice_application_sid`

This was important because if those remain set, Twilio ignores `voice_url`.

### TwiML Returned By The Webhook

`webhook_server.py` builds TwiML similar to:

```xml
<Response>
  <Dial answerOnBridge="true" callerId="+13103410536" action=".../twilio/dial-action" method="POST">
    <Sip
      username="<sip-auth-username>"
      password="<sip-auth-password>"
      statusCallback=".../twilio/sip-status"
      statusCallbackEvent="initiated ringing answered completed"
      statusCallbackMethod="POST"
    >
      sip:+13103410536@<livekit-sip-host>;transport=tcp
    </Sip>
  </Dial>
</Response>
```

That means:

- Twilio is instructed to create a SIP child call
- the SIP child call is authenticated with username/password
- the SIP destination host is LiveKit Cloud
- the user part of the SIP URI is the phone number

### Current Twilio Trial Limitations

The Twilio trial account affects calls in these ways:

- Twilio plays the trial disclaimer before your real call flow
- callers may need to press a key before the real webhook flow continues
- trial behavior adds extra PSTN friction compared to a paid account

This is not the root cause of the current failure, but it is part of the call experience.

## LiveKit Implementation

### Inbound SIP Trunk

The current platform creates a LiveKit inbound SIP trunk from `agent_platform/twilio_provisioner.py`.

Current design for the test flow:

- create a fresh inbound trunk on each publish
- delete the trunk on unpublish
- set:
  - `numbers = []`
  - `auth_username = <generated username>`
  - `auth_password = <generated password>`

Why `numbers = []`:

- LiveKit docs allow empty `numbers` if auth is used
- this was changed to avoid brittle number matching on Twilio-generated SIP INVITEs

### Dispatch Rule

The current platform creates a fresh LiveKit dispatch rule on each publish and deletes it on unpublish.

Current design:

- rule type: `dispatch_rule_individual`
- room prefix: `call-`
- no trunk restriction in the latest implementation

This was intentionally changed to match LiveKit’s Twilio Voice quickstart more closely.

Earlier, the rule was being restricted to a specific `trunk_id`.
That restriction was removed because it was a plausible cause of LiveKit rejecting the SIP handoff.

### Agent Dispatch

The dispatch rule includes room configuration so the named LiveKit worker can be dispatched to the room.

The worker name is generated and stored as:

- `livekit_agent_name`

That worker is started by `worker_main.py`.

## Why Local `worker_main.py` Felt Simpler

When you ran `python worker_main.py` locally or on Cloud Run, you were mostly proving:

- the LiveKit worker boots
- the agent code runs
- the worker can receive jobs from LiveKit

The current platform adds extra telephony infrastructure:

- Twilio number
- Twilio webhook
- TwiML
- SIP bridging
- LiveKit inbound SIP trunk
- LiveKit dispatch rule
- per-agent deployment lifecycle

So this platform is more complete for multi-tenant telephony, but it has more possible failure points than just running the worker.

## Current Proven Working Pieces

These parts are currently known to work:

- the local platform API can publish successfully
- the Hetzner deploy works over SSH
- the per-agent runtime directory is created
- the Hetzner virtualenv is created
- dependencies are installed
- the webhook process starts
- the worker process starts
- the worker registers with LiveKit
- the webhook `/health` endpoint can return `200`
- the Twilio number points to the Hetzner webhook
- Twilio reaches `POST /twilio/voice`
- Twilio reaches `POST /twilio/status`
- Twilio reaches `POST /twilio/sip-status`
- the current inbound LiveKit trunk exists
- the current dispatch rule exists

## Current Failing Piece

The current failing piece is still the SIP bridge between Twilio and LiveKit after the trial prompt.

The verified failure is:

- Twilio creates the child SIP call
- LiveKit responds with SIP `404`
- Twilio maps that into a failed child call
- the parent call then hears the fallback message: “We could not connect your call right now...”

## Verified Current Failure Evidence

From the Hetzner webhook log:

- `SIP bridge failed status=failed sip_response_code=404`

From Twilio child-call event records:

- child call direction: `outbound-dial`
- child call destination:
  - `sip:+13103410536@<livekit-sip-host>;transport=tcp`
- Twilio event:
  - `error_code = 13224`
  - `error_message = invalid phone number`
  - `sip_response_code = 404`

Engineering interpretation:

- Twilio is doing what the webhook told it to do
- the failure is not “Twilio never hit the webhook”
- the failure is not “the worker never started”
- the failure is specifically “LiveKit did not accept the SIP INVITE”

## Most Important Files In This Flow

### Core Telephony / Provisioning

- `agent_platform/twilio_provisioner.py`
  - reuses or buys Twilio number
  - updates Twilio webhooks
  - creates/deletes LiveKit trunk
  - creates/deletes LiveKit dispatch rule
  - stores SIP auth credentials on the agent row

- `webhook_server.py`
  - serves `/health`
  - handles `/twilio/voice`
  - handles `/twilio/status`
  - handles `/twilio/dial-action`
  - handles `/twilio/sip-status`
  - builds the TwiML SIP bridge
  - contains the current detailed Twilio logging

### Deploy / Server Runtime

- `agent_platform/server_manager.py`
  - builds per-agent `.env`
  - uploads files to Hetzner
  - creates virtualenv
  - installs dependencies
  - writes supervisor config
  - starts webhook and worker
  - polls agent health

### Platform API

- `agent_platform/routes/agents.py`
  - publish endpoint
  - unpublish endpoint
  - restart endpoint
  - analytics/log/status routes
  - orchestration between DB, deploy, and telephony provisioning

### Agent Runtime

- `worker_main.py`
  - LiveKit worker entrypoint
  - registers worker identity
  - boots the worker process

- `agent.py`
  - production voice agent logic
  - actual conversation behavior

- `agent_wrapper.py`
  - multi-tenant configuration wrapper for the agent

### Database / Scripts

- `database/db.py`
  - DB access layer

- `scripts/publish_test_agent.py`
  - creates or reuses the test agent row
  - unpublishes older shared-number test rows
  - invokes the platform publish endpoint
  - verifies `/health`

## Current Known Non-Blocking Errors

These are real issues, but they are not the current call-connection blocker:

- `RESEND_API_KEY` missing on deployed runtime
- `EMAIL_FROM` missing on deployed runtime

Effect:

- post-call email step fails
- the voice call should still be able to connect even with these missing

## Potential Error Sources Still Remaining

The following are still possible causes of the current SIP `404`:

1. Twilio-to-LiveKit SIP authentication mismatch
   - TwiML includes username/password
   - LiveKit trunk has username/password
   - but the challenge/response behavior may still not match what LiveKit expects

2. LiveKit SIP URI acceptance rules
   - the SIP URI is currently:
     - `sip:+13103410536@<livekit-sip-host>;transport=tcp`
   - LiveKit may still be rejecting the called identity even though the trunk allows any number

3. Twilio trial behavior around SIP child calls
   - less likely than the SIP-side issue
   - but trial accounts can behave differently enough to complicate testing

4. Dispatch rule / trunk matching nuance inside LiveKit Cloud
   - less likely after the latest change
   - but still possible

5. LiveKit project telephony-side configuration outside this repo
   - dashboard-level project config
   - SIP host behavior
   - region behavior

## Why The Current Publish Can Say “Live” Even When Calls Still Fail

Publish currently means:

- files deployed
- processes running
- health endpoint working
- Twilio number configured
- LiveKit trunk and dispatch rule created

It does **not** guarantee that a real PSTN call has already succeeded end-to-end.

So “Agent is LIVE!” currently means:

- deploy/runtime health is good

It does **not** yet mean:

- PSTN caller reached the actual agent successfully

## What Has Been Changed So Far To Improve Debugging

The following debugging improvements were already added:

- detailed Twilio event logging in `webhook_server.py`
- explicit logging for:
  - `voice_webhook`
  - `call_status`
  - `sip_status`
  - `dial_action`
- explicit logging of `DialSipResponseCode`
- explicit spoken fallback if the SIP bridge fails instead of a silent drop
- test coverage around TwiML generation
- test coverage around Twilio-number reuse and LiveKit-resource recreation

## Recommended Next Debugging Steps

If the SIP failure continues, the best next steps are:

1. Inspect Twilio child call event data again after each test call
2. Inspect Hetzner webhook log for the exact `sip_response_code`
3. Compare the current implementation against a minimal TwiML Bin implementation from the LiveKit docs
4. Consider testing a stripped-down TwiML response with fewer `<Dial>` attributes to isolate Twilio-side behavior
5. If needed, temporarily move to a paid Twilio account to eliminate trial-account call flow friction

## Summary

The current system is not failing because the server cannot deploy, because the worker cannot boot, or because the webhook is dead.

The current unresolved bug is narrower:

- the publish flow works
- the webhook is reachable
- Twilio is reaching the webhook
- the worker is running
- but the Twilio-created SIP child leg into LiveKit is still being rejected with `404`

That makes this a telephony-bridge problem between:

- Twilio `<Dial><Sip>`
- LiveKit inbound SIP acceptance
- LiveKit dispatch matching

not a generic application boot failure.
