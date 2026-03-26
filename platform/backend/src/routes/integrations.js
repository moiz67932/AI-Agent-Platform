import { Router } from 'express';
import { initTwilio } from '../services/twilioService.js';

const router = Router();

// GET /api/integrations
router.get('/', async (req, res) => {
  res.json({
    data: {
      twilio: {
        connected: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        status: 'active',
      },
      supabase: { connected: true, status: 'core' },
      webhooks: { connected: false, status: 'inactive' },
    },
  });
});

// POST /api/integrations/twilio/test
router.post('/twilio/test', async (req, res) => {
  const { account_sid, auth_token } = req.body;
  if (!account_sid || !auth_token) {
    return res.status(400).json({ error: 'Account SID and Auth Token required' });
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(account_sid, auth_token);
    await client.api.accounts(account_sid).fetch();
    res.json({ data: { connected: true } });
  } catch {
    res.status(400).json({ error: 'Twilio connection failed' });
  }
});

export default router;
