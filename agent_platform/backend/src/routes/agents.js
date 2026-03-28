import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';

const router = Router();

// GET /api/agents
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        clinic:clinics(*),
        settings:agent_settings(*),
        phone_number:phone_numbers(*)
      `)
      .eq('organization_id', req.orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// GET /api/agents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        clinic:clinics(*),
        settings:agent_settings(*),
        phone_number:phone_numbers(*)
      `)
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Agent not found' });
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/agents
router.post('/', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...req.body, organization_id: req.orgId })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

// PUT /api/agents/:id
router.put('/:id', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { settings, ...agentData } = req.body;

    // Update agent
    const { data, error } = await supabase
      .from('agents')
      .update({ ...agentData, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;

    // Update settings if provided
    if (settings) {
      await supabase
        .from('agent_settings')
        .update(settings)
        .eq('agent_id', req.params.id);
    }

    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/agents/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['live', 'paused', 'draft'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('agents')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/agents/:id/test-call
router.post('/:id/test-call', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify agent belongs to this org and load clinic_id
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, clinic_id, status')
      .eq('id', id)
      .eq('organization_id', req.orgId)
      .single();

    if (agentErr || !agent) return res.status(404).json({ error: 'Agent not found' });

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const agentName = process.env.LIVEKIT_AGENT_NAME || 'voice-agent';

    if (!livekitUrl || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'LiveKit is not configured on this server' });
    }

    const roomName = `test-${id.slice(0, 8)}-${Date.now()}`;
    const identity = `user-${req.user.id.slice(0, 8)}`;

    // Build browser access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: '10m',
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    // Dispatch the agent to the room
    const dispatchClient = new AgentDispatchClient(livekitUrl, { apiKey, apiSecret });
    await dispatchClient.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({
        clinic_id: agent.clinic_id,
        agent_id: agent.id,
        test_mode: true,
      }),
    });

    res.json({ roomName, token, livekitUrl });
  } catch (err) { next(err); }
});

// DELETE /api/agents/:id
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

export default router;
