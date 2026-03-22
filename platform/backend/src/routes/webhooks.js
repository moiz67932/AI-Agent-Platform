import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// POST /api/webhooks/configure
router.post('/configure', async (req, res, next) => {
  try {
    const { url, secret, events } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Store in a simple JSON field on the organization (or a dedicated table)
    const { data, error } = await supabase
      .from('organizations')
      .update({ webhook_config: { url, secret, events: events || [], active: true } })
      .eq('id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data: { configured: true } });
  } catch (err) { next(err); }
});

// GET /api/webhooks/logs
router.get('/logs', async (req, res, next) => {
  try {
    // In production: query a webhook_logs table
    res.json({ data: [] });
  } catch (err) { next(err); }
});

export default router;
