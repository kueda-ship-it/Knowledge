import React, { useState } from 'react';
import { Sparkles, X, Newspaper, ImagePlus, ThumbsUp } from 'lucide-react';

// 機能更新のお知らせ。id を変えると全ユーザーに再表示される (既読は localStorage 管理)。
const ANNOUNCEMENT = {
    id: 'sns-feed-timeline-2026-08',
    title: 'ナレッジ一覧が SNS タイムラインになりました',
    points: [
        {
            icon: <Newspaper size={16} />,
            head: '開かなくても読める',
            body: '事象・対処のプレビューを一覧に常時表示するようにしました。クリックすると全文とコメント欄が開きます。',
        },
        {
            icon: <ImagePlus size={16} />,
            head: '写真がそのまま見える',
            body: '画像付きの投稿はタイムラインに写真がそのまま表示されます。クリックで OneDrive の原本が開きます。画像以外の添付もファイル名のチップからワンクリックで開けます。',
        },
        {
            icon: <ThumbsUp size={16} />,
            head: 'リアクションがすぐ押せる',
            body: '「いいね！」「助かった」などのリアクションは、投稿を開かなくてもタイムラインから直接押せるようになりました。',
        },
    ],
} as const;

const SEEN_KEY = `whatsnew_seen_${ANNOUNCEMENT.id}`;

export const WhatsNewDialog: React.FC = () => {
    const [open, setOpen] = useState(() => {
        try {
            return localStorage.getItem(SEEN_KEY) !== '1';
        } catch {
            return false;
        }
    });

    const close = () => {
        try {
            localStorage.setItem(SEEN_KEY, '1');
        } catch { /* noop */ }
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div
            onClick={close}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.55)', zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
            }}
        >
            <div
                className="glass-elevated"
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(520px, calc(100vw - 40px))',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex', flexDirection: 'column', gap: '18px',
                    animation: 'chatPop 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                        background: 'rgba(99, 102, 241, 0.18)',
                        border: '1px solid rgba(99, 102, 241, 0.45)',
                        color: '#818cf8',
                    }}>
                        <Sparkles size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8', letterSpacing: '0.06em', marginBottom: '4px' }}>
                            機能更新のお知らせ
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.4 }}>{ANNOUNCEMENT.title}</h3>
                    </div>
                    <button
                        onClick={close}
                        title="閉じる"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', flexShrink: 0 }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {ANNOUNCEMENT.points.map(p => (
                        <div key={p.head} style={{
                            display: 'flex', gap: '10px', padding: '12px 14px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '10px',
                        }}>
                            <span style={{ color: '#818cf8', flexShrink: 0, marginTop: '2px' }}>{p.icon}</span>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '2px' }}>{p.head}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.55 }}>{p.body}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={close} className="primary-btn" style={{ padding: '12px', fontWeight: 700 }}>
                    使ってみる
                </button>
            </div>
        </div>
    );
};
