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
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                animation: 'glass-modal-fade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth,
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 20,
                    background: 'rgba(24, 28, 40, 0.92)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    boxShadow: '0 2px 0 0 rgba(255,255,255,0.08) inset, 0 24px 64px 0 rgba(0,0,0,0.55), 0 8px 20px 0 rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    animation: 'glass-modal-slide 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '18px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    flexShrink: 0,
                }}>
                    {icon}
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.95)', flex: 1 }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: 'none',
                            color: 'rgba(255,255,255,0.75)',
                            width: 32, height: 32,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px', minHeight: 0 }}>
                    {children}
                </div>

                {footer && (
                    <div style={{
                        padding: '14px 24px',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
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
                @keyframes glass-modal-slide {
                    from { opacity: 0; transform: translateY(8px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>,
        document.body
    );
};
