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

    // Attach organization
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('owner_id', user.id)
      .limit(1);

    req.org = orgs?.[0] || null;
    req.orgId = req.org?.id || null;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
