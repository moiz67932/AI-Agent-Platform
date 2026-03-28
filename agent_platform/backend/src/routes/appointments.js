import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

function serializeAppointment(row) {
  if (!row) return row;

  return {
    ...row,
    patient_phone: row.patient_phone || row.patient_phone_masked || null,
  };
}

function normalizeAppointmentPayload(body, clinicId, organizationId) {
  const { patient_phone, patient_phone_masked, ...rest } = body;

  return {
    ...rest,
    organization_id: organizationId,
    clinic_id: clinicId,
    patient_phone_masked: patient_phone ?? patient_phone_masked ?? null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { clinic_id, start_date, end_date, status } = req.query;

    let query = supabase
      .from('appointments')
      .select('*')
      .eq('organization_id', req.orgId)
      .order('start_time', { ascending: true });

    if (clinic_id) query = query.eq('clinic_id', clinic_id);
    if (start_date) query = query.gte('start_time', start_date);
    if (end_date) query = query.lte('start_time', end_date);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: (data || []).map(serializeAppointment) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    let clinicId = req.body.clinic_id;

    if (clinicId) {
      const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .select('id')
        .eq('id', clinicId)
        .eq('organization_id', req.orgId)
        .single();

      if (clinicError) throw clinicError;
      if (!clinic) return res.status(404).json({ error: 'Clinic not found' });
    } else {
      const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .select('id')
        .eq('organization_id', req.orgId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (clinicError) throw clinicError;
      if (!clinic) return res.status(400).json({ error: 'No clinic found for organization' });
      clinicId = clinic.id;
    }

    const payload = normalizeAppointmentPayload(req.body, clinicId, req.orgId);

    const { data, error } = await supabase
      .from('appointments')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json({ data: serializeAppointment(data) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existingQuery = await supabase
      .from('appointments')
      .select('id, clinic_id')
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (existingQuery.error) throw existingQuery.error;
    if (!existingQuery.data) return res.status(404).json({ error: 'Appointment not found' });

    const payload = normalizeAppointmentPayload(req.body, existingQuery.data.clinic_id, req.orgId);

    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ data: serializeAppointment(data) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { cancelled: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
