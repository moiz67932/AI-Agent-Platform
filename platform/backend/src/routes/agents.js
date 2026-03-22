import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// GET /api/agents
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        clinic:clinics(*),
        settings:agent_settings(*),
        phone_number:phone_numbers(*)
      `)
      .eq('organization_id', req.orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// GET /api/agents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        clinic:clinics(*),
        settings:agent_settings(*),
        phone_number:phone_numbers(*)
      `)
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Agent not found' });
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/agents
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...req.body, organization_id: req.orgId })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { settings, ...agentData } = req.body;

    // Update agent
    const { data, error } = await supabase
      .from('agents')
      .update({ ...agentData, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;

    // Update settings if provided
    if (settings) {
      await supabase
        .from('agent_settings')
        .update(settings)
        .eq('agent_id', req.params.id);
    }

    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/agents/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['live', 'paused', 'draft'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('agents')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/agents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

export default router;
