import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import {
  isBookedAppointmentStatus,
  matchAppointmentToCall,
  normalizeCallOutcome,
} from '../lib/callData.js';

const router = Router();

const WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function emptyAnalytics() {
  return {
    total_calls: 0,
    total_bookings: 0,
    booking_rate: 0,
    avg_duration: 0,
    calls_answered: 0,
    missed_calls: 0,
    calls_by_day: [],
    calls_by_hour: [],
    calls_by_weekday: WEEKDAY_ORDER.map((day) => ({ day, count: 0 })),
    outcome_breakdown: [],
    outcomes: {},
    service_breakdown: [],
    services_by_day: [],
    service_days: [],
    source_breakdown: [],
    agent_breakdown: [],
  };
}

function startOfDayIso(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatDayKey(value) {
  return value.toISOString().slice(0, 10);
}

function createDaySeries(startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, agent_id } = req.query;
    const startDate = start_date || startOfDayIso(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date || new Date().toISOString();

    let scopedAgent = null;
    if (agent_id) {
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id, clinic_id')
        .eq('id', agent_id)
        .eq('organization_id', req.orgId)
        .single();

      if (agentError) throw agentError;
      if (!agent) {
        return res.json({ data: emptyAnalytics() });
      }

      scopedAgent = agent;
    }

    let callsQuery = supabase
      .from('call_logs')
      .select('id, agent_id, clinic_id, status, duration_seconds, created_at, ended_at')
      .eq('organization_id', req.orgId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    if (scopedAgent?.id) {
      callsQuery = callsQuery.eq('agent_id', scopedAgent.id);
    }

    const { data: calls, error: callsError } = await callsQuery;
    if (callsError) throw callsError;

    let appointmentsQuery = supabase
      .from('appointments')
      .select('id, agent_id, clinic_id, status, source, reason, service_requested, created_at, start_time, appointment_at, call_log_id, patient_phone_masked, caller_phone')
      .eq('organization_id', req.orgId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    if (scopedAgent?.id) {
      if (scopedAgent.clinic_id) {
        appointmentsQuery = appointmentsQuery.or(`agent_id.eq.${scopedAgent.id},and(agent_id.is.null,clinic_id.eq.${scopedAgent.clinic_id})`);
      } else {
        appointmentsQuery = appointmentsQuery.eq('agent_id', scopedAgent.id);
      }
    }

    const { data: appointments, error: appointmentError } = await appointmentsQuery;
    if (appointmentError) throw appointmentError;

    const allCalls = calls || [];
    const allAppointments = appointments || [];
    const matchedAppointmentsByCall = new Map();
    for (const call of allCalls) {
      matchedAppointmentsByCall.set(call.id, matchAppointmentToCall(call, allAppointments));
    }

    const durations = [];
    const byDay = new Map();
    const byHour = new Map();
    const byWeekday = new Map();
    const outcomes = new Map();
    const agentBreakdown = new Map();

    for (const call of allCalls) {
      const createdAt = new Date(call.created_at);
      if (Number.isNaN(createdAt.getTime())) continue;

      const normalizedOutcome = normalizeCallOutcome(call.status);
      const duration = call.duration_seconds ?? (
        call.ended_at ? Math.max(0, Math.round((new Date(call.ended_at).getTime() - createdAt.getTime()) / 1000)) : 0
      );
      const dayKey = formatDayKey(createdAt);
      const dayEntry = byDay.get(dayKey) || { date: dayKey, calls: 0, booked: 0 };

      dayEntry.calls += 1;
      if (normalizedOutcome === 'booked' || matchedAppointmentsByCall.get(call.id)) {
        dayEntry.booked += 1;
      }
      byDay.set(dayKey, dayEntry);

      byHour.set(createdAt.getHours(), (byHour.get(createdAt.getHours()) || 0) + 1);
      byWeekday.set(WEEKDAY_ORDER[createdAt.getDay()], (byWeekday.get(WEEKDAY_ORDER[createdAt.getDay()]) || 0) + 1);
      outcomes.set(normalizedOutcome, (outcomes.get(normalizedOutcome) || 0) + 1);

      durations.push(duration);

      if (call.agent_id) {
        const entry = agentBreakdown.get(call.agent_id) || {
          agent_id: call.agent_id,
          calls: 0,
          booked: 0,
          missed_calls: 0,
          total_duration: 0,
        };
        entry.calls += 1;
        entry.total_duration += duration;
        if (normalizedOutcome === 'booked' || matchedAppointmentsByCall.get(call.id)) entry.booked += 1;
        if (normalizedOutcome === 'missed') entry.missed_calls += 1;
        agentBreakdown.set(call.agent_id, entry);
      }
    }

    const serviceBreakdown = new Map();
    const sourceBreakdown = new Map();
    const daySeries = createDaySeries(startDate, endDate);
    const dayIndex = new Map(daySeries.map((day, index) => [formatDayKey(day), index]));
    const servicesByDay = new Map();

    for (const appointment of allAppointments) {
      const serviceName = appointment.service_requested || appointment.reason || 'Unspecified';
      const entry = serviceBreakdown.get(serviceName) || {
        service: serviceName,
        requested: 0,
        booked: 0,
        avg_duration: 0,
        _totalDuration: 0,
      };
      entry.requested += 1;
      if (isBookedAppointmentStatus(appointment.status)) entry.booked += 1;

      if (appointment.call_log_id) {
        const matchedCall = allCalls.find((call) => call.id === appointment.call_log_id);
        if (matchedCall?.duration_seconds) {
          entry._totalDuration += matchedCall.duration_seconds;
        }
      }

      serviceBreakdown.set(serviceName, entry);

      const source = appointment.source || 'unknown';
      sourceBreakdown.set(source, (sourceBreakdown.get(source) || 0) + 1);

      const appointmentDate = new Date(appointment.start_time || appointment.appointment_at || appointment.created_at);
      const bucketKey = Number.isNaN(appointmentDate.getTime()) ? null : formatDayKey(appointmentDate);
      if (bucketKey && dayIndex.has(bucketKey)) {
        const row = servicesByDay.get(serviceName) || Array.from({ length: daySeries.length }, () => 0);
        row[dayIndex.get(bucketKey)] += 1;
        servicesByDay.set(serviceName, row);
      }
    }

    const totalCalls = allCalls.length;
    const totalBookings = allAppointments.filter((appointment) => isBookedAppointmentStatus(appointment.status)).length;
    const missedCalls = allCalls.filter((call) => normalizeCallOutcome(call.status) === 'missed').length;
    const callsAnswered = Math.max(0, totalCalls - missedCalls);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;
    const totalSources = Array.from(sourceBreakdown.values()).reduce((sum, value) => sum + value, 0);

    res.json({
      data: {
        total_calls: totalCalls,
        total_bookings: totalBookings,
        booking_rate: totalCalls > 0 ? (totalBookings / totalCalls) * 100 : 0,
        avg_duration: avgDuration,
        calls_answered: callsAnswered,
        missed_calls: missedCalls,
        calls_by_day: daySeries.map((day) => {
          const key = formatDayKey(day);
          return byDay.get(key) || { date: key, calls: 0, booked: 0 };
        }),
        calls_by_hour: Array.from(byHour.entries())
          .map(([hour, count]) => ({ hour: Number(hour), count }))
          .sort((left, right) => left.hour - right.hour),
        calls_by_weekday: WEEKDAY_ORDER.map((day) => ({ day, count: byWeekday.get(day) || 0 })),
        outcome_breakdown: Array.from(outcomes.entries())
          .map(([outcome, count]) => ({ outcome, count }))
          .sort((left, right) => right.count - left.count),
        outcomes: Object.fromEntries(outcomes.entries()),
        service_breakdown: Array.from(serviceBreakdown.values())
          .map(({ _totalDuration, ...entry }) => ({
            ...entry,
            avg_duration: entry.requested > 0 ? Math.round(_totalDuration / entry.requested) : 0,
          }))
          .sort((left, right) => right.requested - left.requested),
        services_by_day: Array.from(servicesByDay.entries())
          .map(([service, data]) => ({ service, data }))
          .sort((left, right) => right.data.reduce((sum, value) => sum + value, 0) - left.data.reduce((sum, value) => sum + value, 0)),
        service_days: daySeries.map((day) => day.toLocaleDateString('en-US', { weekday: 'short' })),
        source_breakdown: Array.from(sourceBreakdown.entries())
          .map(([source, count]) => ({
            source,
            count,
            pct: totalSources > 0 ? Math.round((count / totalSources) * 100) : 0,
          }))
          .sort((left, right) => right.count - left.count),
        agent_breakdown: Array.from(agentBreakdown.values())
          .map((agent) => ({
            agent_id: agent.agent_id,
            calls: agent.calls,
            booked: agent.booked,
            booking_rate: agent.calls > 0 ? (agent.booked / agent.calls) * 100 : 0,
            avg_duration: agent.calls > 0 ? Math.round(agent.total_duration / agent.calls) : 0,
            missed_calls: agent.missed_calls,
          }))
          .sort((left, right) => right.calls - left.calls),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
