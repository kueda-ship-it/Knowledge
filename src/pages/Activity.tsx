import React, { useEffect, useState } from 'react';
import { Radio, FileText, MessageSquare } from 'lucide-react';
import { ActivityEvent, MasterData, ReactionType } from '../types';
import { apiClient } from '../api/client';
import { useRealtimeChannel } from '../hooks/useRealtimeChannel';
import { BackButton } from '../components/common/BackButton';
import { REACTION_META } from '../constants/reactions';
import { loadCache } from '../utils/cache';

// アクティビティフィード:「今、事業部で起きていること」のタイムライン。
// 専用テーブルは持たず、既存テーブルの直近行マージ (初期ロード) + Realtime INSERT 購読 (ライブ反映)。
// 名前/タイトル解決はローカルのマスタ・タイトルマップで行い、profiles FDW は叩かない。

const MASTERS_CACHE_KEY = 'knowledge_masters_v2';

interface ActivityProps {
    onBack: () => void;
    onOpenKnowledge: (knowledgeId: string) => void;
}

// 相対時刻 (フィードは「鮮度」が主役なので日付より相対表示)
function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}時間前`;
    const day = Math.floor(hour / 24);
    if (day < 7) return `${day}日前`;
    return new Date(iso).toLocaleDateString();
}

const getInitial = (name: string) => name.charAt(0).toUpperCase();

export const Activity: React.FC<ActivityProps> = ({ onBack, onOpenKnowledge }) => {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [usersMaster, setUsersMaster] = useState<MasterData['users']>(() =>
        loadCache<MasterData>(MASTERS_CACHE_KEY, { incidents: [], categories: [], users: [] }).users
    );
    const [titleMap, setTitleMap] = useState<Record<string, { title: string; author: string }>>({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [eventsRes, titlesRes, mastersRes] = await Promise.allSettled([
                apiClient.fetchRecentActivity(),
                apiClient.fetchKnowledgeTitles(),
                usersMaster.length > 0 ? Promise.resolve(null) : apiClient.fetchMasters(),
            ]);
            if (cancelled) return;
            if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value);
            if (titlesRes.status === 'fulfilled') setTitleMap(titlesRes.value);
            if (mastersRes.status === 'fulfilled' && mastersRes.value) setUsersMaster(mastersRes.value.users);
            setLoading(false);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ライブ反映: 3 テーブルの INSERT を 1 チャンネルで購読
    useRealtimeChannel('activity-feed', [
        {
            event: 'INSERT',
            table: 'knowledge',
            callback: (payload) => {
                const r = payload.new as any;
                if (!r?.id || !r?.created_at) return;
                setTitleMap(prev => ({ ...prev, [r.id]: { title: r.title ?? '', author: r.author ?? '' } }));
                const ev: ActivityEvent = { kind: 'post', id: `post-${r.id}`, knowledgeId: r.id, title: r.title ?? '', actorName: r.author ?? '', createdAt: r.created_at };
                setEvents(prev => prev.some(e => e.id === ev.id) ? prev : [ev, ...prev].slice(0, 80));
            },
        },
        {
            event: 'INSERT',
            table: 'knowledge_reactions',
            callback: (payload) => {
                const r = payload.new as any;
                if (!r?.id) return;
                const ev: ActivityEvent = { kind: 'reaction', id: `react-${r.id}`, knowledgeId: r.knowledge_id, actorId: r.user_id, reactionType: r.type, createdAt: r.created_at ?? new Date().toISOString() };
                setEvents(prev => prev.some(e => e.id === ev.id) ? prev : [ev, ...prev].slice(0, 80));
            },
        },
        {
            event: 'INSERT',
            table: 'knowledge_comments',
            callback: (payload) => {
                const r = payload.new as any;
                if (!r?.id) return;
                const ev: ActivityEvent = { kind: 'comment', id: `comment-${r.id}`, knowledgeId: r.knowledge_id, actorId: r.author_id, body: r.body ?? '', createdAt: r.created_at ?? new Date().toISOString() };
                setEvents(prev => prev.some(e => e.id === ev.id) ? prev : [ev, ...prev].slice(0, 80));
            },
        },
    ], { feature: 'social' });

    const nameOf = (userId: string) => usersMaster.find(u => u.id === userId)?.name ?? '誰か';
    const avatarOf = (name: string) => usersMaster.find(u => u.name === name)?.avatarUrl;
    const titleOf = (ev: ActivityEvent) => {
        const raw = ev.kind === 'post' ? ev.title : titleMap[ev.knowledgeId]?.title ?? '';
        const stripped = raw.replace(/^\[.*?\]\s*/, '').trim();
        return stripped || '(ナレッジ)';
    };

    const renderEvent = (ev: ActivityEvent) => {
        let Icon = FileText;
        let rgb = '96, 165, 250';
        let actorName = '';
        let body: React.ReactNode = null;

        if (ev.kind === 'post') {
            actorName = ev.actorName;
            body = <>ナレッジ <strong>「{titleOf(ev)}」</strong> を投稿しました</>;
        } else if (ev.kind === 'reaction') {
            const meta = REACTION_META[ev.reactionType as ReactionType] ?? REACTION_META.like;
            Icon = meta.Icon;
            rgb = meta.rgb;
            actorName = nameOf(ev.actorId);
            body = <>「{titleOf(ev)}」に <strong style={{ color: `rgb(${meta.rgb})` }}>{meta.label}</strong></>;
        } else {
            Icon = MessageSquare;
            rgb = '56, 189, 248';
            actorName = nameOf(ev.actorId);
            const excerpt = ev.body.length > 60 ? `${ev.body.slice(0, 60)}…` : ev.body;
            body = <>「{titleOf(ev)}」にコメント: <span style={{ color: 'var(--muted)' }}>{excerpt}</span></>;
        }

        const avatar = avatarOf(actorName);
        return (
            <div
                key={ev.id}
                className="knowledge-card"
                onClick={() => onOpenKnowledge(ev.knowledgeId)}
                style={{
                    cursor: 'pointer', padding: '10px 14px', marginBottom: 0,
                    display: 'grid',
                    gridTemplateColumns: '32px 28px minmax(0,1fr) 90px',
                    alignItems: 'center',
                    columnGap: '10px',
                    ['--card-accent' as any]: `rgba(${rgb}, 0.9)`,
                }}
            >
                {/* イベント種別アイコン */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', borderRadius: '50%', boxSizing: 'border-box',
                    background: `rgba(${rgb}, 0.14)`, border: `1px solid rgba(${rgb}, 0.4)`,
                    color: `rgb(${rgb})`, flexShrink: 0,
                }}>
                    <Icon size={12} />
                </span>
                {/* アクターのアバター */}
                {avatar ? (
                    <img src={avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                    <div className="user-avatar-fallback" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                        {getInitial(actorName || '?')}
                    </div>
                )}
                {/* 本文 */}
                <div style={{
                    fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.5,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}>
                    <strong>{actorName}</strong> が {body}
                </div>
                {/* 相対時刻 */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    height: '28px', padding: '0 10px', boxSizing: 'border-box',
                    fontSize: '0.75rem', color: 'var(--muted)',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                    borderRadius: '10px', whiteSpace: 'nowrap', lineHeight: 1, justifySelf: 'center',
                }}>
                    {timeAgo(ev.createdAt)}
                </span>
            </div>
        );
    };

    return (
        <div className="view active" style={{ display: 'flex', height: '100%', width: '100%' }}>
            <main className="main-content" style={{ flex: 1, backgroundColor: 'var(--bg)', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                        <BackButton onClick={onBack} />
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Radio size={22} style={{ color: '#34d399' }} />
                                アクティビティ
                            </h2>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                今、事業部で起きていること (投稿・リアクション・コメント)
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>アクティビティを読み込み中...</span>
                        </div>
                    ) : events.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px' }}>まだアクティビティがありません</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {events.map(renderEvent)}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};
