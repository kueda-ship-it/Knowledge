import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

// Realtime 基盤不安定時のキルスイッチ。env で無効化可能。
// 再接続ループが supabase-js の auth ロックを占有して REST 保存を
// ハングさせる事例が確認されたため、既定で無効化する。
const REALTIME_ENABLED = (import.meta as any).env?.VITE_ENABLE_REALTIME === 'true';

export interface ChannelListener<T extends Record<string, unknown> = Record<string, unknown>> {
    event: PostgresEvent;
    table: string;
    filter?: string;
    callback: (payload: RealtimePostgresChangesPayload<T>) => void;
}

interface Options {
    /** 再接続を試みる最大回数。デフォルト: 3 */
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
    const { maxRetries = 3, baseDelay = 2000 } = options;

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
        if (!REALTIME_ENABLED) return; // キルスイッチで完全停止

        // 既存チャンネルを破棄
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        // 無効な設定ではサブスクライブしない（未ログイン時等）
        if (!channelName || listenersRef.current.length === 0) return;

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
            if (status === 'SUBSCRIBED') {
                if (retryCountRef.current > 0) {
                    console.log(`[Realtime] ${channelName}: reconnected`);
                }
                retryCountRef.current = 0;
                return;
            }

            // CLOSED は正常クローズのシグナル。TIMED_OUT/CHANNEL_ERROR のみ再接続対象
            if ((status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') && isMountedRef.current) {
                const attempt = retryCountRef.current;
                if (attempt >= maxRetries) {
                    // 無限リトライは諦める（ノイズ抑止のため1回だけログ）
                    if (attempt === maxRetries) {
                        console.warn(`[Realtime] ${channelName}: giving up after ${maxRetries} retries`);
                        retryCountRef.current += 1;
                    }
                    return;
                }
                retryCountRef.current += 1;
                const delay = Math.min(baseDelay * 2 ** attempt, 60_000);
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
