import { Router } from 'express';
import { initTelnyx, testTelnyxConnection } from '../services/telnyxService.js';

const router = Router();

// GET /api/integrations
router.get('/', async (req, res) => {
  res.json({
    data: {
      telnyx: {
        connected: initTelnyx(),
        status: 'active',
      },
      supabase: { connected: true, status: 'core' },
      webhooks: { connected: false, status: 'inactive' },
    },
  });
});

// POST /api/integrations/telnyx/test
router.post('/telnyx/test', async (req, res) => {
  const { api_key } = req.body;
  if (!api_key && !initTelnyx()) {
    return res.status(400).json({ error: 'API key is required when TELNYX_API_KEY is not configured' });
  }

  try {
    await testTelnyxConnection(api_key || undefined);
    res.json({ data: { connected: true } });
  } catch {
    res.status(400).json({ error: 'Telnyx connection failed' });
  }
});

export default router;
