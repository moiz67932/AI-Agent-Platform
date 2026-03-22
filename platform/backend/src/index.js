import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
config();

import agentsRouter from './routes/agents.js';
import knowledgeRouter from './routes/knowledge.js';
import callsRouter from './routes/calls.js';
import appointmentsRouter from './routes/appointments.js';
import numbersRouter from './routes/numbers.js';
import analyticsRouter from './routes/analytics.js';
import webhooksRouter from './routes/webhooks.js';
import integrationsRouter from './routes/integrations.js';
import onboardingRouter from './routes/onboarding.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean) }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes (all protected except health)
app.use('/api/onboarding', authMiddleware, onboardingRouter);
app.use('/api/agents', authMiddleware, agentsRouter);
app.use('/api/knowledge', authMiddleware, knowledgeRouter);
app.use('/api/calls', authMiddleware, callsRouter);
app.use('/api/appointments', authMiddleware, appointmentsRouter);
app.use('/api/numbers', authMiddleware, numbersRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/webhooks', authMiddleware, webhooksRouter);
app.use('/api/integrations', authMiddleware, integrationsRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ VoiceAI Backend running on http://localhost:${PORT}`);
});

export default app;
