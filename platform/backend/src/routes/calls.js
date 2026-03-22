import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// GET /api/calls
router.get('/', async (req, res, next) => {
  try {
    const {
      agent_id, outcome, start_date, end_date,
      page = '1', per_page = '25',
    } = req.query;

    const pageNum = parseInt(page);
    const perPage = parseInt(per_page);
    const from = (pageNum - 1) * perPage;

    let query = supabase
      .from('call_sessions')
      .select(`
        *,
        agent:agents(id, name),
        appointment:appointments(id, patient_name, reason, start_time)
      `, { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(from, from + perPage - 1);

    // Filter by org via clinic
    const { data: clinics } = await supabase
      .from('clinics')
      .select('id')
      .eq('organization_id', req.orgId);
    const clinicIds = clinics?.map(c => c.id) || [];

    if (clinicIds.length === 0) return res.json({ data: [], total: 0, page: pageNum, per_page: perPage });

    query = query.in('clinic_id', clinicIds);

    if (agent_id) query = query.eq('agent_id', agent_id);
    if (outcome) query = query.eq('outcome', outcome);
    if (start_date) query = query.gte('started_at', start_date);
    if (end_date) query = query.lte('started_at', end_date);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data: data || [], total: count || 0, page: pageNum, per_page: perPage });
  } catch (err) { next(err); }
});

// GET /api/calls/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data: call, error } = await supabase
      .from('call_sessions')
      .select(`
        *,
        agent:agents(id, name),
        appointment:appointments(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!call) return res.status(404).json({ error: 'Call not found' });

    // Fetch transcript
    const { data: transcripts } = await supabase
      .from('call_transcripts')
      .select('*')
      .eq('call_id', req.params.id)
      .order('created_at', { ascending: true });

    const result = {
      ...call,
      transcript: (transcripts || []).map(t => ({
        id: t.id,
        speaker: t.speaker === 'agent' ? 'ai' : 'caller',
        text: t.text,
        timestamp: t.created_at,
        stt_latency_ms: t.stt_latency_ms,
        llm_latency_ms: t.llm_latency_ms,
        tts_latency_ms: t.tts_latency_ms,
      })),
    };

    res.json({ data: result });
  } catch (err) { next(err); }
});

export default router;
