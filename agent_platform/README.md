# VoiceAI Platform

A production-ready SaaS platform for AI voice receptionist agents — built on top of an existing LiveKit-powered Python agent that handles real phone calls.

## Architecture

```
platform/
├── frontend/          # React 18 + Vite + TailwindCSS + shadcn/ui
├── backend/           # Node.js + Express + Supabase
└── migrations/        # SQL migrations for Supabase
```

The platform shares the **same Supabase database** as the Python LiveKit agent. When a business is onboarded and an agent is configured here, the Python agent automatically picks up the configuration on the next call.

## One-Command Setup

```bash
cd platform
npm run setup
```

Then:
1. Copy `frontend/.env.example` → `frontend/.env.local` and fill in your Supabase keys
2. Copy `backend/.env.example` → `backend/.env` and fill in all keys
3. Run the SQL migration in Supabase SQL editor: `migrations/001_knowledge_search_vector.sql`

## Development

```bash
cd platform
npm run dev   # Starts both frontend (port 3000) and backend (port 3001)
```

Or run separately:
```bash
npm run dev:frontend   # Vite dev server on :3000
npm run dev:backend    # Express on :3001
```

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend API URL (default: `http://localhost:3001`) |

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `TELNYX_API_KEY` | Telnyx API key for phone number provisioning |
| `TELNYX_SIP_CONNECTION_ID` | Your Telnyx SIP connection ID |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing |
| `PORT` | Backend port (default: 3001) |

## How It Connects to the Python Agent

The Python LiveKit agent (`agent.py`) and this platform share the same Supabase database. Here's the data flow:

1. **Platform onboarding** creates records in: `organizations`, `clinics`, `agents`, `agent_settings`, `knowledge_articles`, `phone_numbers`
2. **When a call arrives**, the Python agent queries `clinics` by phone number to load configuration
3. **The agent reads** `agent_settings.config_json` for: greeting text, tone, treatment durations, emergency handling
4. **The agent loads** `knowledge_articles` for that clinic as inline FAQ context in the system prompt
5. **Booked appointments** are written to `appointments` and appear in the platform calendar
6. **Call sessions** are logged to `call_sessions` and transcripts to `call_transcripts`

The platform provides the **management UI** — the Python agent handles the **real-time voice interaction**.

## Adding a New Industry Profile

1. Add a new entry to `DEFAULT_SERVICES` in `frontend/src/pages/Onboarding.tsx`
2. Add suggested FAQs to `SUGGESTED_QA` in the same file
3. Add the industry to the `IndustryType` union in `frontend/src/types/index.ts`
4. Add an industry color and label to `INDUSTRY_COLORS` and `INDUSTRY_LABELS`
5. Optionally create a Python profile in `Agent/industry_profiles/` following the `BaseProfile` pattern

## Pages Reference

| Route | Page |
|-------|------|
| `/` | Landing (marketing) |
| `/login` | Login |
| `/signup` | Signup |
| `/onboarding` | 8-step wizard |
| `/dashboard` | Main dashboard |
| `/agents` | Agent list |
| `/agents/:id` | Agent overview |
| `/knowledge/:id` | Knowledge base |
| `/calls` | Call log |
| `/calls/:id` | Call detail + transcript |
| `/calendar` | Appointments calendar |
| `/numbers` | Phone numbers |
| `/analytics` | Analytics deep-dive |
| `/integrations` | Telnyx + webhooks |
| `/settings` | Account settings |
| `/settings/team` | Team management |
| `/settings/billing` | Billing |
| `/settings/api` | API keys |

## Tech Stack

**Frontend**
- React 18, React Router v6
- TailwindCSS + shadcn/ui components
- Framer Motion (page transitions, animations)
- Recharts (charts), React Big Calendar
- React Query (server state), Zustand (client state)
- React Hook Form + Zod (forms/validation)
- Supabase JS (auth + direct queries)

**Backend**
- Node.js + Express
- Supabase (PostgreSQL via service role key)
- Telnyx API (phone number provisioning)

**Database**
- Supabase/PostgreSQL (shared with Python agent)
- Full-text search via `tsvector` on `knowledge_articles`
