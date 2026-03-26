-- Migration 003: failed_writes table for Supabase write retry recovery
-- Created: 2026-03-25
-- Purpose: Captures permanently failed Supabase writes so they can be
--          manually retried or alerted on. Written by the Python agent's
--          supabase_write_with_retry utility when all retries are exhausted.

CREATE TABLE IF NOT EXISTS failed_writes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT        NOT NULL,
  payload_json TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  retried     BOOLEAN     DEFAULT FALSE,
  retried_at  TIMESTAMPTZ
);

-- Index for finding unretried failures ordered by age (for recovery jobs)
CREATE INDEX IF NOT EXISTS failed_writes_retried_idx
  ON failed_writes (retried, created_at);

-- No RLS — only service role writes here (Python agent uses service role key)
