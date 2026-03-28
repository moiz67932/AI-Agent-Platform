CREATE TABLE IF NOT EXISTS team_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invite_token     TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invited_by       UUID REFERENCES auth.users(id),
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_members_org_idx   ON team_members(organization_id);
CREATE INDEX IF NOT EXISTS team_members_user_idx  ON team_members(user_id);
CREATE INDEX IF NOT EXISTS team_members_token_idx ON team_members(invite_token);

-- RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_select ON team_members
  FOR SELECT USING (
    organization_id = (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
    OR user_id = auth.uid()
  );
