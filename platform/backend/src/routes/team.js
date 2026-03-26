import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/supabase.js';
import { requireRole } from '../middleware/requireRole.js';

// ─── Public router (GET/POST /accept — no JWT required) ───────────────────────
export const teamPublicRouter = Router();

// GET /api/team/accept?token=xxx
teamPublicRouter.get('/accept', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { data: member, error } = await supabase
      .from('team_members')
      .select('email, role, organization_id')
      .eq('invite_token', token)
      .gt('invite_expires_at', new Date().toISOString())
      .single();

    if (error || !member) return res.status(400).json({ error: 'Invalid or expired invite' });

    const { data: orgs } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', member.organization_id)
      .limit(1);

    res.json({
      email: member.email,
      organization_name: orgs?.[0]?.name || 'Your Organization',
      role: member.role,
      token,
    });
  } catch (err) { next(err); }
});

// POST /api/team/accept
teamPublicRouter.post('/accept', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, email, organization_id')
      .eq('invite_token', token)
      .gt('invite_expires_at', new Date().toISOString())
      .single();

    if (error || !member) return res.status(400).json({ error: 'Invalid or expired invite' });

    // Check if a Supabase user already exists with this email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(u => u.email === member.email);

    let userId;
    if (existing) {
      userId = existing.id;
    } else {
      if (!password) return res.status(400).json({ error: 'Password required for new account' });
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: member.email,
        password,
        email_confirm: true,
      });
      if (createErr) return res.status(400).json({ error: createErr.message });
      userId = created.user.id;
    }

    const { error: updateErr } = await supabase
      .from('team_members')
      .update({
        user_id: userId,
        joined_at: new Date().toISOString(),
        invite_token: null,
        invite_expires_at: null,
      })
      .eq('id', member.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, email: member.email });
  } catch (err) { next(err); }
});

// ─── Authenticated router (authMiddleware applied in index.js) ─────────────────
const router = Router();

// GET /api/team
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('organization_id', req.orgId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// POST /api/team/invite
router.post('/invite', async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, member, or viewer' });
    }

    // Conflict check
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('organization_id', req.orgId)
      .eq('email', email)
      .limit(1);

    if (existing?.length > 0) {
      return res.status(409).json({ error: 'This email already has a pending or active invite for this organization' });
    }

    const invite_token = crypto.randomBytes(32).toString('hex');
    const invite_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: member, error } = await supabase
      .from('team_members')
      .insert({
        organization_id: req.orgId,
        user_id: null,
        email,
        role,
        invite_token,
        invite_expires_at,
        invited_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Send invite email via internal notification endpoint
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const secret = process.env.AGENT_WEBHOOK_SECRET || '';

    const { data: orgs } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', req.orgId)
      .limit(1);

    try {
      await fetch(`${backendUrl}/api/notifications/team-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Secret': secret },
        body: JSON.stringify({
          email,
          organization_name: orgs?.[0]?.name || 'Your Organization',
          role,
          invite_token,
          invited_by_name: req.user.user_metadata?.full_name || req.user.email,
        }),
      });
    } catch (notifyErr) {
      console.warn('[team] Invite email failed (non-fatal):', notifyErr.message);
    }

    res.status(201).json({ data: member });
  } catch (err) { next(err); }
});

// POST /api/team/resend-invite/:memberId
router.post('/resend-invite/:memberId', async (req, res, next) => {
  try {
    const invite_token = crypto.randomBytes(32).toString('hex');
    const invite_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: member, error } = await supabase
      .from('team_members')
      .update({ invite_token, invite_expires_at })
      .eq('id', req.params.memberId)
      .eq('organization_id', req.orgId)
      .is('joined_at', null)
      .select()
      .single();

    if (error || !member) return res.status(404).json({ error: 'Pending invite not found' });

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const secret = process.env.AGENT_WEBHOOK_SECRET || '';

    const { data: orgs } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', req.orgId)
      .limit(1);

    try {
      await fetch(`${backendUrl}/api/notifications/team-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Secret': secret },
        body: JSON.stringify({
          email: member.email,
          organization_name: orgs?.[0]?.name || 'Your Organization',
          role: member.role,
          invite_token,
          invited_by_name: req.user.user_metadata?.full_name || req.user.email,
        }),
      });
    } catch (notifyErr) {
      console.warn('[team] Resend invite email failed (non-fatal):', notifyErr.message);
    }

    res.json({ data: member });
  } catch (err) { next(err); }
});

// DELETE /api/team/:memberId — owner only
router.delete('/:memberId', requireRole('owner'), async (req, res, next) => {
  try {
    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('id', req.params.memberId)
      .eq('organization_id', req.orgId)
      .single();

    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.role === 'owner') return res.status(400).json({ error: 'Cannot remove the owner' });

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', req.params.memberId)
      .eq('organization_id', req.orgId);

    if (error) throw error;
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// PATCH /api/team/:memberId/role — owner only
router.patch('/:memberId/role', requireRole('owner'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, member, or viewer' });
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('id', req.params.memberId)
      .eq('organization_id', req.orgId)
      .single();

    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.role === 'owner') return res.status(400).json({ error: "Cannot change the owner's role" });

    const { data: updated, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', req.params.memberId)
      .eq('organization_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ data: updated });
  } catch (err) { next(err); }
});

export default router;
