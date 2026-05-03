import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { purchaseNumber, releaseNumber, searchAvailableNumbers, initTelnyx } from '../services/telnyxService.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toE164(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function canFallbackToLegacyNumberShape(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('external_number_id') ||
    message.includes('telephony_provider') ||
    message.includes('provider_config_json') ||
    String(error?.code || '').toUpperCase() === 'PGRST204'
  );
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

// GET /api/numbers/search — search available numbers via Telnyx
router.get('/search', async (req, res, next) => {
  try {
    if (!initTelnyx()) {
      return res.status(503).json({ error: 'Telnyx is not configured on this server' });
    }

    const { country = 'US', area_code } = req.query;
    const numbers = await searchAvailableNumbers(country, area_code || null);
    res.set('Cache-Control', 'no-store');
    res.json({ data: numbers });
  } catch (err) { next(err); }
});

// POST /api/numbers/provision — purchase/attach via Telnyx then save to DB
router.post('/provision', async (req, res, next) => {
  try {
    const { phone_number, label, agent_id, clinic_id } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const e164 = toE164(phone_number);

    // Purchase (or confirm ownership) when Telnyx credentials are configured.
    let externalNumberId = null;
    if (initTelnyx()) {
      const purchased = await purchaseNumber(e164);
      externalNumberId = purchased.sid;
    }

    const modernInsert = await supabase
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
        telephony_provider: 'telnyx',
        external_number_id: externalNumberId,
        provider_config_json: {},
      })
      .select()
      .single();

    if (!modernInsert.error) {
      return res.status(201).json({ data: modernInsert.data });
    }

    if (!canFallbackToLegacyNumberShape(modernInsert.error)) {
      throw modernInsert.error;
    }

    const legacyInsert = await supabase
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
        telnyx_id: externalNumberId,
      })
      .select()
      .single();

    if (legacyInsert.error) throw legacyInsert.error;
    return res.status(201).json({ data: legacyInsert.data });
  } catch (err) { next(err); }
});

// PATCH /api/numbers/:id — update label or assign agent
router.patch('/:id', async (req, res, next) => {
  try {
    const { label, agent_id } = req.body;
    const { data: existingNumber, error: existingNumberError } = await supabase
      .from('phone_numbers')
      .select('id, agent_id, clinic_id, label')
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (existingNumberError) throw existingNumberError;
    if (!existingNumber) return res.status(404).json({ error: 'Phone number not found' });

    let resolvedAgentId = existingNumber.agent_id || null;
    let resolvedClinicId = existingNumber.clinic_id || null;

    if (agent_id !== undefined) {
      if (!agent_id) {
        resolvedAgentId = null;
        resolvedClinicId = null;
      } else {
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id, clinic_id')
        .eq('id', agent_id)
        .eq('organization_id', req.orgId)
        .single();

        if (agentError) throw agentError;
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        resolvedAgentId = agent.id;
        resolvedClinicId = agent.clinic_id || null;
      }
    }

    const { data, error } = await supabase
      .from('phone_numbers')
      .update({
        label: label ?? existingNumber.label ?? null,
        agent_id: resolvedAgentId,
        clinic_id: resolvedClinicId,
      })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/numbers/:id — release from Telnyx then remove from DB
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    // Fetch the record first to get the number that should be released.
    let record = null;
    let fetchError = null;

    const modernSelect = await supabase
      .from('phone_numbers')
      .select('phone_number, external_number_id, telnyx_id')
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (!modernSelect.error) {
      record = modernSelect.data;
    } else if (canFallbackToLegacyNumberShape(modernSelect.error)) {
      const legacySelect = await supabase
        .from('phone_numbers')
        .select('phone_number, telnyx_id')
        .eq('id', req.params.id)
        .eq('organization_id', req.orgId)
        .single();
      record = legacySelect.data;
      fetchError = legacySelect.error;
    } else {
      fetchError = modernSelect.error;
    }

    if (fetchError) throw fetchError;

    // Release from Telnyx when configured.
    if (initTelnyx() && record?.phone_number) {
      try {
        await releaseNumber(String(record.phone_number));
      } catch (telnyxErr) {
        // Log but don't block DB removal — number may already be released.
        console.error('Telnyx release error (non-fatal):', telnyxErr.message);
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
