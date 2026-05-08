import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hash } from 'lucide-react';
import {
    TagStat,
    findTagSuggestions,
    parseTagInput,
    getActiveTagFragment,
    applyTagSuggestion,
} from '../../utils/tagUtils';

interface Props {
    value: string;                  // `#a #b` 形式の文字列 (Editor 側で保持)
    onChange: (next: string) => void;
    existingTags: TagStat[];        // 集計済み既存タグ (頻度降順)
    placeholder?: string;
    disabled?: boolean;
}

export const TagInput: React.FC<Props> = ({ value, onChange, existingTags, placeholder, disabled }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [highlight, setHighlight] = useState(0);

    const { activeFragment } = getActiveTagFragment(value);
    const alreadyEntered = useMemo(() => parseTagInput(value), [value]);

    const suggestions = useMemo(
        () => findTagSuggestions(activeFragment, existingTags, alreadyEntered, 8),
        [activeFragment, existingTags, alreadyEntered],
    );

    // ポップアップ位置の更新
    useEffect(() => {
        if (!open) return;
        const update = () => {
            if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, value]);

    // 外側クリックで閉じる
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (inputRef.current?.contains(e.target as Node)) return;
            if (popupRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // 候補が変わったら highlight をリセット
    useEffect(() => {
        setHighlight(0);
    }, [activeFragment, suggestions.length]);

    const commitSuggestion = (s: TagStat) => {
        const next = applyTagSuggestion(value, s.tag);
        onChange(next);
        // 候補を選んだ後、続けて入力できるようフォーカスを残す
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || suggestions.length === 0) {
            if (e.key === 'ArrowDown' && existingTags.length > 0) {
                setOpen(true);
                e.preventDefault();
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(h => (h + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => (h - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            // 候補選択中のときだけ Enter/Tab を奪う。空候補時はフォームの通常動作を妨げない。
            const target = suggestions[highlight];
            if (target) {
                e.preventDefault();
                commitSuggestion(target);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const handleFocus = () => {
        if (existingTags.length > 0) setOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        if (existingTags.length > 0) setOpen(true);
    };

    return (
        <>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleChange}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                }}
            />
            {open && rect && suggestions.length > 0 && createPortal(
                <div
                    ref={popupRef}
                    style={{
                        position: 'fixed',
                        top: rect.bottom + 4,
                        left: rect.left,
                        width: rect.width,
                        maxHeight: 260,
                        overflowY: 'auto',
                        background: 'var(--card-bg, rgba(255,255,255,0.92))',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid var(--input-border, rgba(0,0,0,0.08))',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        zIndex: 10000,
                        padding: 4,
                    }}
                >
                    {suggestions.map((s, idx) => {
                        const active = idx === highlight;
                        return (
                            <div
                                key={s.key}
                                onMouseDown={(e) => { e.preventDefault(); commitSuggestion(s); }}
                                onMouseEnter={() => setHighlight(idx)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '16px 1fr auto',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    background: active ? 'var(--primary-soft, rgba(99,102,241,0.12))' : 'transparent',
                                    color: 'var(--text)',
                                    fontSize: 13,
                                    lineHeight: 1.2,
                                }}
                            >
                                <Hash size={12} style={{ opacity: 0.55 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.tag}
                                </span>
                                <span style={{ fontSize: 11, opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>
                                    {s.count}
                                </span>
                            </div>
                        );
                    })}
                </div>,
                document.body,
            )}
        </>
    );
};
