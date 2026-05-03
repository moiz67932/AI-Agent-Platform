CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Bring older Supabase projects up to the Telnyx-aware schema expected by the app.

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS telephony_provider TEXT NOT NULL DEFAULT 'telnyx',
    ADD COLUMN IF NOT EXISTS external_number_id TEXT,
    ADD COLUMN IF NOT EXISTS voice_connection_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS deploy_error TEXT,
    ADD COLUMN IF NOT EXISTS hetzner_server_ip TEXT,
    ADD COLUMN IF NOT EXISTS livekit_agent_name TEXT,
    ADD COLUMN IF NOT EXISTS livekit_trunk_id TEXT,
    ADD COLUMN IF NOT EXISTS livekit_dispatch_rule_id TEXT,
    ADD COLUMN IF NOT EXISTS sip_auth_username TEXT,
    ADD COLUMN IF NOT EXISTS sip_auth_password TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_telephony_provider ON agents(telephony_provider);

ALTER TABLE call_logs
    ADD COLUMN IF NOT EXISTS telephony_provider TEXT NOT NULL DEFAULT 'telnyx',
    ADD COLUMN IF NOT EXISTS provider_call_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_call_leg_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_call_session_id TEXT,
    ADD COLUMN IF NOT EXISTS livekit_room TEXT,
    ADD COLUMN IF NOT EXISTS caller_phone TEXT,
    ADD COLUMN IF NOT EXISTS transcript_text TEXT,
    ADD COLUMN IF NOT EXISTS summary TEXT;

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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_id ON call_logs(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_session_id ON call_logs(provider_call_session_id);

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

ALTER TABLE phone_numbers
    ADD COLUMN IF NOT EXISTS telephony_provider TEXT NOT NULL DEFAULT 'telnyx',
    ADD COLUMN IF NOT EXISTS external_number_id TEXT,
    ADD COLUMN IF NOT EXISTS voice_connection_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'phone_numbers' AND column_name = 'telnyx_id'
    ) THEN
        UPDATE phone_numbers
        SET external_number_id = COALESCE(external_number_id, telnyx_id)
        WHERE telnyx_id IS NOT NULL;
    END IF;
END $$;

-- `database/db.py` uses ON CONFLICT (phone_e164), so the live table needs a matching
-- unique constraint/index. Older projects may have the column but not the uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_phone_e164_unique
    ON phone_numbers(phone_e164);
