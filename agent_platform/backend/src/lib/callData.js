const BOOKING_STATUSES = new Set(['scheduled', 'confirmed', 'completed']);

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

export function normalizeCallOutcome(status) {
  const value = String(status || '').trim().toLowerCase();

  if (!value) return 'info_only';
  if (['booked', 'booking_confirmed', 'appointment_booked'].includes(value)) return 'booked';
  if (['missed', 'no_answer', 'abandoned', 'unanswered'].includes(value)) return 'missed';
  if (['transferred', 'transfer', 'forwarded'].includes(value)) return 'transferred';
  if (['voicemail', 'voice_mail'].includes(value)) return 'voicemail';
  if (['error', 'failed', 'failure'].includes(value)) return 'error';
  if (['info_only', 'completed', 'answered', 'resolved', 'initiated', 'in_progress', 'ringing'].includes(value)) return 'info_only';

  return 'info_only';
}

export function getRawStatusesForOutcome(outcome) {
  const value = String(outcome || '').trim().toLowerCase();

  if (value === 'booked') return ['booked', 'booking_confirmed', 'appointment_booked'];
  if (value === 'missed') return ['missed', 'no_answer', 'abandoned', 'unanswered'];
  if (value === 'transferred') return ['transferred', 'transfer', 'forwarded'];
  if (value === 'voicemail') return ['voicemail', 'voice_mail'];
  if (value === 'error') return ['error', 'failed', 'failure'];
  if (value === 'info_only') return ['info_only', 'completed', 'answered', 'resolved', 'initiated', 'in_progress', 'ringing'];

  return [];
}

export function isBookedAppointmentStatus(status) {
  return BOOKING_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function normalizeAgentRecord(record) {
  if (!record) return record;

  return {
    ...record,
    phone_number: Array.isArray(record.phone_number) ? (record.phone_number[0] ?? null) : (record.phone_number ?? null),
    settings: Array.isArray(record.settings) ? (record.settings[0] ?? null) : (record.settings ?? null),
  };
}

export function serializeAppointment(record) {
  if (!record) return null;

  return {
    ...record,
    patient_phone: record.patient_phone ?? record.patient_phone_masked ?? record.caller_phone ?? null,
    service_requested: record.service_requested ?? record.reason ?? null,
    appointment_at: record.appointment_at ?? record.start_time ?? null,
  };
}

export function matchAppointmentToCall(call, appointments) {
  if (!call || !appointments?.length) return null;

  const callCreatedAt = safeDate(call.created_at);
  const callPhone = normalizePhone(call.caller_phone);

  const ranked = appointments
    .map((appointment) => {
      let score = 0;

      if (appointment.call_log_id && appointment.call_log_id === call.id) score += 1000;
      if (appointment.agent_id && call.agent_id && appointment.agent_id === call.agent_id) score += 100;
      if (appointment.clinic_id && call.clinic_id && appointment.clinic_id === call.clinic_id) score += 25;

      const appointmentPhone = normalizePhone(appointment.patient_phone_masked ?? appointment.caller_phone);
      if (callPhone && appointmentPhone && callPhone === appointmentPhone) score += 200;

      const appointmentCreatedAt = safeDate(appointment.created_at);
      const diffMs = callCreatedAt && appointmentCreatedAt
        ? Math.abs(callCreatedAt.getTime() - appointmentCreatedAt.getTime())
        : Number.MAX_SAFE_INTEGER;

      if (diffMs <= 15 * 60 * 1000) score += 120;
      else if (diffMs <= 60 * 60 * 1000) score += 40;
      else if (diffMs <= 6 * 60 * 60 * 1000) score += 10;

      return { appointment, score, diffMs };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.diffMs - right.diffMs;
    });

  return ranked[0]?.appointment ?? null;
}

export function serializeCallLog(record, appointment) {
  const startedAt = record.created_at;
  const endedAt = record.ended_at ?? null;
  const startedDate = safeDate(startedAt);
  const endedDate = safeDate(endedAt);
  const fallbackDuration = startedDate && endedDate
    ? Math.max(0, Math.round((endedDate.getTime() - startedDate.getTime()) / 1000))
    : 0;

  return {
    ...record,
    caller_number: record.caller_phone ?? null,
    caller_name: appointment?.patient_name ?? appointment?.caller_name ?? null,
    outcome: normalizeCallOutcome(record.status),
    duration_seconds: record.duration_seconds ?? fallbackDuration,
    started_at: startedAt,
    ended_at: endedAt,
    response_time_ms: null,
    appointment: serializeAppointment(appointment),
    agent: normalizeAgentRecord(record.agent),
  };
}
