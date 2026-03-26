# VoiceAI Platform — Feature Documentation

Complete reference for all platform features, their implementation files, data flow, and required environment variables.

---

## Table of Contents

1. [Twilio Phone Number Management](#1-twilio-phone-number-management)
2. [API Rate Limiting](#2-api-rate-limiting)
3. [Sentry Error Monitoring (Node.js Backend)](#3-sentry-error-monitoring-nodejs-backend)
4. [Sentry Error Monitoring (Python Agent)](#4-sentry-error-monitoring-python-agent)
5. [Analytics Data Pipeline](#5-analytics-data-pipeline)
6. [Email Notifications via Resend](#6-email-notifications-via-resend)
7. [Supabase Write Retry Logic](#7-supabase-write-retry-logic)
8. [Real-Time Dashboard](#8-real-time-dashboard)
9. [Docker & Deployment Infrastructure](#9-docker--deployment-infrastructure)
10. [Team Member Invites & RBAC](#10-team-member-invites--rbac)
11. [Knowledge Base URL Scraping](#11-knowledge-base-url-scraping)
12. [Agent Test Call (Browser-to-Agent)](#12-agent-test-call-browser-to-agent)
13. [Cancel / Reschedule Appointment Flow](#13-cancel--reschedule-appointment-flow)
14. [Automated Test Suite](#14-automated-test-suite)
15. [Environment Variables Reference](#15-environment-variables-reference)

---

## 1. Twilio Phone Number Management

Replaced the original Telnyx integration with Twilio for searching, purchasing, configuring, and releasing phone numbers.

### How It Works

1. **Search** — The frontend sends an area code to `GET /api/numbers/search?areaCode=XXX`. The backend calls Twilio's `availablePhoneNumbers(country).local.list()` and returns up to 20 matching numbers with locality, region, and capabilities.
2. **Purchase** — When the user selects a number, the frontend sends `POST /api/numbers/provision` with the phone number. The backend calls `tw.incomingPhoneNumbers.create({ phoneNumber })` to purchase it from Twilio, stores the returned SID and number in the Supabase `phone_numbers` table, and returns the record.
3. **Configure Webhook** — After purchase, `configureNumberWebhook(sid, voiceUrl)` is called to point the number's incoming voice webhook to the LiveKit SIP trunk or application endpoint.
4. **Release** — On `DELETE /api/numbers/:id`, the backend first calls `tw.incomingPhoneNumbers(sid).remove()` to release the number from Twilio, then deletes the row from Supabase.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/services/twilioService.js` | Core Twilio SDK wrapper — exports `initTwilio()`, `searchAvailableNumbers()`, `purchaseNumber()`, `releaseNumber()`, `configureNumberWebhook()` |
| `platform/backend/src/routes/numbers.js` | REST endpoints — `GET /search`, `POST /provision`, `DELETE /:id` |
| `platform/frontend/src/pages/PhoneNumbers.tsx` | UI — tabbed search-then-buy dialog with area code input, number list, purchase button, Twilio console link |
| `platform/frontend/src/pages/Integrations.tsx` | Settings — Twilio Account SID and Auth Token configuration fields, connection test via `twilio.api.accounts(SID).fetch()` |
| `platform/backend/src/routes/integrations.js` | Integration save/test endpoints — stores Twilio credentials, validates them against Twilio API |

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `TWILIO_ACCOUNT_SID` | Backend `.env` | Twilio Account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Backend `.env` | Twilio Auth Token |
| `TWILIO_TRUNKING_SID` | Backend `.env` | Twilio Elastic SIP Trunk SID (starts with `TK`) — used to configure SIP routing |

---

## 2. API Rate Limiting

Protects the backend against abuse with three tiers of rate limiting using `express-rate-limit` v8.

### How It Works

Three rate limiters are applied at different scopes:

| Limiter | Scope | Limit | Applied To |
|---------|-------|-------|------------|
| `globalLimiter` | Per IP | 200 req/min | All `/api/*` routes |
| `authLimiter` | Per IP | 10 req/min | `/api/auth` routes only |
| `orgLimiter` | Per `req.orgId` (falls back to IP) | 100 req/min | `/api/knowledge` and `/api/analytics` routes |

When a limit is exceeded, the client receives a `429 Too Many Requests` response with a JSON error message. Standard `RateLimit-*` headers are sent with every response so clients can track their remaining quota.

The `orgLimiter` uses a custom `keyGenerator` that keys on `req.orgId` (set by the auth middleware) so all team members of the same organization share one rate limit bucket. The `validate` option disables IPv6 validation checks.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/middleware/rateLimiter.js` | Exports `globalLimiter`, `authLimiter`, `orgLimiter` — all configured with `express-rate-limit` |
| `platform/backend/src/index.js` | Mounts the limiters — `globalLimiter` on `/api`, `authLimiter` on `/api/auth`, `orgLimiter` on knowledge and analytics routes |

### Env Vars

No additional env vars. Rate limits are hardcoded constants.

---

## 3. Sentry Error Monitoring (Node.js Backend)

Captures unhandled exceptions, request traces, and Node.js profiling data in the Express backend.

### How It Works

1. **Initialization** — `Sentry.init()` is called in `index.js` before any other imports. It loads the DSN from `SENTRY_DSN`, enables `nodeProfilingIntegration()` for CPU profiling, and samples 10% of traces.
2. **Error Filtering** — `beforeSend` filters out 4xx client errors so only 5xx server errors reach Sentry.
3. **Error Handler** — `Sentry.setupExpressErrorHandler(app)` is mounted after all routes and the custom `errorHandler` middleware. It captures errors with status >= 500.
4. **Org Context** — A middleware on every request checks for `req.orgId` and tags the current Sentry scope with `org_id` so errors can be filtered by organization in the Sentry dashboard.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/index.js` | Lines 5-19: Sentry init; Line 47-54: org context tagging; Lines 89-94: error handler |

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `SENTRY_DSN` | Backend `.env` | Sentry Data Source Name (ingest URL) |
| `NODE_ENV` | Backend `.env` | Environment tag sent to Sentry (`development`, `production`) |

---

## 4. Sentry Error Monitoring (Python Agent)

Captures exceptions, async task failures, and call lifecycle breadcrumbs in the Python voice agent.

### How It Works

1. **Initialization** — `sentry_sdk.init()` is called at the top of `config.py` (which is imported before everything else). It uses `AsyncioIntegration()` to capture errors in async tasks, samples 10% of traces, and sets `environment` and `release` from env vars.
2. **Entrypoint Wrapper** — `agent.py`'s `entrypoint()` is a thin try/except that calls `_entrypoint_impl()`. If an unhandled exception occurs, it calls `sentry_sdk.capture_exception()` before re-raising.
3. **Breadcrumbs** — Four lifecycle breadcrumbs are logged during each call:
   - `clinic_loaded` — when clinic data is fetched from Supabase
   - `greeting_sent` — when the initial greeting plays
   - `booking_confirmed` — when a booking completes (includes patient name and time)
   - `call_ended` — when the call disconnects (includes outcome: booked/info_only/missed)
4. **User Context** — `sentry_sdk.set_user()` is called in `_on_shutdown` with clinic context so errors can be attributed to specific clinics.

### Files

| File | Purpose |
|------|---------|
| `config.py` | Lines 26-35: `sentry_sdk.init()` with AsyncioIntegration |
| `agent.py` | `entrypoint()` wrapper with `capture_exception()`; breadcrumbs in `_on_shutdown` and session lifecycle handlers |

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `SENTRY_DSN` | Agent `.env.local` | Sentry Data Source Name |
| `ENVIRONMENT` | Agent `.env.local` | Environment tag (`development`, `production`) |
| `VERSION` | Agent `.env.local` | Release version string (defaults to `unknown`) |

---

## 5. Analytics Data Pipeline

Writes structured call session records to Supabase at the end of every call for the analytics dashboard.

### How It Works

When a call ends, `_on_shutdown` in `agent.py` constructs a complete `call_sessions` row and inserts it via `supabase_write_with_retry`. The row includes:

| Column | Source |
|--------|--------|
| `id` | `uuid.uuid4()` |
| `clinic_id` | From session metadata |
| `agent_id` | From session metadata |
| `organization_id` | From clinic lookup |
| `caller_number` | Full E.164 from SIP/room metadata |
| `caller_phone_masked` | Last 4 digits only |
| `caller_name` | From `PatientState.patient_name` |
| `outcome` | Mapped: `booking_confirmed` -> `booked`, `call_ended + user_declined` -> `info_only`, not `call_ended` -> `missed`, fallback -> `info_only` |
| `duration_seconds` | `ended_at - started_at` |
| `started_at` | UTC ISO timestamp captured at session start |
| `ended_at` | UTC ISO timestamp captured at shutdown |

The frontend's existing analytics queries (`analytics.js`) use `SELECT *` so all columns are automatically available. The `CallSession` TypeScript interface in `types/index.ts` includes `caller_name?: string`.

**Test mode calls** (triggered from the browser test call feature) skip the `call_sessions` insert entirely.

### Files

| File | Purpose |
|------|---------|
| `agent.py` | `_on_shutdown` — builds and inserts the call_sessions row |
| `platform/backend/src/routes/analytics.js` | Reads call_sessions for dashboard charts (no changes needed) |
| `platform/backend/src/routes/calls.js` | Reads call_sessions for call log (no changes needed) |
| `platform/frontend/src/types/index.ts` | `CallSession` interface with `caller_name` field |

### Env Vars

Uses existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (agent-side).

---

## 6. Email Notifications via Resend

Sends transactional emails for booking confirmations, missed call alerts, and team invitations using the Resend email API.

### How It Works

#### Email Types

1. **Booking Confirmation to Clinic** — Sent when a booking is completed. Contains patient name, service, date/time, and patient phone. Styled HTML email.
2. **Booking Confirmation to Patient** — Sent only if the patient's email is on file. Contains service, date/time, and clinic address.
3. **Missed Call Alert** — Sent when a call ends without a booking. Contains caller number and time.
4. **Team Invite** — Sent when an owner invites a team member. Contains an accept link with a token, valid for 7 days.

#### Flow

1. The Python agent calls `POST /api/notifications/booking-created` or `POST /api/notifications/missed-call` at the end of each call via `aiohttp`. These requests are authenticated with the `X-Agent-Secret` header (shared secret, not JWT).
2. The notifications router fetches the appointment/clinic data from Supabase, then calls the appropriate email service function.
3. The email service lazily initializes the Resend client. If `RESEND_API_KEY` is not set, all email functions no-op gracefully (return `{ success: false, error: 'Email disabled' }`), so the system works without email configured.
4. All email sends are wrapped in try/catch — failures never crash the agent or the backend.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/services/emailService.js` | Resend client wrapper — exports `sendBookingConfirmationToClinic()`, `sendBookingConfirmationToPatient()`, `sendMissedCallAlert()`, `sendTeamInvite()` |
| `platform/backend/src/routes/notifications.js` | Three endpoints: `POST /booking-created`, `POST /missed-call`, `POST /team-invite` — all authenticated via `X-Agent-Secret` header |
| `platform/backend/src/index.js` | Mounts `notificationsRouter` without `authMiddleware` (uses shared secret instead) |
| `agent.py` | `_on_shutdown` — fires aiohttp POST to `/api/notifications/booking-created` or `/api/notifications/missed-call` (fire-and-forget, wrapped in try/except) |

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `RESEND_API_KEY` | Backend `.env` | Resend API key (starts with `re_`). If unset, emails are silently disabled. |
| `FROM_EMAIL` | Backend `.env` | Sender email address (must be verified in Resend) |
| `AGENT_WEBHOOK_SECRET` | Both `.env` files | Shared secret between agent and backend for authenticating notification webhooks |
| `BACKEND_URL` | Agent `.env.local` | URL of the Node.js backend (e.g., `http://localhost:3001`) — agent calls this to trigger emails |

---

## 7. Supabase Write Retry Logic

Ensures critical database writes (bookings, call sessions) survive transient Supabase failures with automatic retries and a fallback audit trail.

### How It Works

1. **Retry Loop** — `supabase_write_with_retry()` wraps a synchronous Supabase write callable in an async retry loop. It attempts the write up to 3 times with exponential backoff (0.5s, 1s, 2s).
2. **Success Path** — On any successful attempt, returns `(True, result)`. If the write succeeded on a retry, an info log is emitted.
3. **Failure Path** — After all 3 retries fail, the function:
   - Logs the error
   - Inserts a row into the `failed_writes` table with `table_name`, `payload_json`, `error`, and `created_at`
   - Returns `(False, last_exception)`
   - **Never raises** — callers always get a tuple back
4. **Recovery** — The `failed_writes` table has a `retried` boolean and `retried_at` timestamp, plus an index on `(retried, created_at)` for efficient recovery queries. A scheduled job or manual process can query unretried failures and replay them.

### Files

| File | Purpose |
|------|---------|
| `utils/supabase_retry.py` | `supabase_write_with_retry()` — the retry wrapper |
| `utils/__init__.py` | Re-exports `supabase_write_with_retry` for clean imports |
| `services/database_service.py` | `book_to_supabase()` — uses the retry wrapper for appointment inserts |
| `agent.py` | `_on_shutdown` — uses the retry wrapper for `call_sessions` inserts |
| `platform/migrations/003_failed_writes_table.sql` | Creates the `failed_writes` table and recovery index |

### Database Schema — `failed_writes`

```sql
CREATE TABLE failed_writes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,
  payload_json TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  retried      BOOLEAN     DEFAULT FALSE,
  retried_at   TIMESTAMPTZ
);
```

### Env Vars

Uses existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## 8. Real-Time Dashboard

Updates the frontend dashboard and calendar within ~1 second of database changes, without polling.

### How It Works

1. **Supabase Realtime** — The `call_sessions` and `appointments` tables are added to the `supabase_realtime` publication (migration 004). This enables Supabase to push INSERT/UPDATE events over WebSocket.
2. **Frontend Hook** — `useRealtimeSync(orgId)` subscribes to a Supabase Realtime channel named `dashboard-sync-{orgId}`. It listens for four event types:
   - `INSERT` on `call_sessions` — invalidates `calls` and `analytics` React Query caches. If the row has no `ended_at`, it's tracked as an active call.
   - `UPDATE` on `call_sessions` — invalidates the same caches. If `ended_at` is now set, the call is removed from the active set.
   - `INSERT` on `appointments` — invalidates the `appointments` cache.
   - `UPDATE` on `appointments` — invalidates the `appointments` cache.
3. **Active Call Counter** — The hook maintains a `Set<string>` of active call IDs. It exposes `activeCalls` (count) and `isConnected` (boolean).
4. **Header Indicator** — The `Header` component renders:
   - A green pulsing dot with call count when `activeCalls > 0`
   - A grey dot when connected but idle
   - Nothing when disconnected
5. **Graceful Degradation** — If Realtime is unavailable, `isConnected` stays `false` and the existing 30-second React Query polling continues working.

### Files

| File | Purpose |
|------|---------|
| `platform/frontend/src/hooks/useRealtimeSync.ts` | Supabase Realtime subscription hook — tracks active calls, invalidates React Query caches |
| `platform/frontend/src/components/layout/Header.tsx` | Live call indicator UI (green pulse / grey dot) |
| `platform/frontend/src/pages/Dashboard.tsx` | Calls `useRealtimeSync(orgId)` for automatic cache invalidation |
| `platform/frontend/src/pages/Calendar.tsx` | Own `useRealtimeSync(orgId)` instance for appointment updates |
| `platform/migrations/004_enable_realtime.sql` | Adds `call_sessions` and `appointments` to Supabase Realtime publication |

### Env Vars

Uses existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (frontend).

---

## 9. Docker & Deployment Infrastructure

Three-container Docker setup with deployment scripts for Ubuntu servers.

### Architecture

```
                  ┌─────────────────┐
                  │   Frontend      │
                  │  (Nginx:80)     │
                  │  Serves SPA     │
                  │  Proxies /api/  │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │    Backend      │
                  │  (Node:3001)    │
                  │  Express API    │
                  └────────┬────────┘
                           │
              ┌────────────▼────────────┐
              │        Agent            │
              │   (Python:host net)     │
              │  LiveKit voice agent    │
              │  UDP media via host     │
              └─────────────────────────┘
```

### Containers

| Service | Base Image | Dockerfile | Network | Notes |
|---------|-----------|------------|---------|-------|
| `agent` | `python:3.11-slim` | `Dockerfile.agent` | `host` | Host networking for LiveKit UDP media ports |
| `backend` | `node:20-alpine` | `platform/Dockerfile.backend` | Bridge (port 3001) | `npm ci --omit=dev` for production |
| `frontend` | Multi-stage: `node:20-alpine` build + `nginx:alpine` serve | `platform/Dockerfile.frontend` | Bridge (port 80) | Vite builds with `VITE_*` build args, Nginx serves static + proxies `/api/` |

### Nginx Configuration

- `/` — Serves the Vite-built SPA from `/usr/share/nginx/html` with `try_files $uri $uri/ /index.html` for client-side routing
- `/api/` — Reverse proxies to `http://backend:3001` with real IP forwarding headers
- `/health` — Proxies to the backend health check

### Deployment Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-server.sh` | First-time Ubuntu server provisioning — installs Docker, Docker Compose v2, Certbot, configures UFW firewall (SSH 22, HTTP 80, HTTPS 443, UDP 10000-60000 for LiveKit media), creates `/opt/voiceai` directory |
| `scripts/deploy.sh` | Ongoing deployments — `git pull`, `docker compose build`, `docker compose up -d`, `docker image prune -f`, prints status |

### Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Three-service compose file with env_file references and network config |
| `Dockerfile.agent` | Python agent container |
| `platform/Dockerfile.backend` | Node.js backend container |
| `platform/Dockerfile.frontend` | Multi-stage frontend build and serve container |
| `platform/nginx.conf` | Nginx config for SPA routing and API proxy |
| `.dockerignore` | Excludes `__pycache__`, `*.pyc`, `.env.local`, `node_modules`, `.git`, `*.log` |
| `scripts/setup-server.sh` | Server provisioning script |
| `scripts/deploy.sh` | Deployment automation script |
| `DEPLOYMENT.md` | Full deployment walkthrough — Oracle/Hetzner provisioning, SSL, Twilio webhook config, troubleshooting |

### Env Vars for Docker Build

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Build arg for frontend container | Supabase project URL (embedded at build time) |
| `VITE_SUPABASE_ANON_KEY` | Build arg for frontend container | Supabase anonymous key (embedded at build time) |
| `VITE_API_URL` | Build arg for frontend container | Backend API URL (embedded at build time) |

---

## 10. Team Member Invites & RBAC

Role-based access control with email invitations for adding team members to an organization.

### Role Hierarchy

| Role | Can View | Can Create/Edit | Can Delete | Can Manage Team |
|------|----------|-----------------|------------|-----------------|
| `owner` | All | All | All | Yes |
| `admin` | All | Agents, Knowledge | No | No |
| `member` | All | No | No | No |
| `viewer` | All | No | No | No |

### Invite Flow

1. **Owner sends invite** — `POST /api/team/invite` with `{ email, role }`. Backend generates a cryptographic token (`crypto.randomBytes(32)`), stores a `team_members` row with `invite_token` and `invite_expires_at` (7 days), then fires an internal request to `POST /api/notifications/team-invite` to send the invite email via Resend.
2. **Invitee receives email** — Contains a styled "Accept Invitation" button linking to `{FRONTEND_URL}/accept-invite?token=xxx`.
3. **Invitee accepts** — The `AcceptInvite` page:
   - Calls `GET /api/team/accept?token=xxx` to validate the token and show org name + role.
   - If the user already has a Supabase account: shows an "Accept" button.
   - If new user: shows email + password form to create an account.
   - On submit: `POST /api/team/accept` creates the Supabase user (if needed), links the `user_id`, sets `joined_at`, and clears the token.
4. **Resend invite** — `POST /api/team/resend-invite/:memberId` generates a fresh token and sends a new email.
5. **Remove member** — `DELETE /api/team/:memberId` (owner only). Cannot remove the owner.
6. **Change role** — `PATCH /api/team/:memberId/role` (owner only). Cannot change the owner's role.

### Auth Middleware Integration

The `authMiddleware` in `auth.js` performs a two-step lookup:
1. First checks if the user is an organization owner (`organizations.owner_id = user.id`).
2. If not, checks `team_members` for a joined membership (`user_id` match + `joined_at IS NOT NULL`).
3. Sets `req.orgId`, `req.org`, and `req.userRole` for downstream middleware and routes.

### Role Enforcement

The `requireRole(...allowedRoles)` middleware checks `req.userRole` against the allowed list and returns 403 with `{ error, required, current }` if unauthorized. Applied to:
- Agent delete: `requireRole('owner')`
- Number delete: `requireRole('owner')`
- Agent/knowledge create and update: `requireRole('owner', 'admin')`

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/routes/team.js` | Full team management API — `teamPublicRouter` (accept endpoints, no auth) and `router` (CRUD, JWT auth) |
| `platform/backend/src/middleware/auth.js` | JWT auth + owner/team member lookup — sets `req.userRole` |
| `platform/backend/src/middleware/requireRole.js` | `requireRole(...roles)` middleware factory |
| `platform/backend/src/routes/notifications.js` | `POST /team-invite` — sends invite email via Resend |
| `platform/backend/src/services/emailService.js` | `sendTeamInvite()` — styled invite email with accept link |
| `platform/frontend/src/pages/settings/Team.tsx` | Team management UI — invite dialog, member list with role dropdown, resend and remove actions |
| `platform/frontend/src/pages/AcceptInvite.tsx` | Invite acceptance page — token validation, new account creation, accept flow |
| `platform/frontend/src/App.tsx` | Routes — `/accept-invite` as public route (no auth required) |
| `platform/migrations/005_team_members.sql` | Creates `team_members` table, indexes, and RLS policy |

### Database Schema — `team_members`

```sql
CREATE TABLE team_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invite_token     TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invited_by       UUID REFERENCES auth.users(id),
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

RLS policy: Organization owners and the member themselves can read their rows.

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `FRONTEND_URL` | Backend `.env` | Used to construct the invite accept link in emails |
| `RESEND_API_KEY` | Backend `.env` | Required for sending invite emails |
| `AGENT_WEBHOOK_SECRET` | Backend `.env` | Used internally by team invite notification endpoint |

---

## 11. Knowledge Base URL Scraping

Automatically imports website content into the knowledge base by scraping URLs and splitting content into articles.

### How It Works

1. **User submits URL** — Frontend sends `POST /api/knowledge/:clinicId/import-url` with `{ url }`.
2. **Validation** — The URL is validated against:
   - Protocol must be `http:` or `https:`
   - Hostname must not be `localhost`, `127.*`, `192.168.*`, `10.*`, or `172.16-31.*` (SSRF protection)
3. **Job creation** — A `scrape_jobs` row is created with `status: 'pending'`, and the response returns immediately with `202 { jobId }`.
4. **Async scraping** — A fire-and-forget async function:
   - Updates job status to `processing`
   - Checks `robots.txt` for the target URL (respects `Disallow` rules for `*` and `voiceai` user agents)
   - Launches headless Chromium via `puppeteer-core` + `@sparticuz/chromium-min`
   - Navigates to the URL with `VoiceAI-KnowledgeBot/1.0` user agent
   - Strips noise elements (nav, header, footer, scripts, sidebars, cookie banners, modals)
   - Splits content at H1/H2/H3 heading boundaries into sections
   - Cleans whitespace, filters sections < 20 chars, truncates each to 2000 chars, limits to 15 sections
   - Inserts each section as a `knowledge_articles` row with `category: 'Imported'`
   - Updates job status to `done` with `articles_created` count
   - On error: updates job status to `failed` with error type (`timeout` or `fetch_failed`)
5. **Progress polling** — Frontend polls `GET /api/knowledge/:clinicId/scrape-status/:jobId` every 2 seconds until status is `done` or `failed`.
6. **UI feedback** — Shows spinner during processing, success message with article count, or specific error messages for `robots_disallowed`, `timeout`, and generic failures. Invalidates React Query cache on completion.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/services/scraperService.js` | `isValidScrapableUrl()`, `checkRobotsTxt()`, `scrapeUrl()` — Puppeteer-based scraper with SSRF protection and robots.txt compliance |
| `platform/backend/src/routes/knowledge.js` | `POST /:clinicId/import-url` — creates job and fires async scrape; `GET /:clinicId/scrape-status/:jobId` — returns job progress |
| `platform/frontend/src/pages/KnowledgeBase.tsx` | Import URL tab — URL input, progress polling, success/error display |
| `platform/migrations/006_scrape_jobs.sql` | Creates `scrape_jobs` table |

### Database Schema — `scrape_jobs`

```sql
CREATE TABLE scrape_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID NOT NULL,
  organization_id  UUID NOT NULL,
  url              TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  articles_created INTEGER DEFAULT 0,
  error            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
```

### Env Vars

No additional env vars. Uses existing Supabase credentials. Chromium binary is bundled via `@sparticuz/chromium-min`.

---

## 12. Agent Test Call (Browser-to-Agent)

Allows testing a live agent directly from the browser via WebRTC, without needing a phone.

### How It Works

1. **Initiate** — User clicks "Test Call" on the agent overview page. Frontend sends `POST /api/agents/:id/test-call`.
2. **Backend generates room + token** — The route:
   - Verifies the agent belongs to the user's org
   - Creates a unique LiveKit room name: `test-{agentId-prefix}-{timestamp}`
   - Generates a LiveKit `AccessToken` for the browser participant (10 min TTL, with publish/subscribe grants)
   - Uses `AgentDispatchClient` to dispatch the agent to the room with metadata: `{ clinic_id, agent_id, test_mode: true }`
   - Returns `{ roomName, token, livekitUrl }`
3. **Browser connects** — `TestCallModal` creates a `livekit-client` `Room` instance, connects with the token, and enables the microphone.
4. **Call UI** — State machine with 5 states: `idle -> connecting -> connected -> ended | error`
   - Connected state shows: green pulsing indicator, audio visualizer bars, duration timer, mute toggle, end call button
   - 15-second timeout for agent connection — if no participant joins, shows error
5. **Agent-side handling** — `agent.py` reads `test_mode` from job metadata. In test mode:
   - Skips `call_sessions` insert (no analytics pollution)
   - Skips notification HTTP calls (no email spam)
   - Skips Sentry breadcrumbs
   - Logs `[TEST CALL] Test call completed` instead
6. **Cleanup** — On modal close or unmount, the Room is disconnected, timers are cleared.

### Files

| File | Purpose |
|------|---------|
| `platform/backend/src/routes/agents.js` | `POST /:id/test-call` — generates room, token, dispatches agent |
| `platform/frontend/src/components/TestCallModal.tsx` | Full test call modal — LiveKit room connection, audio UI, state machine, mute, timer |
| `platform/frontend/src/pages/AgentOverview.tsx` | "Test Call" button (shown only when agent is live) |
| `agent.py` | `test_mode` handling — skips analytics, notifications, and Sentry for test calls |

### Env Vars

| Variable | Where | Description |
|----------|-------|-------------|
| `LIVEKIT_URL` | Backend `.env` | LiveKit server URL (e.g., `wss://your-project.livekit.cloud`) |
| `LIVEKIT_API_KEY` | Backend `.env` | LiveKit API key |
| `LIVEKIT_API_SECRET` | Backend `.env` | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | Backend `.env` | Agent name registered with LiveKit (default: `voice-agent`) |

---

## 13. Cancel / Reschedule Appointment Flow

Enables callers to find, cancel, or reschedule existing appointments through the voice agent.

### How It Works

#### State Tracking

Three new fields on `PatientState` (`models/state.py`):
- `appointment_action: Optional[str]` — `'cancelling'`, `'rescheduling'`, or `None`
- `found_appointment_id: Optional[str]` — UUID of the appointment found by lookup
- `found_appointment_details: Optional[Dict]` — Full appointment data for confirmation

#### Intent Detection

In `_on_user_transcribed` (`agent.py`), after the final transcript is captured:
- Keywords like `cancel`, `cancellation`, `cancel my` set `state.appointment_action = 'cancelling'`
- Keywords like `reschedule`, `change my appointment`, `move my appointment`, `different time`, `different day` set `state.appointment_action = 'rescheduling'`

This primes the state before the LLM processes the turn, helping it select the right tool.

#### LLM Tools (all in `tools/assistant_tools.py`)

1. **`find_existing_appointment()`** — Searches appointments by `clinic_id` + `status IN (scheduled, confirmed)` + `start_time > NOW()`. Looks up by `patient_phone` (E.164) or `patient_name` (ILIKE). Sets `state.found_appointment_id` and `state.found_appointment_details`. Returns formatted details or asks for more info.

2. **`cancel_appointment_tool(confirmed: bool = False)`** — Guards against missing `found_appointment_id`. If `confirmed=False`, asks for confirmation. If confirmed, updates appointment `status = 'cancelled'` with reason in notes via `supabase_write_with_retry`. Clears state and returns confirmation message.

3. **`reschedule_appointment_tool(new_time: Optional[str] = None, confirmed: bool = False)`** — Parses the new time using existing scheduling logic. Checks slot availability. If the slot is taken, offers alternatives. If confirmed, updates `start_time` and `end_time` (preserving original duration) via `supabase_write_with_retry`. Clears state and returns confirmation.

#### System Prompt

The SYSTEM_PROMPT workflow section includes explicit 5-step instructions:
> For cancel/reschedule: Say "I can help with that." then IMMEDIATELY call find_existing_appointment. Confirm the appointment details with the caller. For cancel: call cancel_appointment_tool. For reschedule: call reschedule_appointment_tool(new_time). Never ask for name/phone again if already captured.

### Files

| File | Purpose |
|------|---------|
| `models/state.py` | `appointment_action`, `found_appointment_id`, `found_appointment_details` fields on `PatientState` |
| `tools/assistant_tools.py` | `find_existing_appointment()`, `cancel_appointment_tool()`, `reschedule_appointment_tool()` — LLM function tools |
| `agent.py` | Intent detection in `_on_user_transcribed`; system prompt workflow instructions |
| `services/appointment_management_service.py` | `find_appointment_by_phone()`, `cancel_appointment()`, `reschedule_appointment()` — Supabase queries |

### Env Vars

Uses existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## 14. Automated Test Suite

pytest-based test suite covering booking flow, state transitions, and cancel/reschedule tools.

### Test Structure

All tests use `unittest.IsolatedAsyncioTestCase` (matching the existing project convention) with mocks at the `tools.assistant_tools` import level. No real network calls or `.env.local` required.

#### `tests/test_booking_flow.py` — 9 tests

| Class | Test | What It Verifies |
|-------|------|-----------------|
| `BookingHappyPathTests` | `test_complete_booking_happy_path` | Full 5-step booking flow: name -> reason -> time -> phone -> confirm |
| | `test_name_normalization` | Name input "jOHN dOE" normalizes to "John Doe" |
| | `test_reason_sets_duration` | Reason maps to correct appointment duration |
| `BookingEdgeCaseTests` | `test_date_without_time_prompts_for_time` | Date-only input returns "What time works?" |
| | `test_slot_taken_returns_alternatives` | Unavailable slot returns alternative suggestions |
| | `test_phone_confirmation_declined_asks_for_alternative` | Declining caller ID prompts for manual entry |
| | `test_booking_without_complete_state_fails_gracefully` | Incomplete state returns "still need" message |
| | `test_booking_supabase_failure_returns_retry_message` | DB failure returns "having trouble saving" |
| | `test_duplicate_booking_is_idempotent` | Second booking attempt on booked state returns existing ID |

#### `tests/test_state_transitions.py` — 31 tests

| Class | Tests | What It Verifies |
|-------|-------|-----------------|
| `InitialStateTests` | 3 | Default values, duration, time_status |
| `MissingSlotsTests` | 4 | `missing_slots()` with various field combinations |
| `IsCompleteTests` | 4 | `is_complete()` with/without required fields |
| `SlotSummaryTests` | 3 | `slot_summary()` formatting |
| `RejectedSlotsTests` | 2 | `add_rejected_slot()` / `is_slot_rejected()` |
| `RememberUserTextTests` | 4 | Transcript history tracking and limits |
| `ContactPhaseGatingTests` | 4 | `contact_phase_allowed()` logic |
| `AppointmentActionFieldTests` | 3 | New `appointment_action` field |
| `DetailedStateForPromptTests` | 4 | `detailed_state_for_prompt()` output |

#### `tests/test_cancel_reschedule.py` — 18 tests

| Class | Tests | What It Verifies |
|-------|-------|-----------------|
| `FindExistingAppointmentTests` | 4 | Find by phone, not found, no phone, detected phone fallback |
| `CancelAppointmentTests` | 4 | Without finding, unconfirmed, confirmed (verifies Supabase args), DB failure |
| `RescheduleAppointmentTests` | 6 | Without finding, no time, unconfirmed, confirmed, slot taken with alternatives, parse failure |
| `IntentDetectionTests` | 4 | Cancel keyword, reschedule keyword, "different time", no match |

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-mock

# Run all tests
pytest tests/ -v --tb=short

# Run a specific test file
pytest tests/test_booking_flow.py -v

# Run a specific test class
pytest tests/test_cancel_reschedule.py::CancelAppointmentTests -v
```

### Files

| File | Purpose |
|------|---------|
| `pytest.ini` | pytest configuration — `asyncio_mode = auto`, test discovery settings, log level |
| `tests/conftest.py` | `sys.path` setup — adds project root for imports |
| `tests/test_booking_flow.py` | 9 booking flow tests (happy path + edge cases) |
| `tests/test_state_transitions.py` | 31 `PatientState` dataclass behavior tests |
| `tests/test_cancel_reschedule.py` | 18 cancel/reschedule tool and intent detection tests |
| `requirements.txt` | Test dependencies: `pytest>=7.0.0`, `pytest-asyncio>=0.23.0`, `pytest-mock>=3.12.0` |

### Env Vars

No env vars required. All external dependencies are mocked.

---

## 15. Environment Variables Reference

### Agent (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_URL` | Yes | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | No | Agent name (default: `telephony_agent_v3`) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o-mini |
| `LLM_MODEL` | No | LLM model name (default: `gpt-4o-mini`) |
| `LLM_TEMPERATURE` | No | LLM temperature (default: `0.85`) |
| `LLM_MAX_TOKENS` | No | Max response tokens (default: `200`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (full access) |
| `DEMO_CLINIC_ID` | No | Fallback clinic UUID for testing |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `ENVIRONMENT` | No | Environment name (default: `development`) |
| `VERSION` | No | Release version string (default: `unknown`) |
| `AGENT_WEBHOOK_SECRET` | Yes* | Shared secret for notification webhooks (*required if email notifications are enabled) |
| `BACKEND_URL` | Yes* | Node.js backend URL (*required if email notifications are enabled) |

### Backend (`platform/backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `TWILIO_ACCOUNT_SID` | Yes* | Twilio Account SID (*required for phone number management) |
| `TWILIO_AUTH_TOKEN` | Yes* | Twilio Auth Token |
| `TWILIO_TRUNKING_SID` | No | Twilio SIP Trunk SID |
| `STRIPE_SECRET_KEY` | No | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook verification secret |
| `FRONTEND_URL` | Yes | Frontend URL for CORS and email links (e.g., `http://localhost:5173`) |
| `PORT` | No | Server port (default: `3001`) |
| `SENTRY_DSN` | No | Sentry DSN for backend error tracking |
| `NODE_ENV` | No | Node environment (default: `development`) |
| `RESEND_API_KEY` | No | Resend API key for email notifications |
| `FROM_EMAIL` | No | Sender email address (must be Resend-verified) |
| `AGENT_WEBHOOK_SECRET` | Yes* | Shared secret for agent-to-backend notifications |
| `LIVEKIT_URL` | Yes* | LiveKit URL (*required for test call feature) |
| `LIVEKIT_API_KEY` | Yes* | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes* | LiveKit API secret |
| `LIVEKIT_AGENT_NAME` | No | Agent dispatch name (default: `voice-agent`) |

### Frontend (build-time, via `VITE_*`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (embedded at build time) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (embedded at build time) |
| `VITE_API_URL` | Yes | Backend API base URL (embedded at build time) |

### Database Migrations Required

Run these migrations in order in your Supabase SQL editor:

1. `platform/migrations/003_failed_writes_table.sql` — Failed writes recovery table
2. `platform/migrations/004_enable_realtime.sql` — Enable Realtime on call_sessions and appointments
3. `platform/migrations/005_team_members.sql` — Team members table with RLS
4. `platform/migrations/006_scrape_jobs.sql` — URL scraping jobs table
