# Lead Demo Activation: Replace Previous Clinic/Agent Context

This runbook is for the cold-caller CRM that shares this Supabase database with the LiveKit/Telnyx receptionist runtime.

## What Happened

You clicked activate and the row likely changed in Supabase, but when you called `+13103318914` the deployed agent still answered as the older Bella Medspa profile.

The most likely cause is stale deployed runtime config on Hetzner:

- Supabase may point the phone number to the new lead clinic.
- The Hetzner agent process still has an `.env` value called `AGENT_CONFIG`.
- `AGENT_CONFIG` can contain the old `clinic_id`, old business name, old greeting, and old settings.
- The current runtime wrapper checks `AGENT_CONFIG.clinic_id`; if the database lookup returns a different clinic, it can fall back to the old config.

So replacing a previous demo requires two things:

1. Repoint the Supabase runtime rows.
2. Refresh the deployed Hetzner runtime config, or change the runtime so it no longer pins one clinic in `AGENT_CONFIG`.

## Fixed IDs

Use this same existing agent. Do not create a new agent.

```text
Public agent id:
agent-87112821-4661-4dd9-a22e-ba57b48feb17

Supabase UUID agent id:
87112821-4661-4dd9-a22e-ba57b48feb17

Demo phone:
+13103318914
```

## Supabase Tables To Replace

### Must Update

`agents`

- Update the existing row where `id = '87112821-4661-4dd9-a22e-ba57b48feb17'`.
- Set `clinic_id` to the activated lead's generated clinic id.
- Set `organization_id` to the same organization as the lead/profile.
- Keep `status = 'live'`.
- Do not insert a new agent.

`phone_numbers`

- Update the row where `phone_e164 = '+13103318914'`.
- Set `agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17'`.
- Set `clinic_id` to the activated lead clinic id.
- Set `organization_id` to the lead/profile organization id.
- Set `telephony_provider = 'telnyx'`.
- Set `status = 'active'`.

This table is the critical inbound routing table. The runtime first tries to resolve the called number through `phone_numbers`.

`agent_settings`

- Update the row where `agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17'`.
- Replace old Bella Medspa greeting/config with the activated lead's greeting, services, hours, policies, and `industry_type`.
- Make sure `config_json` no longer contains stale Bella-specific values.

`clinics`

- Upsert one clinic row for the activated lead.
- This row's `id` is the `lead_clinic_id` used in `agents.clinic_id` and `phone_numbers.clinic_id`.
- Replace name, website, phone, timezone, address, industry, and working hours with the lead's extracted data.

`knowledge_articles`

- Replace or upsert articles for the activated lead clinic.
- Scope by `clinic_id = lead_clinic_id`.
- Do not leave the new lead clinic with Bella Medspa articles.

### Should Update

`clinic_hours`

- Replace hours for `clinic_id = lead_clinic_id`.

`services`, `service_aliases`, `service_facts`, `faq_chunks`

- Populate these if the tables exist.
- If you use `knowledge_articles` as the source, call `request_clinic_knowledge_sync` after writing the articles/settings so the runtime can rebuild normalized rows.

`lead_demo_profiles`

- For the activated lead, set:
  - `clinic_id = lead_clinic_id`
  - `agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17'`
  - `phone_e164 = '+13103318914'`, if that column exists
  - `status = 'active'`
  - `last_activated_at = now()`

`lead_demo_activations`

- Insert an audit record every time activate is clicked.
- Store the previous `agents.clinic_id` before changing it. This is how you know Bella was replaced by the new clinic.

## Verification SQL

Run this after activation.

```sql
select
  id,
  name,
  organization_id,
  clinic_id,
  status,
  phone_number,
  livekit_agent_name,
  updated_at
from public.agents
where id = '87112821-4661-4dd9-a22e-ba57b48feb17';

select
  id,
  phone_e164,
  organization_id,
  clinic_id,
  agent_id,
  status,
  telephony_provider,
  updated_at
from public.phone_numbers
where phone_e164 = '+13103318914';

select
  id,
  name,
  industry,
  timezone,
  phone,
  website,
  updated_at
from public.clinics
where id = '<LEAD_CLINIC_ID>';

select
  id,
  agent_id,
  greeting_text,
  config_json,
  updated_at
from public.agent_settings
where agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17';

select
  id,
  clinic_id,
  title,
  category,
  active,
  updated_at
from public.knowledge_articles
where clinic_id = '<LEAD_CLINIC_ID>'
order by updated_at desc
limit 20;
```

## Minimal Activation SQL

Use a service-role backend or server-side migration/RPC. Do not run this from frontend code.

```sql
begin;

-- Save this value in your app before the update and pass it into lead_demo_activations.
select clinic_id as previous_clinic_id
from public.agents
where id = '87112821-4661-4dd9-a22e-ba57b48feb17';

update public.agents
set
  clinic_id = '<LEAD_CLINIC_ID>',
  organization_id = '<ORGANIZATION_ID>',
  status = 'live',
  updated_at = now()
where id = '87112821-4661-4dd9-a22e-ba57b48feb17';

update public.phone_numbers
set
  clinic_id = '<LEAD_CLINIC_ID>',
  organization_id = '<ORGANIZATION_ID>',
  agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17',
  telephony_provider = 'telnyx',
  status = 'active',
  updated_at = now()
where phone_e164 = '+13103318914';

update public.agent_settings
set
  organization_id = '<ORGANIZATION_ID>',
  greeting_text = '<NEW_LEAD_GREETING>',
  config_json = '<NEW_LEAD_CONFIG_JSON>'::jsonb,
  updated_at = now()
where agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17';

update public.lead_demo_profiles
set
  clinic_id = '<LEAD_CLINIC_ID>',
  organization_id = '<ORGANIZATION_ID>',
  agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17',
  status = 'active',
  last_activated_at = now(),
  updated_at = now()
where lead_id = '<LEAD_ID>';

insert into public.lead_demo_activations (
  lead_id,
  lead_demo_profile_id,
  organization_id,
  clinic_id,
  agent_id,
  phone_e164,
  activated_by,
  previous_clinic_id
) values (
  '<LEAD_ID>',
  '<LEAD_DEMO_PROFILE_ID>',
  '<ORGANIZATION_ID>',
  '<LEAD_CLINIC_ID>',
  '87112821-4661-4dd9-a22e-ba57b48feb17',
  '+13103318914',
  '<USER_ID>',
  '<PREVIOUS_CLINIC_ID>'
);

select public.request_clinic_knowledge_sync(
  '<ORGANIZATION_ID>'::uuid,
  '<LEAD_CLINIC_ID>'::uuid,
  'lead_demo_activation',
  'Lead demo activated from cold-caller CRM'
);

commit;
```

If `request_clinic_knowledge_sync` does not exist in the target database, skip that call and continue. The core routing still depends on `agents`, `phone_numbers`, `agent_settings`, `clinics`, and `knowledge_articles`.

## Do You Need To Call Hetzner?

Yes, if the live call still answers as Bella Medspa after the Supabase rows are correct.

There are two acceptable approaches.

### Option A: Republish Or Sync Runtime Env After Activation

After updating Supabase, call the deploy/platform API for the existing agent so Hetzner rewrites `/opt/agents/agent-87112821-4661-4dd9-a22e-ba57b48feb17/.env` with the new `AGENT_CONFIG`.

Use whichever route your CRM has access to:

```text
POST <DEPLOY_API_URL>/api/agents/87112821-4661-4dd9-a22e-ba57b48feb17/publish
```

or, if publish is too heavy, implement a small deploy API endpoint that calls `AgentServerManager.sync_agent_env(...)` using the latest `get_agent_with_clinic(...)` data, then restarts:

```text
agent-87112821-4661-4dd9-a22e-ba57b48feb17-worker
agent-87112821-4661-4dd9-a22e-ba57b48feb17-web
```

A plain restart alone is not enough if the `.env` still contains Bella Medspa in `AGENT_CONFIG`.

### Option B: Make Runtime Truly Dynamic

Update this agent runtime so `AGENT_CONFIG` does not pin a single `clinic_id`.

In this repo, the risky behavior is in `agent_wrapper.py`: it compares the database-loaded clinic to `AGENT_CONFIG.clinic_id` and falls back to local config if they differ.

For a shared lead-demo number, the runtime should trust `phone_numbers.phone_e164 + phone_numbers.agent_id` as the source of truth. Then activation can be database-only, and Hetzner only needs to be running.

This is the cleaner long-term fix.

## Prompt To Run In The Cold Caller CRM Directory

Paste this into Codex from the cold-caller CRM repo:

```text
We need to fix lead demo activation so activating a lead fully replaces any previous demo clinic/agent context for the shared LiveKit/Telnyx receptionist number.

Context:
- The CRM shares Supabase with the receptionist runtime.
- Do not create new agents.
- Always reuse existing public agent id: agent-87112821-4661-4dd9-a22e-ba57b48feb17
- UUID for Supabase writes: 87112821-4661-4dd9-a22e-ba57b48feb17
- Shared Telnyx phone number: +13103318914
- Current bug: after activating a new lead, inbound calls still answer as a previous clinic, Bella Medspa.

Please inspect the CRM code paths for the Activate button and implement/fix activation end to end.

Required behavior:
1. Activation must upsert the lead's generated clinic/profile data.
2. Activation must update public.agents where id = 87112821-4661-4dd9-a22e-ba57b48feb17:
   - clinic_id = activated lead clinic id
   - organization_id = activated lead organization id
   - status = live
3. Activation must update public.phone_numbers where phone_e164 = '+13103318914':
   - agent_id = 87112821-4661-4dd9-a22e-ba57b48feb17
   - clinic_id = activated lead clinic id
   - organization_id = activated lead organization id
   - telephony_provider = telnyx
   - status = active
4. Activation must update public.agent_settings where agent_id = 87112821-4661-4dd9-a22e-ba57b48feb17:
   - greeting_text must be for the activated lead, not Bella Medspa
   - config_json must contain the activated lead's industry_type, services, hours, policies, and custom instructions
   - config_json must not preserve stale Bella Medspa business_name, clinic_name, services, or greeting
5. Activation must write/update public.knowledge_articles for the activated lead clinic_id.
6. If these tables exist, also populate/update clinic_hours, services, service_aliases, service_facts, and faq_chunks.
7. If RPC public.request_clinic_knowledge_sync exists, call it with organization_id and lead_clinic_id. If it does not exist, do not fail activation.
8. Activation must update lead_demo_profiles and insert lead_demo_activations, including previous_clinic_id from the agents row before replacement.
9. Add a verification query or backend check after activation that confirms:
   - agents.clinic_id equals the activated lead clinic id
   - phone_numbers.clinic_id equals the activated lead clinic id
   - phone_numbers.agent_id equals 87112821-4661-4dd9-a22e-ba57b48feb17
   - agent_settings.greeting_text/config_json refer to the activated lead and not Bella Medspa
10. Do not expose SUPABASE_SERVICE_ROLE_KEY to frontend code.

Hetzner/deployed runtime requirement:
- After the Supabase transaction succeeds, the live Hetzner runtime may still have stale AGENT_CONFIG for Bella Medspa.
- Check whether this CRM has DEPLOY_API_URL or an existing deploy API client.
- If available, call:
  POST ${DEPLOY_API_URL}/api/agents/87112821-4661-4dd9-a22e-ba57b48feb17/publish
  after activation, or add/use a lighter endpoint that rewrites the agent .env from latest Supabase data and restarts the worker/web supervisor processes.
- A plain restart is not sufficient if it does not rewrite AGENT_CONFIG.
- If no deploy API is available from the CRM, return a clear warning in the activation response:
  "Supabase was updated, but deployed runtime config may still be stale. Republish or sync Hetzner env for agent-87112821-4661-4dd9-a22e-ba57b48feb17."

Important tests:
- Add a test that activation never inserts into agents.
- Add a test that activating lead B after lead A replaces agents.clinic_id, phone_numbers.clinic_id, agent_settings.greeting/config_json, and returns the same existing agent id.
- Add a test or mocked integration path showing the deploy env refresh is called after successful activation, or that the warning is returned when unavailable.

Please make the code changes, run the relevant tests/lint, and summarize the files changed.
```

## Fast Manual Checklist

Before calling the number again:

- `agents.clinic_id` is the new lead clinic id.
- `phone_numbers.phone_e164 = '+13103318914'` points to the same new clinic id.
- `phone_numbers.agent_id` is `87112821-4661-4dd9-a22e-ba57b48feb17`.
- `agent_settings.greeting_text` is not Bella Medspa.
- `agent_settings.config_json` is not Bella Medspa.
- `knowledge_articles` for the new `clinic_id` contain the new lead facts.
- Hetzner `.env` has fresh `AGENT_CONFIG`, or the runtime has been changed to trust database phone routing dynamically.

