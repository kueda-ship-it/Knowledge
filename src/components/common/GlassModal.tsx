import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
    open: boolean;
    title: string;
    icon?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: number;
}

export const GlassModal: React.FC<Props> = ({ open, title, icon, onClose, children, footer, maxWidth = 560 }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9998,
                background: 'var(--modal-scrim)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                boxSizing: 'border-box',
                animation: 'glass-modal-fade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth,
                    maxHeight: '85vh',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 20,
                    background: 'var(--modal-bg)',
                    color: 'var(--text)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: 'var(--modal-shadow)',
                    overflow: 'hidden',
                    animation: 'glass-modal-fade 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '18px 24px',
                    borderBottom: '1px solid var(--glass-border)',
                    flexShrink: 0,
                }}>
                    {icon}
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</h3>
                    <button type="button" className="glass-modal-close" onClick={onClose} title="閉じる" aria-label="閉じる">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px', minHeight: 0 }}>
                    {children}
                </div>

                {footer && (
                    <div style={{
                        padding: '14px 24px',
                        borderTop: '1px solid var(--glass-border)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        flexShrink: 0,
                    }}>
                        {footer}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes glass-modal-fade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .glass-modal-close {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    box-sizing: border-box;
                    padding: 0;
                    border: 1px solid var(--btn-icon-border);
                    border-radius: 10px;
                    background: var(--btn-icon-bg);
                    color: var(--btn-icon-color);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: filter 0.15s, background 0.15s, color 0.15s;
                }
                .glass-modal-close:hover {
                    background: var(--btn-icon-hover-bg);
                    color: var(--btn-icon-hover-color);
                    filter: brightness(1.12);
                }
                .glass-modal-close:active { transform: translateY(1px); }
            `}</style>
        </div>,
        document.body
    );
};
