import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { purchaseNumber, releaseNumber, searchAvailableNumbers, initTwilio } from '../services/twilioService.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toE164(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// GET /api/numbers
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('organization_id', req.orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// GET /api/numbers/search — search available numbers via Twilio
router.get('/search', async (req, res, next) => {
  try {
    const { country = 'US', area_code } = req.query;
    const numbers = await searchAvailableNumbers(country, area_code || null);
    res.json({ data: numbers });
  } catch (err) { next(err); }
});

// POST /api/numbers/provision — purchase via Twilio then save to DB
router.post('/provision', async (req, res, next) => {
  try {
    const { phone_number, label, agent_id, clinic_id } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const e164 = toE164(phone_number);

    // Purchase via Twilio if client is configured
    let providerSid = null;
    const tw = initTwilio();
    if (tw) {
      const purchased = await purchaseNumber(e164);
      providerSid = purchased.sid;
    }

    const { data, error } = await supabase
      .from('phone_numbers')
      .insert({
        organization_id: req.orgId,
        clinic_id: clinic_id || null,
        agent_id: agent_id || null,
        phone_number: e164,
        phone_e164: e164,
        label: label || null,
        status: 'active',
        monthly_cost: 0,
        // stored in telnyx_id column until a rename migration runs (provider_sid)
        telnyx_id: providerSid,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/numbers/:id — update label or assign agent
router.patch('/:id', async (req, res, next) => {
  try {
    const { label, agent_id } = req.body;
    const { data, error } = await supabase
      .from('phone_numbers')
      .update({ label, agent_id })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/numbers/:id — release from Twilio then remove from DB
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    // Fetch the record first to get the provider SID
    const { data: record, error: fetchError } = await supabase
      .from('phone_numbers')
      .select('telnyx_id')
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (fetchError) throw fetchError;

    // Release from Twilio if we have a SID
    const providerSid = record?.telnyx_id;
    if (providerSid) {
      try {
        await releaseNumber(providerSid);
      } catch (twilioErr) {
        // Log but don't block DB removal — number may already be released
        console.error('Twilio release error (non-fatal):', twilioErr.message);
      }
    }

    const { error } = await supabase
      .from('phone_numbers')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { removed: true } });
  } catch (err) { next(err); }
});

export default router;
