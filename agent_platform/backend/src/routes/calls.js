import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import {
  getRawStatusesForOutcome,
  matchAppointmentToCall,
  serializeCallLog,
} from '../lib/callData.js';

const router = Router();

async function fetchAppointmentsForCalls(orgId, calls, scopedAgent) {
  if (!calls?.length) return [];

  const clinicIds = [...new Set(calls.map((call) => call.clinic_id).filter(Boolean))];
  const timestamps = calls
    .flatMap((call) => [call.created_at, call.ended_at])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  const minTimestamp = timestamps.length ? Math.min(...timestamps) : Date.now();
  const maxTimestamp = timestamps.length ? Math.max(...timestamps) : Date.now();
  const bufferMs = 6 * 60 * 60 * 1000;

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('organization_id', orgId)
    .gte('created_at', new Date(minTimestamp - bufferMs).toISOString())
    .lte('created_at', new Date(maxTimestamp + bufferMs).toISOString())
    .order('created_at', { ascending: true });

  if (scopedAgent?.id) {
    if (scopedAgent.clinic_id) {
      query = query.or(`agent_id.eq.${scopedAgent.id},and(agent_id.is.null,clinic_id.eq.${scopedAgent.clinic_id})`);
    } else {
      query = query.eq('agent_id', scopedAgent.id);
    }
  } else if (clinicIds.length === 1) {
    query = query.eq('clinic_id', clinicIds[0]);
  } else if (clinicIds.length > 1) {
    query = query.in('clinic_id', clinicIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

router.get('/', async (req, res, next) => {
  try {
    const {
      agent_id,
      outcome,
      min_duration,
      max_duration,
      start_date,
      end_date,
      page = '1',
      per_page = '25',
    } = req.query;

    const pageNum = Number.parseInt(page, 10) || 1;
    const perPage = Number.parseInt(per_page, 10) || 25;
    const from = (pageNum - 1) * perPage;

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
        return res.json({ data: [], total: 0, page: pageNum, per_page: perPage });
      }
      scopedAgent = agent;
    }

    let query = supabase
      .from('call_logs')
      .select(
        `
          *,
          agent:agents(id, name, status, clinic_id, phone_number)
        `,
        { count: 'exact' }
      )
      .eq('organization_id', req.orgId)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1);

    if (scopedAgent?.id) query = query.eq('agent_id', scopedAgent.id);
    if (min_duration) query = query.gte('duration_seconds', Number(min_duration));
    if (max_duration) query = query.lte('duration_seconds', Number(max_duration));
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    if (outcome) {
      const rawStatuses = getRawStatusesForOutcome(outcome);
      if (rawStatuses.length) query = query.in('status', rawStatuses);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const calls = data || [];
    const appointments = await fetchAppointmentsForCalls(req.orgId, calls, scopedAgent);
    const serializedCalls = calls
      .map((call) => serializeCallLog(call, matchAppointmentToCall(call, appointments)));

    res.json({ data: serializedCalls, total: count || 0, page: pageNum, per_page: perPage });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data: call, error } = await supabase
      .from('call_logs')
      .select(
        `
          *,
          agent:agents(id, name, status, clinic_id, phone_number)
        `
      )
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (error) throw error;
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const appointments = await fetchAppointmentsForCalls(req.orgId, [call], call.agent_id ? { id: call.agent_id, clinic_id: call.clinic_id } : null);
    const matchedAppointment = matchAppointmentToCall(call, appointments);

    const { data: transcripts, error: transcriptError } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('call_id', req.params.id)
      .order('created_at', { ascending: true });

    if (transcriptError) throw transcriptError;

    const serializedCall = serializeCallLog(call, matchedAppointment);

    res.json({
      data: {
        ...serializedCall,
        transcript: (transcripts || []).map((entry) => ({
          id: entry.id,
          speaker: entry.speaker === 'agent' ? 'ai' : 'caller',
          text: entry.text,
          timestamp: entry.utterance_time || entry.created_at,
          stt_latency_ms: entry.stt_latency_ms,
          llm_latency_ms: entry.llm_latency_ms,
          tts_latency_ms: entry.tts_latency_ms,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
