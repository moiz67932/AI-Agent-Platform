import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

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

    let query = supabase
      .from('call_sessions')
      .select(
        `
          *,
          agent:agents(id, name),
          appointment:appointments(id, patient_name, reason, start_time)
        `,
        { count: 'exact' }
      )
      .eq('organization_id', req.orgId)
      .order('started_at', { ascending: false })
      .range(from, from + perPage - 1);

    if (agent_id) query = query.eq('agent_id', agent_id);
    if (outcome) query = query.eq('outcome', outcome);
    if (min_duration) query = query.gte('duration_seconds', Number(min_duration));
    if (max_duration) query = query.lte('duration_seconds', Number(max_duration));
    if (start_date) query = query.gte('started_at', start_date);
    if (end_date) query = query.lte('started_at', end_date);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data: data || [], total: count || 0, page: pageNum, per_page: perPage });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data: call, error } = await supabase
      .from('call_sessions')
      .select(
        `
          *,
          agent:agents(id, name),
          appointment:appointments(*)
        `
      )
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (error) throw error;
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const { data: transcripts, error: transcriptError } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('call_id', req.params.id)
      .order('created_at', { ascending: true });

    if (transcriptError) throw transcriptError;

    res.json({
      data: {
        ...call,
        transcript: (transcripts || []).map((entry) => ({
          id: entry.id,
          speaker: entry.speaker === 'agent' ? 'ai' : 'caller',
          text: entry.text,
          timestamp: entry.created_at,
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
