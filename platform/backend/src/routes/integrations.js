import { Router } from 'express';

const router = Router();

// GET /api/integrations
router.get('/', async (req, res) => {
  res.json({
    data: {
      telnyx: { connected: !!process.env.TELNYX_API_KEY, status: 'active' },
      supabase: { connected: true, status: 'core' },
      webhooks: { connected: false, status: 'inactive' },
    },
  });
});

// POST /api/integrations/telnyx/test
router.post('/telnyx/test', async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ error: 'API key required' });

  try {
    // In production: call Telnyx verification endpoint
    res.json({ data: { connected: true } });
  } catch {
    res.status(400).json({ error: 'Telnyx connection failed' });
  }
});

export default router;
