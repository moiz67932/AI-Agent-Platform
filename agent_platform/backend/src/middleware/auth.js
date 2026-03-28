import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;

    // First: try owner lookup
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('owner_id', user.id)
      .limit(1);

    if (orgs?.[0]) {
      req.org = orgs[0];
      req.orgId = orgs[0].id;
      req.userRole = 'owner';
      return next();
    }

    // Second: check if user is a team member
    const { data: membership } = await supabase
      .from('team_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('joined_at', 'is', null)
      .limit(1);

    if (membership?.[0]) {
      const { data: memberOrgs } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', membership[0].organization_id)
        .limit(1);

      req.org = memberOrgs?.[0] || null;
      req.orgId = req.org?.id || null;
      req.userRole = membership[0].role;
    } else {
      req.org = null;
      req.orgId = null;
      req.userRole = null;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
