-- RLS Policies for multi-tenant isolation
-- Idempotent: safe to run multiple times

-- ============================================================
-- Helper function: get_user_org_id()
-- Returns the organization_id for the currently authenticated user
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM organizations WHERE owner_id = auth.uid()
$$;


-- ============================================================
-- organizations
-- Uses owner_id directly (no organization_id column on this table)
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select" ON organizations;
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
DROP POLICY IF EXISTS "organizations_update" ON organizations;
DROP POLICY IF EXISTS "organizations_delete" ON organizations;

CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "organizations_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());


-- ============================================================
-- clinics
-- ============================================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinics_select" ON clinics;
DROP POLICY IF EXISTS "clinics_insert" ON clinics;
DROP POLICY IF EXISTS "clinics_update" ON clinics;
DROP POLICY IF EXISTS "clinics_delete" ON clinics;

CREATE POLICY "clinics_select" ON clinics
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "clinics_insert" ON clinics
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "clinics_update" ON clinics
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "clinics_delete" ON clinics
  FOR DELETE USING (organization_id = get_user_org_id());


-- ============================================================
-- agents
-- ============================================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select" ON agents;
DROP POLICY IF EXISTS "agents_insert" ON agents;
DROP POLICY IF EXISTS "agents_update" ON agents;
DROP POLICY IF EXISTS "agents_delete" ON agents;

CREATE POLICY "agents_select" ON agents
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "agents_insert" ON agents
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "agents_update" ON agents
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "agents_delete" ON agents
  FOR DELETE USING (organization_id = get_user_org_id());


-- ============================================================
-- agent_settings
-- No direct organization_id — joins through agents table
-- ============================================================
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_settings_select" ON agent_settings;
DROP POLICY IF EXISTS "agent_settings_insert" ON agent_settings;
DROP POLICY IF EXISTS "agent_settings_update" ON agent_settings;
DROP POLICY IF EXISTS "agent_settings_delete" ON agent_settings;

CREATE POLICY "agent_settings_select" ON agent_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_settings.agent_id
        AND agents.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "agent_settings_insert" ON agent_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_settings.agent_id
        AND agents.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "agent_settings_update" ON agent_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_settings.agent_id
        AND agents.organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_settings.agent_id
        AND agents.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "agent_settings_delete" ON agent_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_settings.agent_id
        AND agents.organization_id = get_user_org_id()
    )
  );


-- ============================================================
-- knowledge_articles
-- ============================================================
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_articles_select" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_insert" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_update" ON knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_delete" ON knowledge_articles;

CREATE POLICY "knowledge_articles_select" ON knowledge_articles
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "knowledge_articles_insert" ON knowledge_articles
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "knowledge_articles_update" ON knowledge_articles
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "knowledge_articles_delete" ON knowledge_articles
  FOR DELETE USING (organization_id = get_user_org_id());


-- ============================================================
-- phone_numbers
-- ============================================================
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phone_numbers_select" ON phone_numbers;
DROP POLICY IF EXISTS "phone_numbers_insert" ON phone_numbers;
DROP POLICY IF EXISTS "phone_numbers_update" ON phone_numbers;
DROP POLICY IF EXISTS "phone_numbers_delete" ON phone_numbers;

CREATE POLICY "phone_numbers_select" ON phone_numbers
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "phone_numbers_insert" ON phone_numbers
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "phone_numbers_update" ON phone_numbers
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "phone_numbers_delete" ON phone_numbers
  FOR DELETE USING (organization_id = get_user_org_id());


-- ============================================================
-- appointments
-- ============================================================
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select" ON appointments;
DROP POLICY IF EXISTS "appointments_insert" ON appointments;
DROP POLICY IF EXISTS "appointments_update" ON appointments;
DROP POLICY IF EXISTS "appointments_delete" ON appointments;

CREATE POLICY "appointments_select" ON appointments
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "appointments_insert" ON appointments
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "appointments_update" ON appointments
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "appointments_delete" ON appointments
  FOR DELETE USING (organization_id = get_user_org_id());


-- ============================================================
-- call_sessions
-- ============================================================
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_sessions_select" ON call_sessions;
DROP POLICY IF EXISTS "call_sessions_insert" ON call_sessions;
DROP POLICY IF EXISTS "call_sessions_update" ON call_sessions;
DROP POLICY IF EXISTS "call_sessions_delete" ON call_sessions;

CREATE POLICY "call_sessions_select" ON call_sessions
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "call_sessions_insert" ON call_sessions
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "call_sessions_update" ON call_sessions
  FOR UPDATE USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "call_sessions_delete" ON call_sessions
  FOR DELETE USING (organization_id = get_user_org_id());
