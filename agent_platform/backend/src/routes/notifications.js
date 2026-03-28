import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import {
  sendBookingConfirmationToClinic,
  sendBookingConfirmationToPatient,
  sendMissedCallAlert,
  sendTeamInvite,
} from '../services/emailService.js';

const router = Router();

// Shared secret middleware — NOT JWT auth, used by the Python agent
function agentSecretAuth(req, res, next) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[notifications] AGENT_WEBHOOK_SECRET not set — rejecting request');
    return res.status(503).json({ error: 'Notifications not configured' });
  }
  if (req.headers['x-agent-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/notifications/booking-created
router.post('/booking-created', agentSecretAuth, async (req, res, next) => {
  try {
    const { appointment_id, clinic_id } = req.body;
    if (!clinic_id) return res.status(400).json({ error: 'clinic_id required' });

    // Fetch the most recent appointment for this clinic (appointment_id may be null)
    let apptQuery = supabase
      .from('appointments')
      .select('*, clinic:clinics(id, name, email, address_line1, city)')
      .eq('clinic_id', clinic_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (appointment_id) {
      apptQuery = supabase
        .from('appointments')
        .select('*, clinic:clinics(id, name, email, address_line1, city)')
        .eq('id', appointment_id)
        .single();
    }

    const { data, error } = appointment_id
      ? await apptQuery
      : await apptQuery.then(r => ({ data: r.data?.[0] || null, error: r.error }));

    if (error) {
      console.error('[notifications] Appointment fetch error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch appointment' });
    }
    if (!data) return res.status(404).json({ error: 'Appointment not found' });

    const appointment = data;
    const clinic = appointment.clinic || {};
    const clinicEmail = clinic.email;
    const clinicName = clinic.name || 'Your Clinic';

    // Fetch agent name if agent_id present (best-effort)
    let agentName = 'AI Receptionist';
    if (appointment.agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name')
        .eq('id', appointment.agent_id)
        .single();
      if (agent?.name) agentName = agent.name;
    }

    // Fire emails — fire and forget internally, but await to collect results
    const results = await Promise.allSettled([
      clinicEmail
        ? sendBookingConfirmationToClinic(appointment, clinicEmail, clinicName, agentName)
        : Promise.resolve({ success: false, error: 'No clinic email' }),
      appointment.patient_email
        ? sendBookingConfirmationToPatient(appointment, appointment.patient_email, clinicName)
        : Promise.resolve({ success: false, error: 'No patient email' }),
    ]);

    const [clinicResult, patientResult] = results.map(r =>
      r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }
    );

    console.log(`[notifications] booking-created: clinic=${clinicResult.success}, patient=${patientResult.success}`);
    res.json({ sent: true, clinic: clinicResult, patient: patientResult });
  } catch (err) { next(err); }
});

// POST /api/notifications/missed-call
router.post('/missed-call', agentSecretAuth, async (req, res, next) => {
  try {
    const { clinic_id, caller_number, called_at } = req.body;
    if (!clinic_id) return res.status(400).json({ error: 'clinic_id required' });

    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('name, email')
      .eq('id', clinic_id)
      .single();

    if (error || !clinic) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
    if (!clinic.email) {
      return res.json({ sent: false, reason: 'No clinic email on file' });
    }

    const result = await sendMissedCallAlert(
      clinic.email,
      clinic.name || 'Your Clinic',
      caller_number,
      called_at || new Date().toISOString(),
    );

    console.log(`[notifications] missed-call: success=${result.success}`);
    res.json({ sent: result.success, ...result });
  } catch (err) { next(err); }
});

// POST /api/notifications/team-invite
router.post('/team-invite', agentSecretAuth, async (req, res, next) => {
  try {
    const { email, organization_name, role, invite_token, invited_by_name } = req.body;
    if (!email || !invite_token) return res.status(400).json({ error: 'email and invite_token required' });

    const result = await sendTeamInvite(email, organization_name || 'your organization', role || 'member', invite_token, invited_by_name);
    console.log(`[notifications] team-invite: success=${result.success}`);
    res.json({ sent: result.success, ...result });
  } catch (err) { next(err); }
});

export default router;
