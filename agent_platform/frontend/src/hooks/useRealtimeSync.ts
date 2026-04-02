import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to Supabase Realtime changes on call_logs and appointments.
 * Invalidates React Query caches on events so existing hooks refetch automatically.
 * Tracks active (in-progress) calls via INSERT/UPDATE on call_logs.
 *
 * Degrades gracefully if Realtime is unavailable — isConnected stays false
 * and polling-based queries continue working as before.
 */
export function useRealtimeSync(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [activeCalls, setActiveCalls] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  // Track active call IDs so we can decrement correctly on UPDATE
  const activeCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Don't subscribe until we know the org
    if (!orgId) return;

    const channel = supabase
      .channel(`dashboard-sync-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        (payload) => {
          const row = payload.new as { id?: string; ended_at?: string | null; organization_id?: string };

          // Only handle rows for this org
          if (row.organization_id && row.organization_id !== orgId) return;

          queryClient.invalidateQueries({ queryKey: ['calls'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });

          // Track as active if call hasn't ended yet
          if (!row.ended_at && row.id) {
            activeCallIds.current.add(row.id);
            setActiveCalls(activeCallIds.current.size);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_logs' },
        (payload) => {
          const row = payload.new as { id?: string; ended_at?: string | null; organization_id?: string };

          if (row.organization_id && row.organization_id !== orgId) return;

          queryClient.invalidateQueries({ queryKey: ['calls'] });
          queryClient.invalidateQueries({ queryKey: ['analytics'] });

          // Call has ended — remove from active set
          if (row.ended_at && row.id) {
            activeCallIds.current.delete(row.id);
            setActiveCalls(activeCallIds.current.size);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments' },
        (payload) => {
          const row = payload.new as { organization_id?: string };
          if (row.organization_id && row.organization_id !== orgId) return;
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments' },
        (payload) => {
          const row = payload.new as { organization_id?: string };
          if (row.organization_id && row.organization_id !== orgId) return;
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
      setIsConnected(false);
    };
  }, [orgId, queryClient]);

  return { activeCalls, isConnected };
}
