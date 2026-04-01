import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireRole } from '../middleware/requireRole.js';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';

const DEPLOY_API_URL = (process.env.DEPLOY_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

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

// POST /api/agents/:id/publish-async  — proxies to Python deploy API
router.post('/:id/publish-async', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { data: agent, error: fetchErr } = await supabase
      .from('agents')
      .select('id, status, phone_number')
      .eq('id', id)
      .eq('organization_id', req.orgId)
      .single();
    if (fetchErr || !agent) return res.status(404).json({ error: 'Agent not found' });

    if (agent.status === 'live' && agent.phone_number) {
      return res.json({ agent_id: id, status: 'live', phone_number: agent.phone_number });
    }

    const deployRes = await fetch(`${DEPLOY_API_URL}/api/agents/${id}/publish-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = await deployRes.json();
    if (!deployRes.ok) {
      return res.status(deployRes.status).json(payload);
    }
    res.json(payload);
  } catch (err) { next(err); }
});

// GET /api/agents/:id/status  — proxies to Python deploy API
router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { error: fetchErr } = await supabase
      .from('agents')
      .select('id')
      .eq('id', id)
      .eq('organization_id', req.orgId)
      .single();
    if (fetchErr) return res.status(404).json({ error: 'Agent not found' });

    const deployRes = await fetch(`${DEPLOY_API_URL}/api/agents/${id}/status`);
    const payload = await deployRes.json();
    res.status(deployRes.status).json(payload);
  } catch (err) { next(err); }
});

// DELETE /api/agents/:id
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the agent belongs to this org first
    const { data: agent, error: fetchErr } = await supabase
      .from('agents')
      .select('id, status, port, phone_number, twilio_phone_sid, livekit_trunk_id, livekit_dispatch_rule_id')
      .eq('id', id)
      .eq('organization_id', req.orgId)
      .single();
    if (fetchErr || !agent) return res.status(404).json({ error: 'Agent not found' });

    // If the agent has infra deployed, unpublish it from the server first
    const hasInfra = agent.status === 'live' || agent.status === 'deploying' ||
      agent.port || agent.twilio_phone_sid || agent.livekit_trunk_id || agent.livekit_dispatch_rule_id;

    if (hasInfra) {
      try {
        const deployRes = await fetch(`${DEPLOY_API_URL}/api/agents/${id}/unpublish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!deployRes.ok) {
          const body = await deployRes.text();
          console.error(`[delete-agent] unpublish returned ${deployRes.status}: ${body}`);
          // Continue with DB delete even if unpublish partially fails
        }
      } catch (unpublishErr) {
        console.error(`[delete-agent] unpublish failed for agent ${id}:`, unpublishErr);
        // Continue — we still want to remove the DB record
      }
    }

    // Delete from Supabase (cascades to agent_settings, etc. via FK)
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

export default router;
