-- Migration 004: Enable Supabase Realtime for dashboard sync tables
-- Created: 2026-03-25
-- Purpose: Allows the frontend useRealtimeSync hook to receive WebSocket
--          events on INSERT/UPDATE so the dashboard updates within ~1s
--          instead of waiting for the 30s React Query staleTime.

-- Enable realtime for dashboard sync tables
ALTER PUBLICATION supabase_realtime ADD TABLE call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
