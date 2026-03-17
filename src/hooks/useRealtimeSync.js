import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Subscribe to Supabase Realtime changes on a table and
 * update the React Query cache efficiently.
 *
 * For UPDATE events: surgically patches the cached array instead of refetching.
 * For INSERT/DELETE events: invalidates queries to trigger a refetch.
 *
 * @param {string} table    - Supabase table name (e.g. "orders", "drivers")
 * @param {string[]} queryKeys - React Query keys to invalidate/update on change
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether to subscribe
 */
export function useRealtimeSync(table, queryKeys, options = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled || !table) return;

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const keys = queryKeysRef.current;
          const eventType = payload.eventType;

          if (eventType === 'UPDATE' && payload.new) {
            // Merge new data into existing cached record (keeps fields not in payload)
            keys.forEach((key) => {
              queryClient.setQueriesData(
                { queryKey: [key] },
                (oldData) => {
                  if (!Array.isArray(oldData)) return oldData;
                  const idx = oldData.findIndex((item) => item.id === payload.new.id);
                  if (idx === -1) return oldData;
                  const updated = [...oldData];
                  updated[idx] = { ...oldData[idx], ...payload.new };
                  return updated;
                }
              );
            });
          } else {
            // INSERT or DELETE — invalidate to refetch
            keys.forEach((key) => {
              queryClient.invalidateQueries({ queryKey: [key] });
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, enabled, queryClient]);
}
