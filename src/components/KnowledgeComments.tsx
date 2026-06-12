import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { KnowledgeComment, User } from '../types';
import { apiClient } from '../api/client';
import { useRealtimeChannel } from '../hooks/useRealtimeChannel';

// ナレッジのコメントスレッド (自己完結)。一覧カードの展開ビューと Editor の双方から使う。
// 提議の合議コメント (OperationalProposals) と同じ実装方針:
// - 取得/書き込みは rawRest (client.ts)、送信操作のみ 15 秒タイムアウト
// - 名前解決は usersMaster (profiles FDW を叩かない)
// - Realtime はナレッジ単位のチャンネルで INSERT/UPDATE/DELETE をライブ反映 (feature: 'social')

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`timeout: ${label} (${ms}ms)`)), ms),
        ),
    ]);
}

interface KnowledgeCommentsProps {
    knowledgeId: string;
    user: { id?: string; name: string; role: string };
    usersMaster: User[];
    // 件数変化を親へ通知 (一覧カードのバッジ更新用、省略可)
    onCountChange?: (count: number) => void;
}

const getInitial = (name: string) => name.charAt(0).toUpperCase();

export const KnowledgeComments: React.FC<KnowledgeCommentsProps> = ({ knowledgeId, user, usersMaster, onCountChange }) => {
    const [comments, setComments] = useState<KnowledgeComment[]>([]);
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);

    const nameOf = (authorId: string) => usersMaster.find(u => u.id === authorId)?.name ?? '不明';
    const avatarOf = (authorId: string) => usersMaster.find(u => u.id === authorId)?.avatarUrl;
    const canComment = user.role !== 'viewer';
    const canDelete = (c: KnowledgeComment) =>
        c.author_id === user.id || user.role === 'manager' || user.role === 'master';

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        apiClient.fetchKnowledgeComments(knowledgeId)
            .then(rows => { if (!cancelled) setComments(rows); })
            .catch(e => console.warn('[KnowledgeComments] fetch failed:', e?.message))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [knowledgeId]);

    useEffect(() => {
        onCountChange?.(comments.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comments.length]);

    useRealtimeChannel(`knowledge-comments-${knowledgeId}`, [
        {
            event: 'INSERT',
            table: 'knowledge_comments',
            filter: `knowledge_id=eq.${knowledgeId}`,
            callback: (payload) => {
                const row = payload.new as unknown as KnowledgeComment;
                setComments(prev => prev.some(c => c.id === row.id) ? prev : [...prev, row]);
            },
        },
        {
            event: 'UPDATE',
            table: 'knowledge_comments',
            filter: `knowledge_id=eq.${knowledgeId}`,
            callback: (payload) => {
                const row = payload.new as unknown as KnowledgeComment;
                setComments(prev => prev.map(c => c.id === row.id ? { ...c, ...row } : c));
            },
        },
        {
            event: 'DELETE',
            table: 'knowledge_comments',
            filter: `knowledge_id=eq.${knowledgeId}`,
            callback: (payload) => {
                const id = (payload.old as { id: string }).id;
                setComments(prev => prev.filter(c => c.id !== id));
            },
        },
    ], { feature: 'social' });

    const handleSend = async () => {
        const body = draft.trim();
        if (!body || !user.id) return;
        setBusy(true);
        try {
            await withTimeout(
                apiClient.createKnowledgeComment(knowledgeId, body, user.id, user.name),
                15000, 'createKnowledgeComment',
            );
            setDraft('');
            // Realtime 経由で反映されるが、保険として即時リロード
            const rows = await apiClient.fetchKnowledgeComments(knowledgeId);
            setComments(rows);
        } catch (e: any) {
            console.error('[KnowledgeComments] send failed:', e);
            window.alert(`コメントの送信に失敗しました。入力内容は残っています。再試行してください。\n${e?.message ?? ''}`);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!window.confirm('このコメントを削除しますか？')) return;
        try {
            await withTimeout(apiClient.deleteKnowledgeComment(commentId), 15000, 'deleteKnowledgeComment');
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (e: any) {
            console.error('[KnowledgeComments] delete failed:', e);
            window.alert(`コメントの削除に失敗しました。\n${e?.message ?? ''}`);
        }
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em',
            }}>
                <MessageSquare size={12} />
                コメント・{comments.length}件
            </div>

            {loading ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>読み込み中...</div>
            ) : comments.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    まだコメントはありません。「助かりました」「うちでも同じ事象がありました」など気軽にどうぞ。
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {comments.map(c => {
                        const name = nameOf(c.author_id);
                        const avatar = avatarOf(c.author_id);
                        return (
                            <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                {avatar ? (
                                    <img src={avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: '2px' }} />
                                ) : (
                                    <div className="user-avatar-fallback" style={{ width: 24, height: 24, fontSize: '0.7rem', flexShrink: 0, marginTop: '2px' }}>
                                        {getInitial(name)}
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{name}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleString()}</span>
                                        {canDelete(c) && (
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                title="削除"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: '18px', height: '18px', padding: 0, marginLeft: 'auto',
                                                    background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                                                }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {c.body}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {canComment && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="コメントを書く (Ctrl+Enter で送信)"
                        rows={1}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        style={{
                            flex: 1, resize: 'vertical', minHeight: '34px',
                            padding: '8px 10px', borderRadius: '8px',
                            border: '1px solid var(--input-border)', background: 'var(--input-bg)',
                            color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.4,
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={busy || !draft.trim()}
                        title="送信"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            height: '34px', padding: '0 14px', boxSizing: 'border-box',
                            borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.5)',
                            background: busy || !draft.trim() ? 'rgba(56, 189, 248, 0.08)' : 'rgba(56, 189, 248, 0.22)',
                            color: '#38bdf8', fontSize: '0.82rem', fontWeight: 700,
                            cursor: busy || !draft.trim() ? 'default' : 'pointer',
                        }}
                    >
                        <Send size={12} />
                        {busy ? '送信中...' : '送信'}
                    </button>
                </div>
            )}
        </div>
    );
};
