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
            className="glass-elevated"
            onClick={() => onOpen?.(note)}
            style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                padding: '12px 14px', borderRadius: '14px',
                width: '320px', boxSizing: 'border-box',
                cursor: onOpen ? 'pointer' : 'default',
                borderLeft: `3px solid ${meta.color}`,
                animation: 'chatPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'auto',
            }}
        >
            <div style={{ color: meta.color, marginTop: '2px', flexShrink: 0 }}>
                <meta.Icon size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.4 }}>{meta.text}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>
                    {new Date(note.created_at).toLocaleTimeString()}
                </div>
            </div>
            <button
                onClick={e => { e.stopPropagation(); onDismiss(note.id); }}
                title="閉じる"
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '20px', height: '20px', padding: 0, flexShrink: 0,
                    background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer',
                }}
            >
                <X size={14} />
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
        </div>,
        document.body,
    );
};
