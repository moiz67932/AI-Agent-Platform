# Voice AI Platform — Complete Architecture & Flow Documentation

> **Purpose:** A complete reference for understanding how every piece of the platform works — from a user signing up, to an AI agent picking up a phone call, booking an appointment, and surfacing that data in the dashboard.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema & Relationships](#2-database-schema--relationships)
3. [Multi-Tenancy: How Accounts Are Separated](#3-multi-tenancy-how-accounts-are-separated)
4. [Authentication Flow](#4-authentication-flow)
5. [Onboarding: How an Account Is Created](#5-onboarding-how-an-account-is-created)
6. [How Phone Numbers Are Linked to Agents](#6-how-phone-numbers-are-linked-to-agents)
7. [How the Knowledge Base Is Connected to the Agent](#7-how-the-knowledge-base-is-connected-to-the-agent)
8. [How the Voice Agent Works (Call Flow)](#8-how-the-voice-agent-works-call-flow)
9. [Do You Still Need to Run Cloud Run Jobs?](#9-do-you-still-need-to-run-cloud-run-jobs)
10. [Analytics: How Data Is Collected and Displayed](#10-analytics-how-data-is-collected-and-displayed)
11. [Appointments: Per-Agent and Per-Account Flow](#11-appointments-per-agent-and-per-account-flow)
12. [API Layer (Backend)](#12-api-layer-backend)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Per-Agent Data Separation in the UI](#14-per-agent-data-separation-in-the-ui)
15. [Industry Support](#15-industry-support)
16. [Latency Optimizations in the Agent](#16-latency-optimizations-in-the-agent)
17. [Key Environment Variables](#17-key-environment-variables)
18. [End-to-End Booking Flow (Walkthrough)](#18-end-to-end-booking-flow-walkthrough)
19. [What Is Not Yet Wired Up](#19-what-is-not-yet-wired-up)

---

## 1. System Overview

The platform is a **multi-tenant voice AI receptionist** — businesses sign up, get an AI agent assigned to their phone number, and that agent handles inbound calls (booking, cancellations, FAQ). Everything is observable through a web dashboard.

### Three Distinct Runtime Components

```
┌─────────────────────────────────────────────────────────────┐
│  1. FRONTEND  (React + Vite)                                │
│     Runs in user's browser, served from Vercel/CDN          │
│     Reads from Backend API and Supabase Auth directly       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (Bearer JWT)
┌────────────────────────▼────────────────────────────────────┐
│  2. BACKEND  (Node.js + Express, Cloud Run / VM)            │
│     REST API on port 3001                                   │
│     Talks to Supabase using SERVICE_ROLE_KEY (admin access) │
└────────────────────────┬────────────────────────────────────┘
                         │ Supabase SDK
┌────────────────────────▼────────────────────────────────────┐
│  3. SUPABASE  (PostgreSQL + Auth + Storage)                 │
│     Single source of truth for all data                     │
│     Auth: JWT tokens (OAuth Google + Email/Password)        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  4. PYTHON VOICE AGENT  (LiveKit, Cloud Run Job)            │
│     python worker_main.py                                   │
│     Runs one instance per active phone call                 │
│     Reads clinic/schedule/knowledge from Supabase           │
│     Writes call logs, transcripts, appointments to Supabase │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  5. LIVEKIT CLOUD  (WebRTC/SIP media server)                │
│     Manages real-time audio rooms                           │
│     Telnyx → SIP → LiveKit → Agent                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema & Relationships

### Entity Relationship (simplified)

```
Organization (1)
  └─ owns ─► Clinic (1..N)   [industry, timezone, working_hours]
               │
               ├─ has ─► Agent (1..N)        [status: live|paused|draft]
               │           └─ has ─► AgentSettings (1:1)
               │                      [greeting, tone, voice_id, config_json]
               │
               ├─ has ─► PhoneNumber (1..N)  [agent_id FK nullable]
               │
               ├─ has ─► KnowledgeArticle (1..N)
               │
               ├─ has ─► Appointment (1..N)
               │
               └─ has ─► CallSession / Call / CallTurn / CallEvent (1..N)
```

### Full Table Reference

#### `organizations`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | text | Business/org name |
| owner_id | UUID FK | → `auth.users.id` (Supabase Auth) |
| webhook_config | JSONB | Optional outbound webhook settings |
| created_at | timestamptz | |

#### `clinics`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK | → `organizations.id` |
| name | text | Clinic display name |
| industry | text | `dental`, `med_spa`, `hvac`, `restoration`, `generic`, `other` |
| timezone | text | e.g. `America/New_York` |
| working_hours | JSONB | `{ monday: { open: "09:00", close: "17:00", enabled: true }, ... }` |
| phone, email | text | Contact info |
| address_line1/2, city, state, zip, country, website | text | |

#### `agents`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK | |
| clinic_id | UUID FK | → `clinics.id` — **one agent per clinic** |
| name | text | Agent display name (e.g. "Aria") |
| status | text | `live`, `paused`, `draft` |
| default_language | text | `en` or `ur` |
| created_at, updated_at | timestamptz | |

#### `agent_settings`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK | → `agents.id` (1:1) |
| organization_id | UUID FK | |
| greeting_text | text | Opening phrase the agent says |
| persona_tone | text | `professional`, `warm`, `enthusiastic`, `formal` |
| voice_id | text | Cartesia voice e.g. `ava`, `marcus` |
| config_json | JSONB | Services list, treatment durations, emergency handling, cancellation policy, custom instructions |

**`config_json` structure:**
```json
{
  "services": [
    { "name": "Teeth Cleaning", "duration": 60, "price": 150, "enabled": true }
  ],
  "treatment_durations": { "Teeth Cleaning": 60, "Filling": 45 },
  "emergency_handling": true,
  "emergency_script": "For emergencies call 911.",
  "collect_insurance": false,
  "cancellation_policy": "24 hours notice required.",
  "custom_instructions": "Always confirm patient date of birth.",
  "agent_role": "receptionist"
}
```

#### `knowledge_articles`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK | |
| clinic_id | UUID FK | → `clinics.id` — **scoped per clinic** |
| title | text | Article title |
| category | text | e.g. `FAQ`, `Services`, `Insurance` |
| body | text | Full article content |
| status | text | `active`, `draft`, `processing` |
| search_vector | tsvector | Auto-updated by trigger on insert/update |

#### `phone_numbers`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK | |
| clinic_id | UUID FK (nullable) | |
| agent_id | UUID FK (nullable) | → `agents.id` — **assigns number to agent** |
| phone_number | text | Human-readable e.g. `+15551234567` |
| phone_e164 | text | E.164 format |
| label | text | e.g. `Main Line`, `After Hours` |
| status | text | `active`, `unassigned`, `suspended` |
| monthly_cost | numeric | Default $2.00 |
| telnyx_id | text | Telnyx resource ID (if applicable) |

#### `appointments`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| clinic_id | UUID FK | → `clinics.id` |
| patient_name | text | |
| patient_phone | text | E.164 format |
| patient_email | text | Optional |
| start_time | timestamptz | Appointment start |
| end_time | timestamptz | Appointment end |
| reason | text | Service name (e.g. "Teeth Cleaning") |
| status | text | `scheduled`, `confirmed`, `cancelled`, `completed` |
| source | text | `ai`, `manual`, `online`, `walk_in` |
| notes | text | Optional agent notes |
| created_at | timestamptz | |

#### `call_sessions`
Used by the Node.js backend/dashboard layer.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| clinic_id, agent_id, phone_number_id | UUID FK | |
| caller_number | text | Inbound caller number |
| outcome | text | `booked`, `info_only`, `missed`, `transferred`, `voicemail`, `error` |
| duration_seconds | int | |
| started_at, ended_at | timestamptz | |
| transcript | JSONB array | `[{ speaker, text, timestamp, stt_latency_ms, ... }]` |

#### `calls` (Python agent writes this)
| Column | Type | Notes |
|--------|------|-------|
| call_id | UUID PK | |
| organization_id, clinic_id, agent_id | UUID FK | |
| from_number, to_number | text | Masked phone numbers |
| start_time, end_time | timestamptz | |
| duration_seconds | int | |
| end_reason | text | `user_hangup`, `agent_hangup`, `timeout`, `error`, `completed` |
| environment | text | `production`, `development` |
| job_execution_id | text | Cloud Run job execution ID |

#### `call_events` (Python agent observability)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| call_id | UUID FK | |
| event_type | text | `stt`, `llm`, `tts`, `vad`, `state_change`, `tool_call`, `error`, `call_start`, `call_end` |
| payload | JSONB | Event-specific data (flexible schema) |
| latency_ms | int | Measured latency for this event |
| created_at | timestamptz | |

#### `call_turns` (Python agent per-turn metrics)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| call_id | UUID FK | |
| turn_index | int | Sequential turn number |
| user_text | text | What user said |
| agent_text | text | What agent responded |
| stt_latency_ms | int | Speech-to-text latency |
| llm_latency_ms | int | LLM processing latency |
| tts_latency_ms | int | Text-to-speech latency |
| total_latency_ms | int | End-to-end latency for this turn |

---

## 3. Multi-Tenancy: How Accounts Are Separated

Every user account maps to exactly **one Organization**. All data in the platform is scoped by `organization_id`.

### The Isolation Chain

```
User (Supabase Auth UID)
  │
  └─► Organization  (organizations.owner_id = user.id)
        │
        └─► All downstream tables have organization_id column
              clinics, agents, agent_settings, knowledge_articles,
              phone_numbers, appointments, call_sessions, etc.
```

### How It Enforces Isolation

**At the API layer (authMiddleware in `backend/src/middleware/auth.js`):**
1. Every request must carry `Authorization: Bearer <supabase_jwt>`
2. Backend validates the JWT with Supabase: `supabase.auth.getUser(token)`
3. Immediately looks up `organizations WHERE owner_id = user.id`
4. Attaches `req.orgId` to the request object
5. **Every single route query includes `.eq('organization_id', req.orgId)`**

This means even if someone guesses another user's resource ID, the query will return nothing because their JWT maps to a different `orgId`.

**Example from agents route:**
```javascript
// GET /api/agents
supabase.from('agents')
  .select('*, clinic:clinics(*), settings:agent_settings(*), phone_number:phone_numbers(*)')
  .eq('organization_id', req.orgId)   // ← enforced isolation
```

**The backend uses `SUPABASE_SERVICE_ROLE_KEY`** which bypasses Row Level Security — the isolation is enforced purely in Node.js code rather than Postgres RLS policies. This means the backend is the security boundary.

---

## 4. Authentication Flow

```
User → Frontend (React)
  │
  ├── [Login with Google]
  │     Supabase OAuth redirect → Google → back to /auth/callback
  │     Supabase issues JWT (access_token)
  │     authStore saves session + user + org
  │
  ├── [Login with Email/Password]
  │     supabase.auth.signInWithPassword(email, password)
  │     JWT returned and stored in localStorage by Supabase client
  │
  └── [Every API call]
        api.getAuthHeaders() → reads token from supabase.auth.getSession()
        Adds: "Authorization: Bearer <token>"
        Backend validates → attaches req.user + req.orgId
```

The frontend `authStore` (Zustand) initializes on app load:
1. Calls `supabase.auth.getSession()` to restore existing session
2. Subscribes to `supabase.auth.onAuthStateChange()` for token refreshes
3. On login: queries organizations table for the user's org
4. Stores `user`, `session`, `org` in state

`ProtectedRoute` in `App.tsx` checks `authStore.session` — if null, redirects to `/login`.

---

## 5. Onboarding: How an Account Is Created

The onboarding wizard (`/onboarding`) is an **8-step form** that creates all records atomically via a single API call.

### Steps

| Step | UI | Data Collected |
|------|-----|----------------|
| 1 | Industry selector | `industry` (dental/med_spa/hvac/restoration/generic) |
| 2 | Business info | Name, phone, email, address, timezone, website |
| 3 | Working hours | Per-day open/close times, enabled flags |
| 4 | Services | Service name, duration, price, enabled |
| 5 | Agent config | Agent name, greeting text, persona tone, voice |
| 6 | Knowledge base | FAQ articles (title, body, category) |
| 7 | Phone number | Phone number to assign |
| 8 | Review & submit | Confirmation screen |

### What `POST /api/onboarding/complete` Creates

```
1. organizations  → { name, owner_id }
2. clinics        → { organization_id, name, industry, timezone, working_hours, address... }
3. agents         → { organization_id, clinic_id, name, status: 'live', default_language }
4. agent_settings → { agent_id, organization_id, greeting_text, persona_tone, voice_id, config_json }
5. knowledge_articles → (bulk insert, each with clinic_id + organization_id)
6. phone_numbers  → { organization_id, clinic_id, agent_id, phone_e164, status: 'active' }
```

After onboarding, the user has a fully configured agent linked to a phone number and a knowledge base.

---

## 6. How Phone Numbers Are Linked to Agents

### The Linkage

```
phone_numbers table
  ├── organization_id  → which account owns this number
  ├── clinic_id        → which clinic this number serves
  └── agent_id         → which specific agent handles calls to this number
```

A phone number has a **direct FK to `agent_id`**. When Telnyx receives a call on that number, it triggers the LiveKit agent dispatch, and the agent loads the config for `agent_id`.

### Assignment in the UI

- `PhoneNumbers.tsx` page lists all numbers for the org
- `PATCH /api/numbers/:id` updates `agent_id` on the phone_numbers row
- Users can reassign numbers to different agents from the dashboard

### How the Python Agent Reads the Phone Number

In `agent.py`, the SIP call carries metadata. The agent extracts the clinic/agent context from 4 priority sources:

```python
# Priority order for identifying which clinic/agent to load:
1. SIP attributes       — metadata injected by Telnyx/LiveKit SIP trunk
2. Room name regex      — LiveKit room name may encode the phone number
3. Job metadata         — Cloud Run job metadata (passed at job creation time)
4. DEMO_CLINIC_ID env   — Fallback for local dev
```

Once the clinic/agent ID is known, the agent loads:
- Agent settings (from `agent_settings`)
- Working hours (from `clinics.working_hours`)
- Knowledge articles (from `knowledge_articles WHERE clinic_id = ...`)

---

## 7. How the Knowledge Base Is Connected to the Agent

### Storage

Knowledge articles are stored in `knowledge_articles` with:
- `clinic_id` — ties articles to a specific clinic
- `organization_id` — for access control
- `search_vector` — a PostgreSQL `tsvector` column for full-text search

### Auto-Indexing

A PostgreSQL trigger (`update_knowledge_search_vector_trigger`) fires on every `INSERT` or `UPDATE` and automatically computes:
```sql
search_vector = to_tsvector('english',
  coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(category, '')
)
```

A GIN index on `search_vector` makes full-text search fast even with thousands of articles.

### How the Agent Uses Knowledge Articles

**This is NOT a RAG (retrieval-augmented generation) system at runtime.** Instead:

1. At the **start of each call**, `agent.py` fetches ALL active knowledge articles for the clinic from Supabase
2. They are **concatenated inline into the system prompt** under the `{clinic_context}` placeholder
3. The LLM sees them as part of its instructions, not via a tool call

This approach was deliberately chosen over RAG because:
- **No extra tool call latency** (each RAG lookup adds 200-400ms)
- The total FAQ content is typically small enough to fit in context
- Articles are fetched with a 2-second async timeout (Latency Pattern C); if loading is slow, the greeting starts immediately and context is injected when ready

**Example prompt injection:**
```
[CLINIC CONTEXT]
Q: Do you accept Delta Dental insurance?
A: Yes, we are in-network with Delta Dental PPO plans...

Q: What are your hours?
A: We are open Monday-Friday 8am-6pm, Saturday 9am-2pm...
```

### Knowledge Base in the Frontend

- `KnowledgeBase.tsx` at `/knowledge/:id` — per-clinic article editor
- Full-text search via `GET /api/knowledge/:clinicId?q=searchterm`
- Dedicated search endpoint: `POST /api/knowledge/:clinicId/search`
- URL import: `POST /api/knowledge/:clinicId/import-url` (creates a draft stub)
- Article statuses: `active` (used by agent), `draft` (not loaded), `processing`

---

## 8. How the Voice Agent Works (Call Flow)

### Architecture: worker_main.py + agent.py

**`worker_main.py`** is the process entry point:
- Creates a `livekit.agents.AgentServer` instance
- Registers `session_entrypoint` via `@server.rtc_session(agent_name=LIVEKIT_AGENT_NAME)`
- Preloads the Silero VAD model once at startup (`prewarm()`)
- Runs `await server.run()` — a blocking loop that listens for incoming LiveKit room invitations
- Handles `SIGTERM` from Cloud Run gracefully

**`agent.py`** is the actual conversation logic:
- `entrypoint(ctx: JobContext)` is called for each new call
- Creates an `AgentSession` with the pipeline (STT → LLM → TTS)
- Loads clinic data from Supabase
- Starts the session and handles the full conversation lifecycle

### Pipeline

**English Pipeline (default):**
```
Caller audio → Deepgram STT → GPT-4o-mini LLM → Cartesia TTS → Caller speaker
```

**Urdu Pipeline (`ACTIVE_PIPELINE=urdu`):**
```
Caller audio → (STT) → LLM → Azure Neural TTS → Caller speaker
```

### What Happens on Each Call (Step by Step)

```
1. INBOUND CALL
   Telnyx receives a call on the configured phone number
   → Routes via SIP trunk to LiveKit Cloud
   → LiveKit creates a real-time room
   → Dispatches a job to the registered agent (LIVEKIT_AGENT_NAME)

2. WORKER PICKS UP
   AgentServer receives the room invitation
   → Spawns session_entrypoint(ctx)
   → ctx.connect() joins the room

3. CONTEXT LOAD (Latency Pattern C — deferred, 2s timeout)
   Starts async DB load:
   - clinic config (timezone, working hours)
   - agent settings (greeting, services, voice)
   - knowledge articles (for prompt injection)
   Greeting starts immediately WITHOUT waiting for DB
   "Hi, thanks for calling [clinic name]!"
   (clinic name falls back to env var if DB hasn't loaded yet)

4. CONVERSATION LOOP
   Each user turn:
   a. Silero VAD detects speech end
   b. Deepgram transcribes the audio → text
   c. System prompt is refreshed with current state + time
   d. GPT-4o-mini generates a response
      - May call @llm.function_tool decorated methods
   e. Cartesia converts response text to audio
   f. Audio plays to caller
   g. Filler phrases ("One moment.", "Let me check.") play
      during tool processing gaps (Latency Pattern A)

5. YES/NO ROUTING (Latency Pattern B)
   For simple confirmations ("yes"/"no"/"correct"):
   - Pattern-matched WITHOUT calling LLM
   - Direct state update + response generation
   - Saves ~400-800ms per confirmation turn

6. BOOKING
   When user confirms appointment details:
   - confirm_booking() tool fires
   - asyncio.create_task() schedules the Supabase insert non-blocking
     (Latency Pattern D — agent says "Booked!" before DB write completes)
   - Appointment created in appointments table with source='ai'

7. CALL END
   - end_call() tool or user hangs up
   - Agent logs call record to Supabase (calls, call_events, call_turns tables)
   - Session terminates
   - Cloud Run job completes
```

### PatientState — Conversation Memory

`PatientState` (in `models/state.py`) is a Python dataclass that tracks everything within a single call:

```python
full_name            # Collected patient name
phone_e164           # Confirmed phone number
email                # Optional email
reason               # Service requested (e.g. "Teeth Cleaning")
dt_local             # Parsed appointment datetime
time_status          # pending | validating | valid | invalid | error
booking_confirmed    # Boolean — did user say yes to the booking?
appointment_booked   # Boolean — was Supabase write successful?
appointment_id       # UUID of created appointment
```

The state is serialized via `PatientState.detailed_state_for_prompt()` and injected as `{state_summary}` into the system prompt each turn, keeping the LLM aware of what has already been collected.

### Tools (AssistantTools class)

The agent has these `@llm.function_tool` decorated methods available:

| Tool | Purpose |
|------|---------|
| `confirm_booking(name, phone, reason, datetime)` | Books appointment in Supabase |
| `get_available_slots(service_name, num_slots)` | Returns free time slots |
| `cancel_appointment(patient_phone, patient_name)` | Cancels existing booking |
| `reschedule_appointment(patient_phone, patient_name, new_datetime)` | Reschedules |
| `capture_patient_info(name, phone, email, reason)` | Updates PatientState |
| `confirm_appointment(appointment_id)` | Marks appointment as confirmed |
| `end_call()` | Terminates session |

Global clinic context is pushed to the tools module via `update_global_clinic_info()`, which sets module-level variables:
- `_GLOBAL_CLINIC_INFO` — clinic details, FAQ articles
- `_GLOBAL_SCHEDULE` — working hours dict
- `_GLOBAL_CLINIC_TZ` — `ZoneInfo` object for the clinic's timezone
- `_GLOBAL_AGENT_SETTINGS` — greeting, services, config_json
- `_GLOBAL_INDUSTRY_TYPE` — controls industry-specific tool behavior

---

## 9. Do You Still Need to Run Cloud Run Jobs?

**Yes, currently.** Here is the precise answer:

### What Runs Automatically vs. What You Must Trigger

| Thing | Automatic? | How |
|-------|-----------|-----|
| Backend API (Node.js) | Must be running | Deploy to Cloud Run Service or VM, stays up continuously |
| Frontend (React) | Must be deployed | Vercel, Cloud Run, or any static host |
| Database (Supabase) | Always running | Managed by Supabase cloud |
| LiveKit Cloud | Always running | Managed by LiveKit |
| **Python Voice Agent** | **Must be running** | **Cloud Run Job OR `python worker_main.py` locally** |

### The Python Agent Is NOT Event-Driven by Default

Unlike a Cloud Run **Service** (which spins up on HTTP request), the voice agent runs as a **long-lived process** that:
1. Connects to LiveKit Cloud via WebSocket
2. Listens for incoming job dispatches (i.e., new calls)
3. Handles calls one at a time (or in parallel with multiple instances)
4. Runs until SIGTERM

### Your Options

**Option A: Cloud Run Job (current architecture)**
```bash
# The Dockerfile CMD is:
CMD ["python", "worker_main.py"]

# You run:
gcloud run jobs execute YOUR_JOB_NAME --region YOUR_REGION
```
The job runs indefinitely handling calls until it times out or you stop it. You need to keep it running.

**Option B: Local Development**
```bash
cd /path/to/agent
python worker_main.py
```
This works perfectly for testing. The agent connects to LiveKit Cloud and handles real inbound SIP calls.

**Option C: Cloud Run Service (persistent)**
The `worker_main.py` listens on port 8080 (`host="0.0.0.0", port=8080`) which means you could deploy it as a Cloud Run **Service** and it would stay alive because it actively serves HTTP health pings. This is the recommended production path for a service that never shuts down.

### Summary

Until you set up auto-scaling or a persistent Cloud Run Service, **you must manually start `python worker_main.py`** (locally or in a Cloud Run job) before calls can be answered. The LiveKit agent will not pick up calls if this process is not running.

---

## 10. Analytics: How Data Is Collected and Displayed

### Data Collection (Python Agent)

When a call ends, the Python agent writes to three tables:

1. **`calls`** — One row per call with duration, outcome, IDs
2. **`call_events`** — Every STT/LLM/TTS/tool event with latency
3. **`call_turns`** — Aggregated turn-by-turn transcript + latencies

### Analytics API (`GET /api/analytics`)

The backend queries `call_sessions` (the Node.js-facing table) and `appointments`:

```
Query: call_sessions WHERE clinic_id IN [org's clinics] AND started_at BETWEEN start_date AND end_date
                        AND (optionally) agent_id = filter

Aggregations returned:
  total_calls          → count of all sessions
  total_bookings       → count WHERE outcome = 'booked'
  booking_rate         → (bookings / total) * 100
  avg_duration         → mean of duration_seconds
  calls_answered       → count WHERE outcome != 'missed'
  missed_calls         → count WHERE outcome = 'missed'
  calls_by_day         → [{date, calls, booked}] for line chart
  calls_by_hour        → [{hour, count}] for bar chart
  calls_by_weekday     → [{day, count}] for bar chart
  outcome_breakdown    → [{outcome, count}] for pie chart
  service_breakdown    → [{service, requested, booked}] from appointments table
```

### Frontend Display

**Dashboard.tsx** shows:
- KPI cards: Total Calls, Bookings, Booking Rate, Avg Duration
- Recent calls list (last 5)
- Agent status summary

**Analytics.tsx** (`/analytics`) shows:
- Date range picker (default: last 30 days)
- Filter by agent_id
- Line chart: calls per day + bookings per day
- Bar charts: calls by hour of day, calls by weekday
- Pie chart: outcome breakdown (booked/missed/transferred/etc.)
- Table: service breakdown with booking rate per service

### Per-Agent Filtering

The analytics API accepts `?agent_id=<uuid>` which filters `call_sessions` to that specific agent. The AgentOverview page uses this to show stats for one agent. The main Analytics page can also filter by agent via a dropdown.

---

## 11. Appointments: Per-Agent and Per-Account Flow

### How Appointments Attach to Agents

Appointments are stored with a `clinic_id` (not `agent_id` directly). The linkage chain is:

```
appointment.clinic_id → clinic.id → (agent.clinic_id = clinic.id)
```

Since each clinic typically has one agent, filtering appointments by `clinic_id` is equivalent to filtering by agent.

### Fetching Appointments in the UI

**`GET /api/appointments`** accepts:
- `clinic_id` — filter to one clinic/agent
- `start_date`, `end_date` — date range
- `status` — `scheduled`, `confirmed`, `cancelled`, `completed`

The backend resolves which clinics belong to the org before filtering:
```javascript
clinics WHERE organization_id = req.orgId → get clinicIds
appointments WHERE clinic_id IN clinicIds AND [filters]
```

### Calendar Page

`Calendar.tsx` fetches appointments for the visible month window and groups them by date for display. Each appointment chip is clickable and shows a detail modal. Days with >3 appointments show a "+N more" link.

### Call ↔ Appointment Link

`call_sessions` has a soft reference to appointments:
- When the Python agent books an appointment, it stores `appointment_id` in `PatientState`
- The Node backend can join `call_sessions → appointments` for the call detail view
- `GET /api/calls` returns joined appointment data: `appointment: { id, patient_name, reason, start_time }`

---

## 12. API Layer (Backend)

### Server Setup (`backend/src/index.js`)

```
Express on PORT 3001
Security: helmet (CSP disabled), CORS (localhost:5173 + FRONTEND_URL)
Logging: morgan 'dev'
Body limit: 10MB JSON
Health: GET /health → { status: 'ok', timestamp }
All routes: authMiddleware first, then router
```

### Route Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/api/onboarding/complete` | Create full account setup atomically |
| GET | `/api/agents` | List all agents for org (with clinic, settings, phone) |
| GET | `/api/agents/:id` | Single agent detail |
| POST | `/api/agents` | Create agent |
| PUT | `/api/agents/:id` | Update agent + settings |
| PATCH | `/api/agents/:id/status` | Change status: live/paused/draft |
| DELETE | `/api/agents/:id` | Delete agent |
| GET | `/api/knowledge/:clinicId` | List articles (supports `?q=` search) |
| POST | `/api/knowledge/:clinicId` | Create article |
| PUT | `/api/knowledge/:clinicId/:articleId` | Update article |
| DELETE | `/api/knowledge/:clinicId/:articleId` | Delete article |
| POST | `/api/knowledge/:clinicId/search` | Full-text search |
| POST | `/api/knowledge/:clinicId/import-url` | Import from URL (creates draft) |
| GET | `/api/calls` | Paginated call list (filters: agent_id, outcome, dates) |
| GET | `/api/calls/:id` | Call detail + transcript |
| GET | `/api/appointments` | List appointments (filters: clinic_id, dates, status) |
| POST | `/api/appointments` | Create appointment |
| PUT | `/api/appointments/:id` | Update appointment |
| DELETE | `/api/appointments/:id` | Soft-delete (sets status=cancelled) |
| GET | `/api/numbers` | List phone numbers |
| POST | `/api/numbers/provision` | Register a phone number |
| PATCH | `/api/numbers/:id` | Update label or assign agent |
| DELETE | `/api/numbers/:id` | Remove number |
| GET | `/api/analytics` | Analytics aggregation (filters: dates, agent_id) |
| POST | `/api/webhooks/configure` | Store webhook config |
| GET | `/api/integrations` | Integration status |

---

## 13. Frontend Architecture

### Technology Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** components
- **TanStack Query** (React Query v5) for data fetching + caching
- **Zustand** for global state (auth, UI theme, onboarding)
- **React Router v6** for routing
- **Recharts** for analytics charts
- **date-fns** for date handling

### File Structure

```
src/
├── App.tsx              ← Routes + auth protection wrappers
├── types/index.ts       ← All TypeScript interfaces
├── lib/
│   ├── api.ts           ← HTTP client with Bearer token injection
│   └── supabase.ts      ← Supabase JS client
├── stores/
│   ├── authStore.ts     ← Zustand: user, session, org
│   └── uiStore.ts       ← Zustand: theme (light/dark)
├── hooks/
│   ├── useAgents.ts     ← CRUD hooks for agents
│   ├── useAppointments.ts ← CRUD hooks for appointments
│   ├── useCalls.ts      ← Hooks for call list + detail
│   ├── useAnalytics.ts  ← Analytics data hook
│   ├── useKnowledge.ts  ← Knowledge article hooks
│   └── usePhoneNumbers.ts ← Phone number hooks
└── pages/
    ├── Dashboard.tsx    ← KPI overview
    ├── Onboarding.tsx   ← 8-step wizard
    ├── AgentsList.tsx   ← All agents table
    ├── AgentOverview.tsx ← Single agent editor
    ├── KnowledgeBase.tsx ← Article editor
    ├── CallLog.tsx      ← Paginated call history
    ├── CallDetail.tsx   ← Transcript + latency metrics
    ├── Calendar.tsx     ← Monthly appointment calendar
    ├── Analytics.tsx    ← Charts + KPIs
    ├── PhoneNumbers.tsx ← Number management
    └── Settings/        ← Account, Team, Billing, API
```

### Auth Protection

```tsx
// In App.tsx
<Route path="/dashboard" element={
  <ProtectedRoute>       ← checks authStore.session, redirects to /login if null
    <Layout>             ← sidebar + top nav
      <Dashboard />
    </Layout>
  </ProtectedRoute>
} />
```

---

## 14. Per-Agent Data Separation in the UI

### Where You See "Per Agent" Data

| Page | How It Filters Per Agent |
|------|--------------------------|
| **AgentOverview** (`/agents/:id`) | All queries use `agent_id` param |
| **Analytics** (`/analytics`) | `?agent_id=` dropdown filter |
| **CallLog** (`/calls`) | `?agent_id=` filter in sidebar |
| **Calendar** (`/calendar`) | `?clinic_id=` filter (agent ↔ clinic 1:1) |
| **KnowledgeBase** (`/knowledge/:id`) | `:id` is the `clinic_id` |

### AgentOverview Page

This is the central per-agent page. It shows:
- Agent settings form (greeting, voice, tone, services)
- Status toggle (live / paused / draft)
- Phone number assignment
- Link to Knowledge Base for this agent's clinic
- Recent calls for this agent (filtered by `agent_id`)
- Per-agent call stats

### How the Agent Detail Loads

```typescript
// hooks/useAgents.ts
useAgent(id) → GET /api/agents/:id
  Returns agent + joined:
  - clinic:clinics(*)            ← full clinic record
  - settings:agent_settings(*)  ← voice, greeting, config
  - phone_number:phone_numbers(*)  ← assigned number(s)
```

---

## 15. Industry Support

The platform supports multiple business verticals. Industry is stored on the `clinics` table and affects:

| Industry | Services | Agent Behavior |
|----------|----------|----------------|
| `dental` | Cleaning, Filling, Crown, Root Canal, Whitening, Exam | Standard booking flow |
| `med_spa` | HydraFacial, Botox, Filler, Laser Hair Removal, Massage | Extra fields: first visit, contraindication, patch test |
| `hvac` | Emergency call, Service Estimate, Installation, AC Repair | Can route emergency calls |
| `restoration` | Water Damage, Fire Damage, Mold Remediation | Emergency handling emphasis |
| `generic` | Customizable | User-defined services list |
| `other` | Customizable | User-defined services list |

### Industry-Specific PatientState Fields

For `med_spa`, `PatientState` has extra fields that default to `None`/`False` for all other industries:
```python
is_first_visit: bool | None
is_couples_booking: bool | None
partner_name: str | None
requested_provider: str | None
has_contraindication: bool | None
needs_patch_test: bool | None
has_gift_card: bool | None
is_membership_client: bool | None
```

The LLM is instructed to collect these only when industry is `med_spa`.

---

## 16. Latency Optimizations in the Agent

The agent is tuned for telephony latency. Four patterns are implemented:

### Pattern A: Filler Phrases
```python
FILLER_PHRASES = ["One moment.", "Let me check."]
```
When the LLM is processing (usually during tool calls), a short filler is spoken immediately so the caller doesn't hear silence. The filler is suppressed once the real response starts. Fillers use plain periods (not Unicode ellipsis `…`) because TTS was producing silence on `…`.

### Pattern B: Deterministic Yes/No Routing
For simple confirmation turns ("yes", "that's right", "correct", "yeah"), the agent bypasses the LLM entirely and routes deterministically. This saves 400-800ms per confirmation. Controlled by `DETERMINISTIC_FAST_PATH_ENABLED` env var.

### Pattern C: Deferred DB Load
Clinic data (schedule, knowledge articles) loads asynchronously at call start with a 2-second timeout. The greeting phrase plays immediately without waiting. The LLM context is updated as soon as the load completes.

### Pattern D: Fire-and-Forget Booking
```python
asyncio.create_task(book_to_supabase(...))  # non-blocking
```
The Supabase DB write is kicked off as a background task. The agent immediately says "You're all booked!" without waiting for the DB round-trip (typically 100-300ms).

### Tuning Knobs (config.py)

| Constant | Default | Effect |
|----------|---------|--------|
| `MIN_ENDPOINTING_DELAY` | 0.4s | How fast agent detects speech end |
| `MAX_ENDPOINTING_DELAY` | 0.7s | Max wait for end-of-utterance |
| `VAD_MIN_SILENCE_DURATION` | 0.25s | Silence gap to trigger turn end |
| `FILLER_DEBOUNCE_MS` | 220ms | Delay before filler fires |
| `FILLER_MAX_DURATION_MS` | 250ms | Max LLM wait before filler plays |
| `TURN_SHORT_PAUSE_MS` | 900ms | Short pause threshold |
| `LOOKUP_FILLER_DELAY_MS` | 260ms | Filler delay for lookup-style questions |

---

## 17. Key Environment Variables

### Python Agent (`.env.local` or Cloud Run env)

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | Agent registration name (must match dispatch config) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | GPT-4o-mini key |
| `DEEPGRAM_API_KEY` | STT key |
| `CARTESIA_API_KEY` | TTS key |
| `AZURE_SPEECH_KEY` | Azure TTS (Urdu) |
| `AZURE_SPEECH_REGION` | Azure region |
| `DEMO_CLINIC_ID` | Fallback clinic UUID for dev |
| `ACTIVE_PIPELINE` | `english` (default) or `urdu` |
| `LATENCY_DEBUG` | `1` to log per-turn latencies |
| `ENVIRONMENT` | `production` or `development` |

### Backend API (`platform/backend/.env`)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (bypasses RLS) |
| `FRONTEND_URL` | CORS allowed origin |
| `PORT` | Server port (default 3001) |
| `TELNYX_API_KEY` | Telnyx phone API |
| `STRIPE_SECRET_KEY` | Billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook validation |

### Frontend (`platform/frontend/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `VITE_API_URL` | Backend URL (default: `http://localhost:3001`) |

---

## 18. End-to-End Booking Flow (Walkthrough)

Here is a complete trace of what happens when a patient calls to book a dental cleaning:

```
PATIENT dials: +1-555-123-4567  (assigned to agent "Aria" at Bright Smile Dental)

1. TELNYX (carrier)
   Receives inbound PSTN call
   Looks up SIP trunk → routes to LiveKit Cloud SIP endpoint

2. LIVEKIT CLOUD
   Creates a real-time audio room
   Dispatches job to registered agent: LIVEKIT_AGENT_NAME = "bright-smile-agent"
   Passes room metadata including SIP call details

3. PYTHON WORKER (worker_main.py)
   AgentServer receives job dispatch
   Spawns: session_entrypoint(ctx) → entrypoint(ctx) in agent.py
   ctx.connect() joins the LiveKit room

4. AGENT STARTUP (agent.py)
   Kicks off async DB load (2s timeout):
     - clinics WHERE id = <clinic_id>  → timezone, working_hours
     - agent_settings WHERE agent_id = <agent_id> → greeting, voice, services
     - knowledge_articles WHERE clinic_id = <clinic_id> AND status = 'active'
   Immediately plays greeting (doesn't wait for DB):
     Cartesia TTS: "Hi, thanks for calling Bright Smile Dental! This is Aria."

5. PATIENT: "Hi, I'd like to book a teeth cleaning."
   Deepgram STT → "Hi, I'd like to book a teeth cleaning."
   System prompt refreshed with:
     {clinic_context} = FAQ articles (now loaded)
     {state_summary} = PatientState (all empty)
     {current_time} = "Tuesday, March 22, 2026 at 10:30 AM ET"
   GPT-4o-mini: detects booking intent → calls capture_patient_info tool
   Agent: "Sure! I can help with that. May I have your name?"

6. PATIENT: "Sarah Johnson."
   STT → "Sarah Johnson."
   Tool: capture_patient_info(name="Sarah Johnson") → state.full_name = "Sarah Johnson"
   Agent: "Got it, Sarah! And what's a good phone number to reach you?"

7. PATIENT: "It's 212-555-9876."
   STT → "It's 212-555-9876."
   PatientState.detected_phone = "+12125559876"
   Agent: "Thanks! I have your number as 212-555-9876. Is that correct?"

8. PATIENT: "Yes."
   [Pattern B: Deterministic routing — no LLM call]
   Direct state update: phone_confirmed = True
   Agent: "Perfect! When would you like to come in?"

9. PATIENT: "How about this Thursday at 2pm?"
   STT → "How about this Thursday at 2pm?"
   LLM parses date: dt_local = 2026-03-26 14:00 ET, time_status = "validating"
   Tool: get_available_slots("Teeth Cleaning", 1)
     → Queries appointments table: no conflicts for Thu 2pm (60 min block)
     → Returns: ["Thursday March 26 at 2:00 PM"]
   Agent: "Thursday March 26th at 2 PM works! Shall I go ahead and book that for you?"

10. PATIENT: "Yes, please."
    [Pattern B: Deterministic routing]
    → confirm_booking("Sarah Johnson", "+12125559876", "Teeth Cleaning", "2026-03-26T14:00:00")
    [Pattern D: Fire-and-forget]
    asyncio.create_task(book_to_supabase(...)):
      INSERT INTO appointments:
        clinic_id = <clinic_id>
        patient_name = "Sarah Johnson"
        patient_phone = "+12125559876"
        start_time = "2026-03-26T14:00:00-04:00"
        end_time = "2026-03-26T15:00:00-04:00"
        reason = "Teeth Cleaning"
        status = "scheduled"
        source = "ai"
    Agent says IMMEDIATELY (before DB write):
      "You're all set! I've booked you for a teeth cleaning on Thursday March 26th at 2 PM."

11. PATIENT: "Great, thanks!"
    Agent: "You're welcome Sarah! We'll see you Thursday. Have a wonderful day!"
    end_call() tool → session terminates

12. CALL LOGGING
    Agent writes to Supabase:
      calls: { call_id, clinic_id, agent_id, duration_seconds=65, end_reason="completed" }
      call_events: [all STT/LLM/TTS events with latencies]
      call_turns: [8 turns with per-turn STT+LLM+TTS latencies]

13. DASHBOARD UPDATE
    Next time dashboard refreshes:
      GET /api/analytics → total_calls +1, total_bookings +1
      GET /api/appointments → Sarah Johnson's appointment visible in calendar
      GET /api/calls → new call in log with outcome="booked"
```

---

## 19. What Is Not Yet Wired Up

Understanding the gaps is as important as understanding what works:

| Feature | Status | Notes |
|---------|--------|-------|
| **Telnyx auto-provisioning** | UI placeholder | `POST /api/numbers/provision` saves to DB but doesn't call Telnyx API to actually purchase/configure the number. `telnyx_id` field exists but integration is incomplete. |
| **Stripe billing** | Env vars present | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured but the routes/webhooks/integrations.js just returns static status data. No real billing cycle. |
| **SMS confirmations** | PatientState has `delivery_channel` | The agent collects SMS preference but no Telnyx SMS sending is wired up in the agent tools. |
| **URL import scraping** | Draft stub only | `POST /api/knowledge/:clinicId/import-url` creates a draft article with placeholder text. No actual web scraping is implemented. |
| **Real-time dashboard** | Polling only | No Supabase Realtime subscriptions. Data refreshes on React Query's `staleTime` interval. |
| **Team members** | UI page exists | Settings → Team page is in the frontend routes but the backend route and `team_members` table are not fully implemented. |
| **Agent per-call dispatch** | Shared worker | All calls go to the same `LIVEKIT_AGENT_NAME` worker. True per-agent routing (different LLM prompts per number) requires passing `agent_id` through SIP metadata to the job. The infra for this exists (`job_execution_id`) but the end-to-end dispatch isn't finalized. |
| **call_sessions vs calls** | Dual table | There are both `call_sessions` (Node.js analytics) and `calls` (Python agent logging). These are not joined. The Node.js backend reads `call_sessions`; the Python agent writes to `calls`, `call_events`, `call_turns`. If `call_sessions` isn't populated from the Python side, analytics shows zeros. |

---

*Last updated: 2026-03-22. Reflects codebase at commit `a102483`.*
