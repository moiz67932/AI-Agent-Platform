import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// GET /api/analytics
router.get('/', async (req, res, next) => {
  try {
    const { start_date, end_date, agent_id } = req.query;

    // Default: last 30 days
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60000).toISOString();
    const endDate = end_date || new Date().toISOString();

    // Get org's clinic IDs
    const { data: clinics } = await supabase
      .from('clinics')
      .select('id')
      .eq('organization_id', req.orgId);
    const clinicIds = clinics?.map(c => c.id) || [];

    if (clinicIds.length === 0) {
      return res.json({
        data: {
          total_calls: 0, total_bookings: 0, booking_rate: 0,
          avg_duration: 0, calls_answered: 0, missed_calls: 0,
          calls_by_day: [], calls_by_hour: [], calls_by_weekday: [],
          outcome_breakdown: [], service_breakdown: [],
        },
      });
    }

    // Base query
    let callQuery = supabase
      .from('call_sessions')
      .select('*')
      .in('clinic_id', clinicIds)
      .gte('started_at', startDate)
      .lte('started_at', endDate);

    if (agent_id) callQuery = callQuery.eq('agent_id', agent_id);

    const { data: calls } = await callQuery;
    const allCalls = calls || [];

    // Aggregate
    const total_calls = allCalls.length;
    const booked = allCalls.filter(c => c.outcome === 'booked');
    const total_bookings = booked.length;
    const booking_rate = total_calls > 0 ? (total_bookings / total_calls) * 100 : 0;
    const answered = allCalls.filter(c => c.outcome !== 'missed');
    const calls_answered = answered.length;
    const missed_calls = allCalls.filter(c => c.outcome === 'missed').length;
    const durations = allCalls.map(c => c.duration_seconds || 0);
    const avg_duration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Calls by day
    const byDay = {};
    allCalls.forEach(c => {
      const day = c.started_at?.slice(0, 10);
      if (!day) return;
      if (!byDay[day]) byDay[day] = { date: day, calls: 0, booked: 0 };
      byDay[day].calls++;
      if (c.outcome === 'booked') byDay[day].booked++;
    });
    const calls_by_day = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    // Calls by hour
    const byHour = {};
    allCalls.forEach(c => {
      const hour = new Date(c.started_at).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    });
    const calls_by_hour = Object.entries(byHour).map(([hour, count]) => ({ hour: parseInt(hour), count }));

    // Calls by weekday
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byWeekday = {};
    allCalls.forEach(c => {
      const day = weekdays[new Date(c.started_at).getDay()];
      byWeekday[day] = (byWeekday[day] || 0) + 1;
    });
    const calls_by_weekday = weekdays.map(day => ({ day, count: byWeekday[day] || 0 }));

    // Outcome breakdown
    const outcomeCount = {};
    allCalls.forEach(c => {
      outcomeCount[c.outcome] = (outcomeCount[c.outcome] || 0) + 1;
    });
    const outcome_breakdown = Object.entries(outcomeCount).map(([outcome, count]) => ({ outcome, count }));

    // Service breakdown from appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('reason, status')
      .in('clinic_id', clinicIds)
      .gte('created_at', startDate);

    const serviceMap = {};
    (appts || []).forEach(a => {
      if (!serviceMap[a.reason]) serviceMap[a.reason] = { service: a.reason, requested: 0, booked: 0, avg_duration: 1800 };
      serviceMap[a.reason].requested++;
      if (['scheduled', 'confirmed', 'completed'].includes(a.status)) serviceMap[a.reason].booked++;
    });
    const service_breakdown = Object.values(serviceMap).slice(0, 10);

    res.json({
      data: {
        total_calls, total_bookings, booking_rate, avg_duration: Math.round(avg_duration),
        calls_answered, missed_calls, calls_by_day, calls_by_hour, calls_by_weekday,
        outcome_breakdown, service_breakdown,
      },
    });
  } catch (err) { next(err); }
});

export default router;
