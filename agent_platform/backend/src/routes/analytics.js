import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

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
    calls_by_weekday: [],
    outcome_breakdown: [],
    service_breakdown: [],
    agent_breakdown: [],
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, agent_id } = req.query;
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();

    let scopedAgentId = null;
    if (agent_id) {
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id')
        .eq('id', agent_id)
        .eq('organization_id', req.orgId)
        .single();

      if (agentError) throw agentError;
      if (!agent) {
        return res.json({ data: emptyAnalytics() });
      }

      scopedAgentId = agent.id;
    }

    let callQuery = supabase
      .from('call_sessions')
      .select('id, agent_id, outcome, duration_seconds, started_at')
      .eq('organization_id', req.orgId)
      .gte('started_at', startDate)
      .lte('started_at', endDate);

    if (scopedAgentId) {
      callQuery = callQuery.eq('agent_id', scopedAgentId);
    }

    const { data: calls, error: callsError } = await callQuery;
    if (callsError) throw callsError;

    const allCalls = calls || [];
    const totalCalls = allCalls.length;
    const bookedCalls = allCalls.filter((call) => call.outcome === 'booked');
    const answeredCalls = allCalls.filter((call) => call.outcome !== 'missed');
    const durations = allCalls.map((call) => call.duration_seconds || 0);

    const byDay = new Map();
    const byHour = new Map();
    const byWeekday = new Map();
    const outcomeCount = new Map();
    const agentBreakdown = new Map();
    const weekdayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const call of allCalls) {
      const startedAt = new Date(call.started_at);
      const dayKey = call.started_at?.slice(0, 10);
      const hourKey = startedAt.getHours();
      const weekdayKey = weekdayOrder[startedAt.getDay()];

      if (dayKey) {
        const existingDay = byDay.get(dayKey) || { date: dayKey, calls: 0, booked: 0 };
        existingDay.calls += 1;
        if (call.outcome === 'booked') existingDay.booked += 1;
        byDay.set(dayKey, existingDay);
      }

      byHour.set(hourKey, (byHour.get(hourKey) || 0) + 1);
      byWeekday.set(weekdayKey, (byWeekday.get(weekdayKey) || 0) + 1);
      outcomeCount.set(call.outcome, (outcomeCount.get(call.outcome) || 0) + 1);

      if (call.agent_id) {
        const existingAgent = agentBreakdown.get(call.agent_id) || {
          agent_id: call.agent_id,
          calls: 0,
          booked: 0,
          missed_calls: 0,
          total_duration: 0,
        };
        existingAgent.calls += 1;
        existingAgent.total_duration += call.duration_seconds || 0;
        if (call.outcome === 'booked') existingAgent.booked += 1;
        if (call.outcome === 'missed') existingAgent.missed_calls += 1;
        agentBreakdown.set(call.agent_id, existingAgent);
      }
    }

    let appointmentQuery = supabase
      .from('appointments')
      .select('reason, status, call_session_id')
      .eq('organization_id', req.orgId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (scopedAgentId) {
      const callIds = allCalls.map((call) => call.id);
      if (callIds.length === 0) {
        appointmentQuery = null;
      } else {
        appointmentQuery = appointmentQuery.in('call_session_id', callIds);
      }
    }

    let appointments = [];
    if (appointmentQuery) {
      const { data: appointmentRows, error: appointmentError } = await appointmentQuery;
      if (appointmentError) throw appointmentError;
      appointments = appointmentRows || [];
    }

    const serviceMap = new Map();
    for (const appointment of appointments) {
      const serviceName = appointment.reason || 'Unspecified';
      const existingService = serviceMap.get(serviceName) || {
        service: serviceName,
        requested: 0,
        booked: 0,
        avg_duration: 0,
      };

      existingService.requested += 1;
      if (['scheduled', 'confirmed', 'completed'].includes(appointment.status)) {
        existingService.booked += 1;
      }

      serviceMap.set(serviceName, existingService);
    }

    res.json({
      data: {
        total_calls: totalCalls,
        total_bookings: bookedCalls.length,
        booking_rate: totalCalls > 0 ? (bookedCalls.length / totalCalls) * 100 : 0,
        avg_duration: durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
        calls_answered: answeredCalls.length,
        missed_calls: allCalls.filter((call) => call.outcome === 'missed').length,
        calls_by_day: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
        calls_by_hour: Array.from(byHour.entries())
          .map(([hour, count]) => ({ hour: Number(hour), count }))
          .sort((a, b) => a.hour - b.hour),
        calls_by_weekday: weekdayOrder.map((day) => ({ day, count: byWeekday.get(day) || 0 })),
        outcome_breakdown: Array.from(outcomeCount.entries())
          .map(([outcome, count]) => ({ outcome, count }))
          .sort((a, b) => Number(b.count) - Number(a.count)),
        service_breakdown: Array.from(serviceMap.values())
          .sort((a, b) => b.requested - a.requested),
        agent_breakdown: Array.from(agentBreakdown.values())
          .map((agent) => ({
            agent_id: agent.agent_id,
            calls: agent.calls,
            booked: agent.booked,
            booking_rate: agent.calls > 0 ? (agent.booked / agent.calls) * 100 : 0,
            avg_duration: agent.calls > 0 ? Math.round(agent.total_duration / agent.calls) : 0,
            missed_calls: agent.missed_calls,
          }))
          .sort((a, b) => b.calls - a.calls),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
