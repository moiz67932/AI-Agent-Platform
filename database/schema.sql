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
    telephony_provider TEXT NOT NULL DEFAULT 'telnyx',
    external_number_id TEXT,
    voice_connection_id TEXT,
    provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
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
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telephony_provider TEXT NOT NULL DEFAULT 'telnyx';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS external_number_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS voice_connection_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;
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

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'twilio_phone_sid'
    ) THEN
        UPDATE agents
        SET external_number_id = COALESCE(external_number_id, twilio_phone_sid)
        WHERE twilio_phone_sid IS NOT NULL;
        ALTER TABLE agents DROP COLUMN twilio_phone_sid;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_port_unique ON agents(port) WHERE port IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_subdomain_unique ON agents(subdomain) WHERE subdomain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_phone_number_unique ON agents(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_telephony_provider ON agents(telephony_provider);

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
    telephony_provider TEXT NOT NULL DEFAULT 'telnyx',
    provider_call_id TEXT UNIQUE,
    provider_call_leg_id TEXT,
    provider_call_session_id TEXT,
    livekit_room TEXT,
    caller_phone TEXT,
    status TEXT NOT NULL DEFAULT 'initiated',
    duration_seconds INTEGER,
    transcript_text TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'call_logs' AND column_name = 'twilio_call_sid'
    ) THEN
        UPDATE call_logs
        SET provider_call_id = COALESCE(provider_call_id, twilio_call_sid)
        WHERE twilio_call_sid IS NOT NULL;
        ALTER TABLE call_logs DROP COLUMN twilio_call_sid;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id_created_at ON call_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_id ON call_logs(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_session_id ON call_logs(provider_call_session_id);

-- =============================================================================
-- TELEPHONY WEBHOOK EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS telephony_webhook_events (
    event_id TEXT PRIMARY KEY,
    telephony_provider TEXT NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    provider_call_id TEXT,
    event_type TEXT NOT NULL,
    payload JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telephony_webhook_events_provider_call_id
    ON telephony_webhook_events(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_telephony_webhook_events_received_at
    ON telephony_webhook_events(received_at DESC);

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
