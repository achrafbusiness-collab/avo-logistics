import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Subscribe to Supabase Realtime changes on a table and
 * automatically invalidate the matching React Query cache.
 *
 * @param {string} table    - Supabase table name (e.g. "orders", "drivers")
 * @param {string[]} queryKeys - React Query keys to invalidate on change
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether to subscribe
 */
export function useRealtimeSync(table, queryKeys, options = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !table) return;

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, enabled, queryClient, ...queryKeys]);
}
