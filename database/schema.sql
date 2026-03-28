CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- AGENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID,
    clinic_id UUID,
    name TEXT NOT NULL,
    persona TEXT,
    default_language TEXT NOT NULL DEFAULT 'en-US',
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    port INTEGER UNIQUE,
    subdomain TEXT UNIQUE,
    phone_number TEXT UNIQUE,
    twilio_phone_sid TEXT,
    status TEXT NOT NULL DEFAULT 'inactive',
    deploy_error TEXT,
    hetzner_server_ip TEXT,
    livekit_agent_name TEXT,
    livekit_trunk_id TEXT,
    livekit_dispatch_rule_id TEXT,
    sip_auth_username TEXT,
    sip_auth_password TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS persona TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS port INTEGER;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS subdomain TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS twilio_phone_sid TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deploy_error TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS hetzner_server_ip TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS livekit_agent_name TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS livekit_trunk_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS livekit_dispatch_rule_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sip_auth_username TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sip_auth_password TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    BEGIN
        ALTER TABLE agents ALTER COLUMN status TYPE TEXT USING status::TEXT;
    EXCEPTION
        WHEN undefined_column THEN NULL;
        WHEN datatype_mismatch THEN NULL;
        WHEN dependent_objects_still_exist THEN NULL;
    END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_port_unique ON agents(port) WHERE port IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_subdomain_unique ON agents(subdomain) WHERE subdomain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_phone_number_unique ON agents(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

-- =============================================================================
-- PORT REGISTRY
-- =============================================================================

CREATE TABLE IF NOT EXISTS port_registry (
    port INTEGER PRIMARY KEY,
    agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE SET NULL,
    allocated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_port_registry_agent_id ON port_registry(agent_id);

-- =============================================================================
-- CALL LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clinic_id UUID,
    organization_id UUID,
    twilio_call_sid TEXT UNIQUE,
    livekit_room TEXT,
    caller_phone TEXT,
    status TEXT NOT NULL DEFAULT 'initiated',
    duration_seconds INTEGER,
    transcript_text TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id_created_at ON call_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_call_sid ON call_logs(twilio_call_sid);

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    organization_id UUID,
    clinic_id UUID,
    call_session_id UUID,
    call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
    patient_name TEXT,
    patient_email TEXT,
    caller_name TEXT,
    caller_phone TEXT,
    caller_email TEXT,
    service_requested TEXT,
    reason TEXT,
    appointment_at TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    notes TEXT,
    calendar_event_id TEXT,
    calendar_event_url TEXT,
    confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS call_session_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS call_log_id UUID REFERENCES call_logs(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_email TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS caller_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS caller_phone TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS caller_email TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_requested TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_event_url TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_appointments_agent_id_appointment_at ON appointments(agent_id, appointment_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_call_log_id ON appointments(call_log_id);

-- =============================================================================
-- ANALYTICS DAILY
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_daily (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_calls INTEGER NOT NULL DEFAULT 0,
    completed_calls INTEGER NOT NULL DEFAULT 0,
    appointments_booked INTEGER NOT NULL DEFAULT 0,
    total_duration_seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON appointments;
CREATE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
