-- Ensure room_locks table has a created_at column for stale lock detection.
-- If your table already has this column, this is a no-op.
-- Run this in Supabase SQL Editor.

ALTER TABLE room_locks
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
