import { Router } from 'express';
import { supabase } from '../services/supabase.js';

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

// POST /api/numbers/provision — register a Twilio number the user already owns
router.post('/provision', async (req, res, next) => {
  try {
    const { phone_number, label, agent_id, clinic_id } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const e164 = toE164(phone_number);

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

// DELETE /api/numbers/:id — remove number
router.delete('/:id', async (req, res, next) => {
  try {
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
