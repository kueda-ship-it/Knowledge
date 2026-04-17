import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface ChannelListener<T extends Record<string, unknown> = Record<string, unknown>> {
    event: PostgresEvent;
    table: string;
    filter?: string;
    callback: (payload: RealtimePostgresChangesPayload<T>) => void;
}

interface Options {
    /** 再接続を試みる最大回数。デフォルト: 10 */
    maxRetries?: number;
    /** 初回リトライ待機時間(ms)。指数バックオフで増加。デフォルト: 2000 */
    baseDelay?: number;
}

/**
 * Supabase Realtime チャンネルをサブスクライブし、
 * TIMED_OUT / CHANNEL_ERROR 時に指数バックオフで自動再接続するフック。
 */
export function useRealtimeChannel(
    channelName: string,
    listeners: ChannelListener[],
    options: Options = {}
) {
    const { maxRetries = 10, baseDelay = 2000 } = options;

    const channelRef = useRef<RealtimeChannel | null>(null);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    // listeners は毎レンダーで新しい配列になり得るため ref で持つ
    const listenersRef = useRef(listeners);
    listenersRef.current = listeners;

    const cleanup = useCallback(() => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
    }, []);

    const subscribe = useCallback(() => {
        if (!isMountedRef.current) return;

        // 既存チャンネルを破棄
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        const channel = supabase.channel(channelName);

        for (const listener of listenersRef.current) {
            channel.on(
                'postgres_changes' as Parameters<typeof channel.on>[0],
                {
                    event: listener.event,
                    schema: 'public',
                    table: listener.table,
                    ...(listener.filter ? { filter: listener.filter } : {}),
                },
                listener.callback as (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
            );
        }

        channel.subscribe((status: string) => {
            console.log(`[Realtime] ${channelName} status:`, status);

            if (status === 'SUBSCRIBED') {
                retryCountRef.current = 0;
                return;
            }

            if ((status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') && isMountedRef.current) {
                const attempt = retryCountRef.current;
                if (attempt >= maxRetries) {
                    console.warn(`[Realtime] ${channelName}: max retries (${maxRetries}) reached. Giving up.`);
                    return;
                }
                retryCountRef.current += 1;
                const delay = Math.min(baseDelay * 2 ** attempt, 60_000);
                console.warn(`[Realtime] ${channelName}: ${status}. Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                retryTimerRef.current = setTimeout(subscribe, delay);
            }
        });

        channelRef.current = channel;
    }, [channelName, maxRetries, baseDelay]);

    useEffect(() => {
        isMountedRef.current = true;
        retryCountRef.current = 0;
        subscribe();

        return () => {
            isMountedRef.current = false;
            cleanup();
        };
    }, [subscribe, cleanup]);
}
