import React, { useMemo } from 'react';
import { FileText, Eye, Heart } from 'lucide-react';
import { GlassModal } from './common/GlassModal';
import { KnowledgeItem, User } from '../types';
import { REACTION_TYPES, REACTION_META, reactionCountsOf, totalReactions } from '../constants/reactions';

// ユーザープロフィール (貢献の可視化)。一覧カードのアバタークリックで開く。
// 集計はロード済みの knowledge データ + viewCounts からクライアント完結で行い、
// profiles FDW は一切叩かない (author は display_name の text なのでローカル join 可)。

interface UserProfileModalProps {
    open: boolean;
    onClose: () => void;
    profileUser: User | null;
    items: KnowledgeItem[];
    viewCounts?: Record<string, number>;
    onItemClick?: (item: KnowledgeItem) => void;
}

const getInitial = (name: string) => name.charAt(0).toUpperCase();

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
    open,
    onClose,
    profileUser,
    items,
    viewCounts,
    onItemClick,
}) => {
    const myItems = useMemo(() => {
        if (!profileUser) return [];
        return items
            .filter(i => i.author === profileUser.name)
            .sort((a, b) => ((b.createdAt ?? b.updatedAt) || '').localeCompare((a.createdAt ?? a.updatedAt) || ''));
    }, [items, profileUser]);

    const stats = useMemo(() => {
        const reactionByType: Partial<Record<string, number>> = {};
        let reactionTotal = 0;
        let viewTotal = 0;
        for (const item of myItems) {
            const counts = reactionCountsOf(item);
            for (const t of REACTION_TYPES) {
                const n = counts[t] ?? 0;
                if (n > 0) reactionByType[t] = (reactionByType[t] ?? 0) + n;
            }
            reactionTotal += totalReactions(counts);
            viewTotal += viewCounts?.[item.id] ?? 0;
        }
        return { reactionByType, reactionTotal, viewTotal };
    }, [myItems, viewCounts]);

    if (!profileUser) return null;

    const statCards = [
        { label: '投稿', value: myItems.length, Icon: FileText, rgb: '99, 102, 241' },
        { label: '獲得リアクション', value: stats.reactionTotal, Icon: Heart, rgb: '236, 72, 153' },
        { label: '被参照 (延べ)', value: stats.viewTotal, Icon: Eye, rgb: '167, 139, 250' },
    ];

    return (
        <GlassModal
            open={open}
            onClose={onClose}
            title={profileUser.name}
            maxWidth={720}
            icon={profileUser.avatarUrl ? (
                <img src={profileUser.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
                <div className="user-avatar-fallback" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                    {getInitial(profileUser.name)}
                </div>
            )}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 所属グループ */}
                {profileUser.categories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {profileUser.categories.map(cat => (
                            <span key={cat} style={{
                                display: 'inline-flex', alignItems: 'center',
                                height: '24px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1,
                                fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)',
                                background: 'rgba(255,255,255,0.06)', borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap',
                            }}>{cat}</span>
                        ))}
                    </div>
                )}

                {/* 貢献サマリ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {statCards.map(({ label, value, Icon, rgb }) => (
                        <div key={label} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                            padding: '14px 8px', borderRadius: '14px',
                            background: `rgba(${rgb}, 0.08)`,
                            border: `1px solid rgba(${rgb}, 0.3)`,
                        }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: `rgb(${rgb})` }}>
                                <Icon size={14} />
                                <span style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>{value}</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* リアクション内訳 */}
                {stats.reactionTotal > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {REACTION_TYPES.map(t => {
                            const n = stats.reactionByType[t] ?? 0;
                            if (n === 0) return null;
                            const meta = REACTION_META[t];
                            return (
                                <span key={t} style={{
                                    display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                                    height: '28px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1,
                                    fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                                    color: `rgb(${meta.rgb})`,
                                    background: `rgba(${meta.rgb}, 0.14)`,
                                    border: `1px solid rgba(${meta.rgb}, 0.4)`,
                                    borderRadius: '8px',
                                }}>
                                    <meta.Icon size={12} style={{ flexShrink: 0 }} />
                                    {meta.label}・{n}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* 投稿一覧 (作成日降順) */}
                <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                        投稿したナレッジ・{myItems.length}件
                    </div>
                    {myItems.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', padding: '12px 0' }}>
                            まだ投稿はありません
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {myItems.map(item => {
                                const rTotal = totalReactions(reactionCountsOf(item));
                                const vCount = viewCounts?.[item.id] ?? 0;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => onItemClick?.(item)}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '90px minmax(0,1fr) 70px 70px',
                                            alignItems: 'center',
                                            columnGap: '10px',
                                            padding: '8px 10px',
                                            borderRadius: '10px',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            cursor: onItemClick ? 'pointer' : 'default',
                                        }}
                                    >
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                                            {new Date(item.createdAt ?? item.updatedAt).toLocaleDateString()}
                                        </span>
                                        <span style={{
                                            fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {item.title.replace(/^\[.*?\]\s*/, '')}
                                        </span>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center',
                                            fontSize: '0.75rem', color: rTotal > 0 ? '#ec4899' : 'rgba(255,255,255,0.4)', lineHeight: 1,
                                        }}>
                                            <Heart size={11} /> {rTotal}
                                        </span>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center',
                                            fontSize: '0.75rem', color: vCount > 0 ? '#a78bfa' : 'rgba(255,255,255,0.4)', lineHeight: 1,
                                        }}>
                                            <Eye size={11} /> {vCount}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </GlassModal>
    );
};
