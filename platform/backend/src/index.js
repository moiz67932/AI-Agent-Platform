import { config } from 'dotenv';
config();

// Sentry must be initialized before any other imports
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 0.1,
  // Only capture 5xx errors — filter out 4xx client errors
  beforeSend(event, hint) {
    const status = hint?.originalException?.status;
    if (status && status < 500) return null;
    return event;
  },
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import agentsRouter from './routes/agents.js';
import knowledgeRouter from './routes/knowledge.js';
import callsRouter from './routes/calls.js';
import appointmentsRouter from './routes/appointments.js';
import numbersRouter from './routes/numbers.js';
import analyticsRouter from './routes/analytics.js';
import webhooksRouter from './routes/webhooks.js';
import integrationsRouter from './routes/integrations.js';
import onboardingRouter from './routes/onboarding.js';
import notificationsRouter from './routes/notifications.js';
import teamRouter, { teamPublicRouter } from './routes/team.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { globalLimiter, authLimiter, orgLimiter } from './middleware/rateLimiter.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Sentry tracing — auto-instrumented via Sentry.init in v8+

// Attach org context to Sentry scope when available
app.use((req, _res, next) => {
  if (req.orgId) {
    Sentry.getCurrentScope().setTag('org_id', req.orgId);
  }
  next();
});

// Core middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean) }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Global rate limiter (excludes /health — applied before health route)
app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);

// Health check (no rate limiting)
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Team accept routes — public (no JWT auth), must be mounted BEFORE authMiddleware team routes
app.use('/api/team', teamPublicRouter);
// Team management — authenticated
app.use('/api/team', authMiddleware, teamRouter);

// API routes (all protected except health)
app.use('/api/onboarding', authMiddleware, onboardingRouter);
app.use('/api/agents', authMiddleware, agentsRouter);
app.use('/api/knowledge', authMiddleware, orgLimiter, knowledgeRouter);
app.use('/api/calls', authMiddleware, callsRouter);
app.use('/api/appointments', authMiddleware, appointmentsRouter);
app.use('/api/numbers', authMiddleware, numbersRouter);
app.use('/api/analytics', authMiddleware, orgLimiter, analyticsRouter);
app.use('/api/webhooks', authMiddleware, webhooksRouter);
app.use('/api/integrations', authMiddleware, integrationsRouter);
// Notifications — no JWT auth, uses X-Agent-Secret shared secret
app.use('/api/notifications', notificationsRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Existing error handler first, then Sentry's
app.use(errorHandler);
Sentry.setupExpressErrorHandler(app, {
  shouldHandleError(error) {
    return !error.status || error.status >= 500;
  },
});

app.listen(PORT, () => {
  console.log(`✅ VoiceAI Backend running on http://localhost:${PORT}`);
});

export default app;
