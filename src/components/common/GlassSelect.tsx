import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface GlassSelectOption {
    value: string;
    label: string;
    color?: string;
}

interface Props {
    value: string;
    options: GlassSelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    compact?: boolean;
}

export const GlassSelect: React.FC<Props> = ({ value, options, onChange, compact }) => {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (btnRef.current?.contains(e.target as Node)) return;
            if (popupRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onScroll = () => setOpen(false);
        document.addEventListener('mousedown', close);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) {
            setRect(btnRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };

    const selected = options.find(o => o.value === value);

    const fontSize = compact ? '0.85rem' : '0.9rem';
    const padY = compact ? 4 : 8;
    const padX = compact ? 8 : 12;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={handleToggle}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize,
                    padding: `${padY}px ${padX}px`,
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                <span style={{ color: selected?.color || 'var(--text)', fontWeight: 500 }}>
                    {selected?.label || '選択...'}
                </span>
                <ChevronDown size={14} style={{ opacity: 0.6, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
            </button>

            {open && rect && createPortal(
                <div
                    ref={popupRef}
                    style={{
                        position: 'fixed',
                        top: rect.bottom + 6,
                        left: rect.left,
                        width: Math.max(rect.width, 200),
                        zIndex: 99999,
                        padding: 6,
                        borderRadius: 14,
                        background: 'rgba(24, 28, 40, 0.95)',
                        backdropFilter: 'blur(28px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 2px 0 0 rgba(255,255,255,0.06) inset, 0 16px 48px 0 rgba(0,0,0,0.45), 0 4px 12px 0 rgba(0,0,0,0.25)',
                        animation: 'glass-select-fade 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    {options.map(opt => {
                        const isSel = opt.value === value;
                        return (
                            <div
                                key={opt.value}
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    cursor: 'pointer',
                                    fontSize: '0.88rem',
                                    color: opt.color || 'rgba(255,255,255,0.95)',
                                    background: isSel ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                                    transition: 'background 0.12s',
                                    fontWeight: isSel ? 600 : 400,
                                }}
                                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span>{opt.label}</span>
                                {isSel && <Check size={14} style={{ flexShrink: 0, opacity: 0.9 }} />}
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}

            <style>{`
                @keyframes glass-select-fade {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
};
