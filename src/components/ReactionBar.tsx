import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactionType, User } from '../types';
import { REACTION_META, REACTION_TYPES } from '../constants/reactions';

interface ReactionBarProps {
    counts: Partial<Record<ReactionType, number>>;
    users?: Partial<Record<ReactionType, string[]>>;
    myReaction?: ReactionType | null;
    // 未指定なら読み取り専用 (一覧の折りたたみ表示など)
    onToggle?: (type: ReactionType) => void;
    // ポップオーバーの名前解決用 (profiles FDW は叩かずローカルマスタで解決)
    usersMaster: User[];
    // summary: 非ゼロのみのコンパクト表示 / full: 全種別のトグルボタン
    variant: 'summary' | 'full';
}

const getInitial = (name: string) => name.charAt(0).toUpperCase();

export const ReactionBar: React.FC<ReactionBarProps> = ({
    counts,
    users,
    myReaction,
    onToggle,
    usersMaster,
    variant,
}) => {
    const [hoveredPill, setHoveredPill] = useState<{ key: string; rect: DOMRect; placement: 'top' | 'bottom' } | null>(null);

    const handlePillEnter = (key: string, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const midY = window.innerHeight / 2;
        // ピルが画面上半分にある → 下に表示、下半分にある → 上に表示
        const placement: 'top' | 'bottom' = rect.top < midY ? 'bottom' : 'top';
        setHoveredPill({ key, rect, placement });
    };

    const renderPopover = (type: ReactionType) => {
        const key = `pop-${type}`;
        if (!hoveredPill || hoveredPill.key !== key) return null;
        const userIds = users?.[type];
        if (!userIds || userIds.length === 0) return null;
        const meta = REACTION_META[type];
        const { rect, placement } = hoveredPill;
        const positionStyle: React.CSSProperties = placement === 'bottom'
            ? { top: rect.bottom + 10, right: window.innerWidth - rect.right }
            : { bottom: window.innerHeight - rect.top + 10, right: window.innerWidth - rect.right };
        const node = (
            <div
                style={{
                    position: 'fixed',
                    ...positionStyle,
                    minWidth: 220,
                    maxWidth: 320,
                    padding: '10px 8px 8px',
                    borderRadius: 14,
                    zIndex: 99999,
                    background: 'rgba(24, 28, 40, 0.92)',
                    backdropFilter: 'blur(28px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 2px 0 0 rgba(255,255,255,0.08) inset, 0 16px 48px 0 rgba(0,0,0,0.45), 0 4px 12px 0 rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                    pointerEvents: 'none',
                }}
            >
                <div style={{
                    padding: '4px 8px 8px',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.7)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    marginBottom: 4,
                }}>{meta.label}・{userIds.length}人</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {userIds.map(uid => {
                        const u = usersMaster.find(x => x.id === uid);
                        const name = u?.name || '不明';
                        return (
                            <div key={uid} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '6px 8px',
                                borderRadius: 8,
                                fontSize: '0.85rem',
                                color: 'rgba(255,255,255,0.95)',
                            }}>
                                {u?.avatarUrl ? (
                                    <img
                                        src={u.avatarUrl}
                                        alt=""
                                        style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                    />
                                ) : (
                                    <div className="user-avatar-fallback" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                                        {getInitial(name)}
                                    </div>
                                )}
                                <span>{name}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
        return createPortal(node, document.body);
    };

    if (variant === 'summary') {
        // 非ゼロの種別のみコンパクト表示。1件も無ければ like を 0 で薄く出す (列を空にしない)
        const visible = REACTION_TYPES.filter(t => (counts[t] ?? 0) > 0);
        const types = visible.length > 0 ? visible : (['like'] as ReactionType[]);
        return (
            <div style={{
                display: 'inline-flex', gap: '10px', alignItems: 'center', justifyContent: 'center',
                height: '28px', padding: '0 10px', boxSizing: 'border-box',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '20px', border: '1px solid var(--glass-border)',
            }}>
                {types.map(type => {
                    const meta = REACTION_META[type];
                    const count = counts[type] ?? 0;
                    const active = count > 0 || myReaction === type;
                    return (
                        <span
                            key={type}
                            onMouseEnter={e => count > 0 && handlePillEnter(`pop-${type}`, e.currentTarget)}
                            onMouseLeave={() => setHoveredPill(null)}
                            title={meta.label}
                            style={{
                                position: 'relative', fontSize: '0.78rem',
                                color: active ? `rgb(${meta.rgb})` : 'var(--muted)',
                                display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700,
                                height: '16px', lineHeight: 1,
                            }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', flexShrink: 0 }}>
                                <meta.Icon size={12} style={{ display: 'block' }} />
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '16px', minWidth: '8px' }}>{count}</span>
                            {renderPopover(type)}
                        </span>
                    );
                })}
            </div>
        );
    }

    // full: 全種別のトグルボタン (Teams 風)。自分のリアクションは塗り + グロー。
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {REACTION_TYPES.map(type => {
                const meta = REACTION_META[type];
                const count = counts[type] ?? 0;
                const mine = myReaction === type;
                return (
                    <button
                        key={type}
                        type="button"
                        onClick={() => onToggle?.(type)}
                        onMouseEnter={e => count > 0 && handlePillEnter(`pop-${type}`, e.currentTarget)}
                        onMouseLeave={() => setHoveredPill(null)}
                        title={`${meta.label}をトグル`}
                        style={{
                            position: 'relative',
                            display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                            height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                            fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
                            color: mine ? `rgb(${meta.rgb})` : count > 0 ? `rgba(${meta.rgb}, 0.9)` : 'var(--muted)',
                            background: mine ? `rgba(${meta.rgb}, 0.22)` : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${mine ? `rgba(${meta.rgb}, 0.65)` : 'var(--glass-border)'}`,
                            borderRadius: '14px',
                            cursor: onToggle ? 'pointer' : 'default',
                            boxShadow: mine ? `0 0 12px rgba(${meta.rgb}, 0.35)` : 'none',
                            transition: 'all 0.2s ease',
                        }}>
                        <meta.Icon size={12} style={{ flexShrink: 0 }} fill={mine ? `rgb(${meta.rgb})` : 'transparent'} />
                        <span>{meta.label}</span>
                        <span style={{ minWidth: '8px', textAlign: 'center' }}>{count}</span>
                        {renderPopover(type)}
                    </button>
                );
            })}
        </div>
    );
};
