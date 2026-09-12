import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AppNotification } from '../types';
import { describeNotification } from '../constants/notifications';

// 画面右下に積み上がる即時通知トースト。Realtime の notifications INSERT を受けて
// App が toasts state に積み、各トーストは 6 秒で自動退場する。
// クリックで既読化 (onOpen)。AI チャットは左下なので右下は専有できる。

const TOAST_DURATION_MS = 6000;

interface ToastStackProps {
    toasts: AppNotification[];
    onDismiss: (id: string) => void;
    onOpen?: (note: AppNotification) => void;
}

const ToastItem: React.FC<{
    note: AppNotification;
    onDismiss: (id: string) => void;
    onOpen?: (note: AppNotification) => void;
}> = ({ note, onDismiss, onOpen }) => {
    useEffect(() => {
        const t = setTimeout(() => onDismiss(note.id), TOAST_DURATION_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [note.id]);

    const meta = describeNotification(note);
    return (
        <div
            role="status"
            onClick={() => onOpen?.(note)}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                padding: '12px 14px', borderRadius: '14px',
                width: '320px', maxWidth: 'calc(100vw - 40px)', boxSizing: 'border-box',
                cursor: onOpen ? 'pointer' : 'default',
                background: `var(--${meta.tone}-soft)`,
                border: `1px solid var(--${meta.tone}-border)`,
                boxShadow: 'var(--card-shadow-lg)',
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                animation: 'chatPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'auto',
            }}
        >
            <div style={{ color: `var(--${meta.tone})`, marginTop: '2px', flexShrink: 0, display: 'inline-flex' }}>
                <meta.Icon size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{meta.text}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>
                    <span className="num">{new Date(note.created_at).toLocaleTimeString()}</span>
                </div>
            </div>
            <button
                type="button"
                className="toast-close"
                onClick={e => { e.stopPropagation(); onDismiss(note.id); }}
                title="閉じる"
                aria-label="閉じる"
            >
                <X size={16} />
            </button>
        </div>
    );
};

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss, onOpen }) => {
    if (toasts.length === 0) return null;
    return createPortal(
        <div style={{
            position: 'fixed', right: '20px', bottom: '20px', zIndex: 9000,
            display: 'flex', flexDirection: 'column-reverse', gap: '10px',
            pointerEvents: 'none',
        }}>
            {toasts.map(n => (
                <ToastItem key={n.id} note={n} onDismiss={onDismiss} onOpen={onOpen} />
            ))}
            <style>{`
                .toast-close {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 24px; height: 24px; padding: 0; margin: -2px -4px 0 0; flex-shrink: 0;
                    box-sizing: border-box; border: none; border-radius: 6px;
                    background: transparent; color: var(--muted); cursor: pointer;
                    transition: filter 0.15s, background 0.15s, color 0.15s;
                }
                .toast-close:hover { background: var(--btn-icon-hover-bg); color: var(--text); filter: brightness(1.12); }
                .toast-close:active { transform: translateY(1px); }
            `}</style>
        </div>,
        document.body,
    );
};
