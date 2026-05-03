# Lead Website Scraping to Demo Agent Data Automation

This document is for the separate cold-caller CRM project. The automation should not run inside this agent runtime repository.

Goal:

- You have one Telnyx number.
- The same number is used for outbound cold calls and inbound demo calls.
- You already have a CRM lead list with website URLs.
- For each lead, you want to scrape the lead's website, extract clinic/business knowledge, write it to Supabase in the same format the receptionist agent already understands, and return the same existing agent id:

```text
agent-87112821-4661-4dd9-a22e-ba57b48feb17
```

Database ID format note:

- Public/deployed agent id: `agent-87112821-4661-4dd9-a22e-ba57b48feb17`
- UUID form for Supabase UUID columns: `87112821-4661-4dd9-a22e-ba57b48feb17`

If your live Supabase `agents.id` column is `uuid`, always write the UUID form into UUID columns and return the prefixed public id to the CRM UI.

Important design decision:

- Do not create a new agent per lead.
- Create or update a clinic/data profile per lead.
- Then repoint the existing agent and phone number to that lead's clinic profile for the demo.

In this codebase, the runtime lookup path is:

```text
Telnyx number -> phone_numbers row -> clinic_id + agent_id -> agents + agent_settings + clinics + knowledge_articles
```

So the demo switch is mainly:

```text
lead website data -> clinics / agent_settings / knowledge_articles / normalized knowledge tables
then
agents.clinic_id = lead_clinic_id
phone_numbers.clinic_id = lead_clinic_id
phone_numbers.agent_id = existing_demo_agent_id
```

## Recommended Scraper

Use Playwright in the CRM backend. It is free, reliable, handles JavaScript-rendered websites, and can run Chromium headless in a background job. Puppeteer is also fine, but Playwright has better cross-browser APIs and built-in waiting behavior.

Official references:

- Playwright library docs: https://playwright.dev/docs/next/library
- Playwright GitHub: https://github.com/microsoft/playwright
- Puppeteer overview: https://learn.microsoft.com/en-us/microsoft-edge/puppeteer/

Use a polite crawler:

- Same-domain only.
- Max pages per lead, for example 20 to 40.
- Max depth, for example 2.
- Respect robots.txt if you want this to be safer for broad use.
- Add a timeout per page.
- Block images, video, fonts, and analytics requests.
- Rate-limit per domain.
- Store the source URL for every extracted fact.

## Existing Runtime Tables You Should Populate

These are the tables this agent platform already expects.

### `clinics`

One row per lead demo clinic/business profile.

Required or useful fields:

```text
id
organization_id
name
industry
timezone
phone
email
address_line1 or address
address_line2
city
state
zip or zip_code
country
website
working_hours
```

Use `industry = 'dental'` by default for dental/clinic leads. If your lead list includes med spas, use `med_spa` when detected.

### `agents`

Do not insert a new row. Update the existing row:

```text
id = 87112821-4661-4dd9-a22e-ba57b48feb17
clinic_id = lead_clinic_id
organization_id = lead_organization_id
status = live
default_language = en-US
```

### `agent_settings`

One row tied to the existing agent id. Update it each time you activate a lead demo.

Useful fields:

```text
organization_id
agent_id
greeting_text
persona_tone
voice_id
config_json
```

Recommended `config_json` shape:

```json
{
  "industry_type": "dental",
  "working_hours": {
    "mon": [{ "start": "09:00", "end": "17:00" }],
    "tue": [{ "start": "09:00", "end": "17:00" }],
    "wed": [{ "start": "09:00", "end": "17:00" }],
    "thu": [{ "start": "09:00", "end": "17:00" }],
    "fri": [{ "start": "09:00", "end": "17:00" }],
    "sat": [],
    "sun": []
  },
  "treatment_durations": {
    "Dental Cleaning": 60,
    "Teeth Whitening": 60
  },
  "services": [
    {
      "name": "Dental Cleaning",
      "duration": 60,
      "price": null,
      "enabled": true
    }
  ],
  "collect_insurance": true,
  "agent_role": "receptionist",
  "custom_instructions": "Answer as the receptionist for this clinic using only the configured clinic data. If information is unknown, say you can have the office confirm it."
}
```

### `phone_numbers`

This table is critical because inbound calls are resolved from the called number.

Update the one row for your Telnyx number:

```text
agent_id = 87112821-4661-4dd9-a22e-ba57b48feb17
clinic_id = lead_clinic_id
organization_id = lead_organization_id
phone_e164 = your Telnyx number in +1 format
status = active
telephony_provider = telnyx
```

The runtime prefers the `phone_numbers` row that matches both the called number and `AGENT_ID`, so this is the safest place to switch the active demo clinic.

### `knowledge_articles`

This is the baseline knowledge table. Always populate it.

Use only columns that exist in the current platform:

```text
organization_id
clinic_id
title
body
category
active
```

Suggested article categories:

```text
Services
Pricing
Hours
Location
Insurance
Payment
Staff
Policy
FAQ
About
Imported
```

Good article examples:

```text
Title: Services Overview
Category: Services
Body: This clinic offers dental cleaning, emergency exams, teeth whitening, crowns, fillings, Invisalign, and pediatric dentistry. Source: https://example.com/services

Title: Service Pricing
Category: Pricing
Body: Teeth whitening is listed as starting at $299. Other prices are not published. Source: https://example.com/pricing

Title: Clinic Hours
Category: Hours
Body: Monday: 8:00 AM to 5:00 PM. Tuesday: 8:00 AM to 5:00 PM. Saturday: Closed. Source: https://example.com/contact
```

### `clinic_hours`

Populate this when you have structured hours. It improves scheduling and deterministic answers.

Recommended row shape:

```text
organization_id
clinic_id
weekday
open_time
close_time
closed
```

Use the weekday convention already used by your Supabase migration. If you are unsure whether Sunday is 0 or Monday is 0, copy the helper logic from `agent_platform/backend/src/lib/clinicConfig.js`.

### Normalized Runtime Knowledge Tables

If migration `agent_platform/migrations/007_clinic_knowledge_runtime.sql` is applied in Supabase, also use these tables:

```text
services
service_aliases
service_facts
faq_chunks
clinic_knowledge_sync_jobs
```

You have two choices:

1. Recommended: write `clinics`, `agent_settings`, `knowledge_articles`, and `clinic_hours`, then call the Supabase RPC `request_clinic_knowledge_sync`. The existing worker can normalize into `services`, `service_facts`, and `faq_chunks`.
2. Faster for the CRM: directly populate normalized tables from the scraper output, then also keep `knowledge_articles` as the human-readable source of truth.

For `services`:

```text
organization_id
clinic_id
canonical_name
display_name
normalized_name
active
bookable
default_duration_minutes
sort_order
source_ref
```

For `service_aliases`:

```text
organization_id
clinic_id
service_id
alias
normalized_alias
```

For `service_facts`, use these `fact_type` values because the runtime maps them directly:

```text
price
duration
description
```

Recommended `service_facts` shape:

```text
organization_id
clinic_id
service_id
fact_type
answer_text
structured_value_json
priority
source_ref
content_hash
active
```

Example:

```json
{
  "fact_type": "price",
  "answer_text": "Teeth Whitening starts at $299.",
  "structured_value_json": {
    "price_text": "Starts at $299",
    "currency": "USD",
    "min_cents": 29900
  },
  "priority": 10,
  "source_ref": "https://example.com/pricing"
}
```

For `faq_chunks`:

```text
organization_id
clinic_id
service_id
category
fact_type
title
chunk_text
content_hash
source_article_id
source_ref
chunk_index
active
```

Embeddings are optional. If you do not want extra cost, leave `embedding` null. Full-text search still works through `search_vector`.

## Additional CRM-Side Tables

Add these tables in the cold-caller CRM Supabase project or in the same Supabase project if the CRM shares the database.

If you already have a `leads` table, do not replace it. Link these tables to your existing lead id.

### `lead_demo_profiles`

Stores the mapping between CRM lead and generated clinic profile.

```sql
CREATE TABLE IF NOT EXISTS public.lead_demo_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  clinic_id uuid,
  agent_id uuid NOT NULL,
  source_website_url text NOT NULL,
  business_name text,
  status text NOT NULL DEFAULT 'draft',
  extraction_confidence numeric(5, 2),
  extracted_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_scraped_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_demo_profiles_status_check
    CHECK (status IN ('draft', 'scraping', 'ready', 'active', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_demo_profiles_lead_uidx
  ON public.lead_demo_profiles (lead_id);

CREATE INDEX IF NOT EXISTS lead_demo_profiles_agent_idx
  ON public.lead_demo_profiles (agent_id);
```

### `lead_website_scrape_jobs`

Tracks crawl status.

```sql
CREATE TABLE IF NOT EXISTS public.lead_website_scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  lead_demo_profile_id uuid REFERENCES public.lead_demo_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  root_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pages_discovered integer NOT NULL DEFAULT 0,
  pages_scraped integer NOT NULL DEFAULT 0,
  pages_failed integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_website_scrape_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS lead_website_scrape_jobs_lead_idx
  ON public.lead_website_scrape_jobs (lead_id, created_at DESC);
```

### `lead_website_pages`

Stores every page that was crawled and the cleaned text used for extraction.

```sql
CREATE TABLE IF NOT EXISTS public.lead_website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id uuid NOT NULL REFERENCES public.lead_website_scrape_jobs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  url text NOT NULL,
  canonical_url text,
  page_type text,
  http_status integer,
  title text,
  meta_description text,
  cleaned_text text,
  json_ld jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_website_pages_job_url_uidx
  ON public.lead_website_pages (scrape_job_id, url);

CREATE INDEX IF NOT EXISTS lead_website_pages_lead_idx
  ON public.lead_website_pages (lead_id);
```

### `lead_demo_activations`

Keeps an audit trail of which lead was active on the shared demo agent.

```sql
CREATE TABLE IF NOT EXISTS public.lead_demo_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  lead_demo_profile_id uuid REFERENCES public.lead_demo_profiles(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  activated_by uuid,
  previous_clinic_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_demo_activations_agent_created_idx
  ON public.lead_demo_activations (agent_id, created_at DESC);
```

## Extracted Profile JSON Contract

The scraper should normalize all website findings into this object before writing Supabase runtime rows.

```json
{
  "clinic": {
    "name": "Bright Smile Dental",
    "industry": "dental",
    "website": "https://example.com",
    "phone": "+13105550123",
    "email": "hello@example.com",
    "timezone": "America/New_York",
    "address": {
      "line1": "123 Main St",
      "line2": "",
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "country": "US"
    }
  },
  "hours": {
    "monday": { "open": true, "start": "09:00", "end": "17:00" },
    "tuesday": { "open": true, "start": "09:00", "end": "17:00" },
    "wednesday": { "open": true, "start": "09:00", "end": "17:00" },
    "thursday": { "open": true, "start": "09:00", "end": "17:00" },
    "friday": { "open": true, "start": "09:00", "end": "17:00" },
    "saturday": { "open": false, "start": null, "end": null },
    "sunday": { "open": false, "start": null, "end": null }
  },
  "services": [
    {
      "name": "Teeth Whitening",
      "aliases": ["Whitening", "Professional Whitening"],
      "description": "Cosmetic whitening treatment for brighter teeth.",
      "duration_minutes": 60,
      "price_text": "Starts at $299",
      "price_min_cents": 29900,
      "bookable": true,
      "source_url": "https://example.com/services/whitening",
      "confidence": 0.82
    }
  ],
  "faqs": [
    {
      "question": "Do you accept insurance?",
      "answer": "The clinic accepts most PPO dental plans.",
      "category": "Insurance",
      "source_url": "https://example.com/faq",
      "confidence": 0.7
    }
  ],
  "policies": [
    {
      "title": "Cancellation Policy",
      "body": "Please call 24 hours in advance to reschedule.",
      "source_url": "https://example.com/patient-info"
    }
  ],
  "payments": ["Cash", "Credit card", "CareCredit"],
  "insurance": ["PPO plans", "Delta Dental"],
  "staff": [
    {
      "name": "Dr. Jane Smith",
      "role": "Dentist",
      "bio": "General and cosmetic dentist."
    }
  ],
  "source_pages": [
    "https://example.com",
    "https://example.com/services",
    "https://example.com/contact"
  ]
}
```

## Crawl and Extraction Flow

1. User clicks `Create Agent` beside `Open Website` in the CRM.
2. CRM backend creates or reuses `lead_demo_profiles`.
3. Backend creates `lead_website_scrape_jobs` with `status = pending`.
4. Background worker runs Playwright crawler.
5. Crawler discovers likely useful same-domain URLs:
   - `/services`
   - `/pricing`
   - `/faq`
   - `/about`
   - `/contact`
   - `/insurance`
   - `/patients`
   - service detail pages
6. Crawler stores each page in `lead_website_pages`.
7. Extractor builds `extracted_profile_json`.
8. Writer upserts:
   - `clinics`
   - `agent_settings`
   - `clinic_hours`
   - `knowledge_articles`
   - optionally `services`, `service_aliases`, `service_facts`, `faq_chunks`
9. Writer calls `request_clinic_knowledge_sync` if available.
10. Activation step points the existing demo agent and Telnyx phone row to the lead clinic.
11. API returns:

```json
{
  "agent_id": "agent-87112821-4661-4dd9-a22e-ba57b48feb17",
  "agent_db_id": "87112821-4661-4dd9-a22e-ba57b48feb17",
  "clinic_id": "generated-lead-clinic-id",
  "lead_demo_profile_id": "generated-profile-id",
  "status": "active"
}
```

## Minimal Activation SQL

Use your backend service role key or a secured server-side RPC. Never run this from the browser with an anon key.

```sql
BEGIN;

UPDATE public.agents
SET
  clinic_id = :lead_clinic_id,
  organization_id = :organization_id,
  status = 'live',
  updated_at = now()
WHERE id = '87112821-4661-4dd9-a22e-ba57b48feb17';

UPDATE public.phone_numbers
SET
  clinic_id = :lead_clinic_id,
  organization_id = :organization_id,
  agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17',
  telephony_provider = 'telnyx',
  status = 'active'
WHERE phone_e164 = :telnyx_phone_e164;

UPDATE public.lead_demo_profiles
SET
  clinic_id = :lead_clinic_id,
  agent_id = '87112821-4661-4dd9-a22e-ba57b48feb17',
  organization_id = :organization_id,
  status = 'active',
  last_activated_at = now(),
  updated_at = now()
WHERE lead_id = :lead_id;

INSERT INTO public.lead_demo_activations (
  lead_id,
  lead_demo_profile_id,
  organization_id,
  clinic_id,
  agent_id,
  phone_e164,
  activated_by,
  previous_clinic_id
) VALUES (
  :lead_id,
  :lead_demo_profile_id,
  :organization_id,
  :lead_clinic_id,
  '87112821-4661-4dd9-a22e-ba57b48feb17',
  :telnyx_phone_e164,
  :user_id,
  :previous_clinic_id
);

COMMIT;
```

Then request normalized knowledge sync:

```sql
SELECT public.request_clinic_knowledge_sync(
  :organization_id,
  :lead_clinic_id,
  'lead_website_scraper',
  'Lead demo profile activated'
);
```

If the RPC does not exist in your Supabase project, apply `agent_platform/migrations/007_clinic_knowledge_runtime.sql` from this repo or skip the RPC and directly populate normalized tables.

## Suggested API Endpoints in the CRM

### `POST /api/leads/:leadId/demo-agent/prepare`

Starts scraping and extraction. Does not activate the shared number yet unless `activate` is true.

Request:

```json
{
  "website_url": "https://lead-clinic.com",
  "activate": false,
  "force_rescrape": false
}
```

Response:

```json
{
  "job_id": "uuid",
  "lead_demo_profile_id": "uuid",
  "status": "scraping"
}
```

### `GET /api/leads/:leadId/demo-agent/status`

Returns scrape and profile readiness.

Response:

```json
{
  "lead_id": "uuid",
  "profile_status": "ready",
  "scrape_status": "completed",
  "clinic_id": "uuid",
  "agent_id": "agent-87112821-4661-4dd9-a22e-ba57b48feb17",
  "summary": {
    "business_name": "Bright Smile Dental",
    "services_count": 12,
    "faqs_count": 9,
    "has_hours": true,
    "has_pricing": true
  }
}
```

### `POST /api/leads/:leadId/demo-agent/activate`

Switches the existing agent and phone number to this lead's clinic profile.

Response:

```json
{
  "agent_id": "agent-87112821-4661-4dd9-a22e-ba57b48feb17",
  "clinic_id": "uuid",
  "phone_e164": "+13105550123",
  "status": "active"
}
```

## UI Flow in Cold-Caller CRM

In the lead table row, keep:

- `Open Website`
- `Create Agent` when no profile exists
- `Preparing...` while scraping
- `Activate Demo` when profile is ready but not active
- `Active Demo` when this lead is currently powering the shared agent

After activation, show:

```text
Agent ready: agent-87112821-4661-4dd9-a22e-ba57b48feb17
Inbound demo number now answers as: <lead clinic name>
```

Because you only have one number and one agent, only one lead can be active for inbound demo at a time.

## Environment Variables

CRM backend:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

EXISTING_DEMO_AGENT_ID=agent-87112821-4661-4dd9-a22e-ba57b48feb17
EXISTING_DEMO_AGENT_DB_ID=87112821-4661-4dd9-a22e-ba57b48feb17
DEMO_TELNYX_PHONE_E164=+1XXXXXXXXXX

SCRAPER_USER_AGENT=Mozilla/5.0 DemoClinicBot/1.0
SCRAPER_MAX_PAGES=30
SCRAPER_MAX_DEPTH=2
SCRAPER_CONCURRENCY=2
SCRAPER_PAGE_TIMEOUT_MS=20000
SCRAPER_RESPECT_ROBOTS_TXT=true

EXTRACTION_MODE=free
OPENAI_API_KEY=
EXTRACTION_MODEL=gpt-4o-mini
```

Use `EXTRACTION_MODE=free` for deterministic extraction only:

- JSON-LD parsing
- visible text extraction
- regex for phones, emails, prices, hours
- keyword-based service and FAQ grouping

Use `EXTRACTION_MODE=openai` only if you want higher-quality normalization. Scraping is still free, but LLM extraction costs money.

Agent runtime or deployment environment:

```text
AGENT_ID=agent-87112821-4661-4dd9-a22e-ba57b48feb17
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_AGENT_NAME=
LIVEKIT_SIP_HOST=
TELNYX_API_KEY=
TELNYX_PUBLIC_KEY=
TELNYX_OUTBOUND_VOICE_PROFILE_ID=
TELNYX_WEBHOOK_API_VERSION=2
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
```

Frontend:

```text
VITE_API_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, Telnyx API keys, or LiveKit secrets in the frontend.

## Practical Extraction Rules

### Services

Find services from:

- Navigation labels
- Service listing cards
- Headings under service pages
- Schema.org `Service`, `MedicalBusiness`, `Dentist`, `LocalBusiness`
- URL paths such as `/services/teeth-whitening`

Normalize service names:

```text
teeth whitening -> Teeth Whitening
dental cleaning -> Dental Cleaning
invisalign -> Invisalign
root canal therapy -> Root Canal Therapy
```

### Pricing

Extract prices, but mark uncertainty clearly:

```text
$299
starting at $299
from $99
$99 - $199
call for pricing
not published
```

Do not invent prices. If no price is found, write:

```text
Pricing is not published on the website. The office can confirm current pricing.
```

### Hours

Normalize to 24-hour `HH:mm`. If hours are missing, use nulls and write a FAQ saying hours were not published.

### FAQs

Extract real FAQ question-answer pairs where possible. Also create synthetic FAQ articles from high-confidence facts:

- accepted insurance
- payment methods
- cancellation policy
- emergency appointments
- parking
- location
- new patient information

### Confidence

Store confidence in `extracted_profile_json`. Do not push very low-confidence facts to normalized runtime tables. Put low-confidence data in an `Imported` knowledge article instead.

## Testing Checklist

Test with at least three lead websites:

- A simple static clinic website.
- A JavaScript-heavy website.
- A website with sparse information.

For each test:

- Scrape completes.
- `lead_website_pages` contains cleaned text.
- `lead_demo_profiles.extracted_profile_json` is populated.
- `clinics` row has correct name, website, and hours.
- `knowledge_articles` has useful articles.
- `agent_settings.config_json.services` has service names.
- `agents.clinic_id` points to the selected lead clinic after activation.
- `phone_numbers.clinic_id` points to the selected lead clinic.
- Calling the Telnyx number makes the agent greet as the selected lead clinic.
- Asking "What services do you offer?" uses the lead's scraped services.
- Asking "How much is teeth whitening?" never invents missing pricing.

## Full Prompt for Codex in the Cold-Caller CRM Project

Use this prompt in the CRM repo.

```md
You are Codex working in my cold-caller CRM project.

I need you to build a lead website to demo-agent data automation. This CRM already has leads with website URLs. I have one existing LiveKit/Telnyx receptionist agent in another Supabase-backed system, and I do NOT want to create new agents. I want to reuse this exact agent id:

agent-87112821-4661-4dd9-a22e-ba57b48feb17

If the Supabase `agents.id` column is a UUID, use `87112821-4661-4dd9-a22e-ba57b48feb17` for all UUID database writes and return `agent-87112821-4661-4dd9-a22e-ba57b48feb17` to the UI.

The same Telnyx number is used for outbound cold calling and inbound demo calls. For demos, the CRM should scrape a lead website, turn it into clinic/receptionist knowledge, save it into Supabase runtime tables, and then repoint the existing agent and phone number to that lead's generated clinic profile.

Important behavior:

- Do not create a new agent row.
- Create or update a clinic/data profile for the lead.
- Populate `clinics`, `agent_settings`, `clinic_hours`, `knowledge_articles`, and, if available, normalized tables `services`, `service_aliases`, `service_facts`, `faq_chunks`.
- Update `agents.clinic_id` for the existing agent.
- Update `phone_numbers.clinic_id` and `phone_numbers.agent_id` for my Telnyx number.
- Return the same existing `agent_id`.
- Add a CRM UI button beside `Open Website`: `Create Agent`.
- If scraping is already done, the button should become `Activate Demo`.
- Only one lead can be active at a time because there is only one number and one agent.

Use Playwright for free website scraping. Puppeteer is acceptable only if the repo already uses it. Prefer Playwright otherwise.

Create the following CRM-side tables or migrations if they do not already exist:

1. `lead_demo_profiles`
   - `id uuid primary key default gen_random_uuid()`
   - `lead_id uuid not null`
   - `organization_id uuid not null`
   - `clinic_id uuid`
   - `agent_id uuid not null`
   - `source_website_url text not null`
   - `business_name text`
   - `status text not null default 'draft'`
   - `extraction_confidence numeric(5,2)`
   - `extracted_profile_json jsonb not null default '{}'::jsonb`
   - `last_scraped_at timestamptz`
   - `last_activated_at timestamptz`
   - timestamps
   - unique index on `lead_id`

2. `lead_website_scrape_jobs`
   - `id uuid primary key default gen_random_uuid()`
   - `lead_id uuid not null`
   - `lead_demo_profile_id uuid`
   - `organization_id uuid not null`
   - `root_url text not null`
   - `status text not null default 'pending'`
   - `pages_discovered int default 0`
   - `pages_scraped int default 0`
   - `pages_failed int default 0`
   - `error text`
   - `started_at timestamptz`
   - `completed_at timestamptz`
   - timestamps

3. `lead_website_pages`
   - `id uuid primary key default gen_random_uuid()`
   - `scrape_job_id uuid not null`
   - `lead_id uuid not null`
   - `organization_id uuid not null`
   - `url text not null`
   - `canonical_url text`
   - `page_type text`
   - `http_status int`
   - `title text`
   - `meta_description text`
   - `cleaned_text text`
   - `json_ld jsonb default '[]'::jsonb`
   - `extracted_json jsonb default '{}'::jsonb`
   - `content_hash text not null`
   - `scraped_at timestamptz default now()`

4. `lead_demo_activations`
   - `id uuid primary key default gen_random_uuid()`
   - `lead_id uuid not null`
   - `lead_demo_profile_id uuid`
   - `organization_id uuid not null`
   - `clinic_id uuid not null`
   - `agent_id uuid not null`
   - `phone_e164 text not null`
   - `activated_by uuid`
   - `previous_clinic_id uuid`
   - `created_at timestamptz default now()`

Expected extracted profile JSON:

{
  "clinic": {
    "name": "",
    "industry": "dental",
    "website": "",
    "phone": "",
    "email": "",
    "timezone": "America/New_York",
    "address": {
      "line1": "",
      "line2": "",
      "city": "",
      "state": "",
      "zip": "",
      "country": "US"
    }
  },
  "hours": {
    "monday": { "open": true, "start": "09:00", "end": "17:00" },
    "tuesday": { "open": true, "start": "09:00", "end": "17:00" },
    "wednesday": { "open": true, "start": "09:00", "end": "17:00" },
    "thursday": { "open": true, "start": "09:00", "end": "17:00" },
    "friday": { "open": true, "start": "09:00", "end": "17:00" },
    "saturday": { "open": false, "start": null, "end": null },
    "sunday": { "open": false, "start": null, "end": null }
  },
  "services": [
    {
      "name": "",
      "aliases": [],
      "description": "",
      "duration_minutes": null,
      "price_text": null,
      "price_min_cents": null,
      "bookable": true,
      "source_url": "",
      "confidence": 0.0
    }
  ],
  "faqs": [
    {
      "question": "",
      "answer": "",
      "category": "FAQ",
      "source_url": "",
      "confidence": 0.0
    }
  ],
  "policies": [],
  "payments": [],
  "insurance": [],
  "staff": [],
  "source_pages": []
}

Build backend endpoints:

1. `POST /api/leads/:leadId/demo-agent/prepare`
   - Body: `{ "website_url": "...", "activate": false, "force_rescrape": false }`
   - Creates/reuses `lead_demo_profiles`.
   - Starts a background scrape job.
   - Returns job id and profile id.

2. `GET /api/leads/:leadId/demo-agent/status`
   - Returns scrape status, profile status, clinic id, agent id, and a summary.

3. `POST /api/leads/:leadId/demo-agent/activate`
   - Requires the profile to be ready.
   - Upserts the lead clinic data into Supabase runtime tables.
   - Updates existing `agents.clinic_id`.
   - Updates the Telnyx `phone_numbers` row to the lead clinic and existing agent.
   - Inserts `lead_demo_activations`.
   - Returns `{ agent_id, clinic_id, phone_e164, status: "active" }`.

Scraper requirements:

- Use Playwright.
- Same-domain only.
- Max pages from env `SCRAPER_MAX_PAGES`, default 30.
- Max depth from env `SCRAPER_MAX_DEPTH`, default 2.
- Timeout from env `SCRAPER_PAGE_TIMEOUT_MS`, default 20000.
- Block images, media, fonts, and analytics.
- Extract visible text, title, meta description, canonical URL, JSON-LD, emails, phone numbers, addresses, hours, services, pricing, FAQ sections, payment methods, insurance, staff, policies.
- Store every scraped page in `lead_website_pages`.
- Prefer pages whose URL or anchor text includes: services, pricing, faq, about, contact, insurance, patient, appointment, new-patient, forms.
- Do not invent facts. Unknown prices must be represented as unknown, not guessed.

Supabase runtime write requirements:

- Use a backend-only Supabase service role client.
- Never expose service role credentials in frontend code.
- Upsert one `clinics` row per lead demo profile.
- Update the single `agent_settings` row for the existing demo agent. If `agent_id` is a UUID column, use `87112821-4661-4dd9-a22e-ba57b48feb17`.
- Insert clean, useful `knowledge_articles` with categories:
  - Services
  - Pricing
  - Hours
  - Location
  - Insurance
  - Payment
  - Staff
  - Policy
  - FAQ
  - About
- If normalized runtime tables exist, populate:
  - `services`
  - `service_aliases`
  - `service_facts` using fact types `price`, `duration`, `description`
  - `faq_chunks`
- Also call RPC `request_clinic_knowledge_sync` if it exists. If it does not exist, continue without failing activation.

Activation update:

- Before update, fetch the existing `agents.clinic_id` and store it as `previous_clinic_id`.
- Update `agents` where id is the existing demo agent id:
  - `clinic_id = lead_clinic_id`
  - `organization_id = organization_id`
  - `status = 'live'`
- Update `phone_numbers` where `phone_e164 = DEMO_TELNYX_PHONE_E164`:
  - `clinic_id = lead_clinic_id`
  - `organization_id = organization_id`
  - `agent_id = existing demo agent id`
  - `telephony_provider = 'telnyx'`
  - `status = 'active'`

Required env vars:

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
EXISTING_DEMO_AGENT_ID=agent-87112821-4661-4dd9-a22e-ba57b48feb17
EXISTING_DEMO_AGENT_DB_ID=87112821-4661-4dd9-a22e-ba57b48feb17
DEMO_TELNYX_PHONE_E164=+1XXXXXXXXXX
SCRAPER_USER_AGENT=Mozilla/5.0 DemoClinicBot/1.0
SCRAPER_MAX_PAGES=30
SCRAPER_MAX_DEPTH=2
SCRAPER_CONCURRENCY=2
SCRAPER_PAGE_TIMEOUT_MS=20000
SCRAPER_RESPECT_ROBOTS_TXT=true
EXTRACTION_MODE=free
OPENAI_API_KEY=
EXTRACTION_MODEL=gpt-4o-mini

Frontend requirements:

- In the lead table, add a button beside `Open Website`.
- States:
  - `Create Agent`
  - `Preparing...`
  - `Activate Demo`
  - `Active Demo`
  - `Failed`
- Show a compact summary after preparation:
  - business name
  - service count
  - FAQ count
  - whether hours were found
  - whether pricing was found
- After activation, show the returned existing agent id.

Testing:

- Add unit tests for URL validation, page classification, extraction normalization, service dedupe, price parsing, hours parsing, and Supabase payload builders.
- Add at least one integration-style test using mocked Playwright page output.
- Add a test that activation never creates a new agent and always returns `agent-87112821-4661-4dd9-a22e-ba57b48feb17`.
- Add a test that missing pricing does not create fake prices.

Before coding, inspect the repo structure and existing Supabase helpers. Follow existing style and keep implementation scoped. After coding, run the relevant tests and tell me exactly what changed.
```

## Operational Notes

- If you update an existing clinic profile in place, the agent may have short-lived cached knowledge. Prefer creating one clinic per lead and switching `clinic_id`; this avoids stale cache collisions.
- If you need to refresh the same lead profile, either wait for `CLINIC_KNOWLEDGE_CACHE_TTL` or restart the runtime during demos.
- If your CRM and agent platform use different Supabase projects, the CRM backend must write to the agent platform Supabase project for runtime tables.
- Cold calling in the USA can have TCPA, DNC, consent, disclosure, and call recording requirements. Keep compliance checks separate from this technical flow and make sure your CRM respects your legal process.
