import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// GET /api/appointments
router.get('/', async (req, res, next) => {
  try {
    const { clinic_id, start_date, end_date, status } = req.query;

    // Get org's clinic IDs
    let clinicFilter = supabase.from('clinics').select('id').eq('organization_id', req.orgId);
    if (clinic_id) clinicFilter = clinicFilter.eq('id', clinic_id);
    const { data: clinics } = await clinicFilter;
    const clinicIds = clinics?.map(c => c.id) || [];

    if (clinicIds.length === 0) return res.json({ data: [] });

    let query = supabase
      .from('appointments')
      .select('*')
      .in('clinic_id', clinicIds)
      .order('start_time', { ascending: true });

    if (start_date) query = query.gte('start_time', start_date);
    if (end_date) query = query.lte('start_time', end_date);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// POST /api/appointments
router.post('/', async (req, res, next) => {
  try {
    // Get first clinic for org if not provided
    let clinicId = req.body.clinic_id;
    if (!clinicId) {
      const { data: clinics } = await supabase
        .from('clinics')
        .select('id')
        .eq('organization_id', req.orgId)
        .limit(1);
      clinicId = clinics?.[0]?.id;
    }

    if (!clinicId) return res.status(400).json({ error: 'No clinic found for organization' });

    const { data, error } = await supabase
      .from('appointments')
      .insert({ ...req.body, clinic_id: clinicId })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

// PUT /api/appointments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ data: { cancelled: true } });
  } catch (err) { next(err); }
});

export default router;
