# Agent Platform

Multi-tenant AI voice agent platform. Business owners configure an AI
receptionist, click Publish, and within 60 seconds have a live phone
number that books appointments.

## Architecture

Caller -> Twilio (phone number)
       -> POST /twilio/voice (Hetzner webhook_server.py)
       -> TwiML SIP bridge
       -> LiveKit Cloud (WebRTC room)
       -> agent.py (LiveKit worker on Hetzner)
       -> Supabase (appointments, call logs)
       -> Google Calendar + Resend email (post-call)

Platform API (laptop/Vercel) -> SSH -> Hetzner server
  Manages: deploy, undeploy, port allocation, Twilio provisioning

## Quick Start

See `DEPLOYMENT.md` for full setup.

1. Clone repo and install deps: `pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and fill in all values
3. Apply `database/schema.sql` to Supabase
4. Run: `python scripts/init_port_registry.py`
5. SSH into Hetzner and run: `bash scripts/bootstrap_server.sh`
6. Start platform API: `python run.py`
7. Start ngrok: `ngrok http 8000`
8. Pre-flight check: `python scripts/test_local.py`
9. Publish test agent: `python scripts/publish_test_agent.py`
10. Call the provisioned number

## Key Files

`agent.py` - voice agent (do not modify)
`worker_main.py` - LiveKit worker entry point
`webhook_server.py` - deployed to Hetzner, handles Twilio
`post_call_pipeline.py` - calendar, email, analytics after call
`agent_wrapper.py` - multi-tenant config injection
`main.py` - platform management API
`agent_platform/` - deploy engine, Twilio, utils

## Environment Variables

See `.env.example` for all required variables.
