import React, { useState } from 'react';
import { KnowledgeItem, User, ReactionType } from '../types';
import { RotateCcw, Check, Paperclip, AlertCircle, ChevronDown, ChevronUp, Edit3, AlertOctagon, Wrench, Siren, MessageSquare, Eye } from 'lucide-react';
import { ReactionBar } from './ReactionBar';
import { KnowledgeComments } from './KnowledgeComments';
import { reactionCountsOf, reactionUsersOf } from '../constants/reactions';

// 種別 (トラブル / インシデント) の表示メタ
const RECORD_TYPE_META: Record<'trouble' | 'incident', { label: string; rgb: string; Icon: typeof Wrench }> = {
    trouble: { label: 'トラブル', rgb: '245, 158, 11', Icon: Wrench },
    incident: { label: 'インシデント', rgb: '239, 68, 68', Icon: Siren },
};

interface KnowledgeListProps {
    data: KnowledgeItem[];
    totalCount?: number;
    onReload: () => void;
    filterType: 'all' | 'unsolved' | 'solved' | 'mine';
    onFilterChange: (type: 'all' | 'unsolved' | 'solved' | 'mine') => void;
    recordTypeFilter: 'all' | 'trouble' | 'incident';
    onRecordTypeFilterChange: (type: 'all' | 'trouble' | 'incident') => void;
    onItemClick: (item: KnowledgeItem) => void;
    // 展開時のみ押せるリアクション切替 (楽観的 UI + バックグラウンド同期)
    onToggleReaction?: (item: KnowledgeItem, type: ReactionType) => void;
    // コメント数 (knowledge_id → 件数)。折りたたみカードのバッジに使う
    commentCounts?: Record<string, number>;
    onCommentCountChange?: (knowledgeId: string, count: number) => void;
    // 延べ閲覧数 (knowledge_id → total_views)
    viewCounts?: Record<string, number>;
    // カード展開時のフック (閲覧記録など)
    onExpandItem?: (item: KnowledgeItem) => void;
    // 投稿者アバタークリックでプロフィールを開く
    onAuthorClick?: (authorName: string) => void;
    user: User;
    categories: string[];
    selectedCategories: string[];
    onCategoryToggle: (cat: string) => void;
    loading?: boolean;
    loadingMsg?: string;
    users: User[];
}

export const KnowledgeList: React.FC<KnowledgeListProps> = ({
    data,
    totalCount,
    onReload,
    filterType,
    onFilterChange,
    recordTypeFilter,
    onRecordTypeFilterChange,
    onItemClick,
    onToggleReaction,
    commentCounts,
    onCommentCountChange,
    viewCounts,
    onExpandItem,
    onAuthorClick,
    user,
    categories,
    selectedCategories,
    onCategoryToggle,
    loading,
    loadingMsg,
    users
}) => {
    const getCategoryBadgeClass = (category: string): string => {
        const name = category.toLowerCase();
        if (name.includes('dispatcher')) return 'badge-category-dispatcher';
        if (name.includes('construction')) return 'badge-category-construction';
        if (name.includes('after') || name.includes('aftertrouble')) return 'badge-category-after';
        return 'badge-category';
    };

    const stripCategoryFromTitle = (title: string): string => {
        return title.replace(/^\[.*?\]\s*/, '').trim();
    };

    const getAuthorAvatar = (name: string) => {
        const u = users.find(user => user.name === name);
        return u?.avatarUrl;
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    // カードの展開状態 (展開すると事象・対処が読み取り専用で見える)
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const toggleExpand = (item: KnowledgeItem) => {
        const next = expandedId === item.id ? null : item.id;
        setExpandedId(next);
        if (next) onExpandItem?.(item);
    };

    const statusOptions: { value: 'all' | 'unsolved' | 'solved' | 'mine'; label: string }[] = [
        { value: 'all', label: '全て' },
        { value: 'solved', label: '解決済' },
        { value: 'unsolved', label: '未解決' },
        { value: 'mine', label: '自分の投稿' },
    ];

    // フィルタピルの色をバッジ配色と合わせる
    // rgb は "R, G, B" 形式。active 時に rgba(..,0.18/0.6) で背景/ボーダーに使う。
    const statusColorRgb: Record<string, { rgb: string; text: string } | null> = {
        all: null, // default (primary)
        solved: { rgb: '34, 197, 94', text: '#4ade80' },   // 解決済: 緑
        unsolved: { rgb: '239, 68, 68', text: '#fca5a5' }, // 未解決: 赤
        mine: null, // default (primary)
    };
    const getCategoryColorRgb = (cat: string): { rgb: string; text: string } => {
        const n = cat.toLowerCase();
        if (n.includes('dispatcher')) return { rgb: '139, 92, 246', text: '#c4b5fd' }; // 紫
        if (n.includes('construction')) return { rgb: '59, 130, 246', text: '#93c5fd' }; // 青
        if (n.includes('after') || n.includes('aftertrouble')) return { rgb: '249, 115, 22', text: '#fdba74' }; // 橙
        return { rgb: '99, 102, 241', text: '#c7d2fe' }; // デフォルト: インディゴ
    };

    return (
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>ナレッジ一覧</h2>
                    {!loading && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {totalCount !== undefined && totalCount !== data.length
                                ? `${data.length} 件 / 全 ${totalCount} 件`
                                : `全 ${data.length} 件`}
                        </span>
                    )}
                </div>

                <button onClick={onReload} className="secondary-btn" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '8px', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer',
                    minWidth: '36px'
                }} title="更新">
                    <RotateCcw size={18} />
                </button>
            </div>

            {/* Status Filter Badges (overflow-x:auto は overflow-y を 'auto' 化して hover 浮き上がりを切るので、paddingTop/Bottom で余白を確保) */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', flexShrink: 0, paddingTop: '4px', paddingBottom: '4px' }}>
                {statusOptions.map(opt => {
                    const active = filterType === opt.value;
                    const tone = statusColorRgb[opt.value];
                    const bg = active
                        ? (tone ? `rgba(${tone.rgb}, 0.25)` : 'color-mix(in oklab, var(--primary) 55%, transparent)')
                        : 'rgba(255,255,255,0.05)';
                    const border = active
                        ? (tone ? `rgba(${tone.rgb}, 0.65)` : 'color-mix(in oklab, var(--primary) 80%, transparent)')
                        : 'rgba(255,255,255,0.15)';
                    const fg = active ? (tone?.text ?? 'white') : 'rgba(255,255,255,0.6)';
                    return (
                        <button
                            key={opt.value}
                            onClick={() => onFilterChange(opt.value)}
                            className={`cursor-hint-pill${active ? ' is-active' : ''}`}
                            style={{
                                flexShrink: 0,
                                padding: '5px 14px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
                                fontSize: '0.82rem',
                                backgroundColor: bg,
                                color: fg,
                                borderColor: border,
                                fontWeight: active ? 'bold' : 'normal',
                                backdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {active && <Check size={11} />}
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* Record Type Filter Badges (トラブル / インシデント) */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', flexShrink: 0, paddingTop: '4px', paddingBottom: '4px' }}>
                {([
                    { value: 'all', label: '全て', rgb: null as string | null },
                    { value: 'trouble', label: RECORD_TYPE_META.trouble.label, rgb: RECORD_TYPE_META.trouble.rgb },
                    { value: 'incident', label: RECORD_TYPE_META.incident.label, rgb: RECORD_TYPE_META.incident.rgb },
                ] as const).map(opt => {
                    const active = recordTypeFilter === opt.value;
                    const bg = active
                        ? (opt.rgb ? `rgba(${opt.rgb}, 0.25)` : 'color-mix(in oklab, var(--primary) 55%, transparent)')
                        : 'rgba(255,255,255,0.05)';
                    const border = active
                        ? (opt.rgb ? `rgba(${opt.rgb}, 0.65)` : 'color-mix(in oklab, var(--primary) 80%, transparent)')
                        : 'rgba(255,255,255,0.15)';
                    const fg = active ? (opt.rgb ? `rgb(${opt.rgb})` : 'white') : 'rgba(255,255,255,0.6)';
                    return (
                        <button
                            key={opt.value}
                            onClick={() => onRecordTypeFilterChange(opt.value)}
                            className={`cursor-hint-pill${active ? ' is-active' : ''}`}
                            style={{
                                flexShrink: 0,
                                padding: '5px 14px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
                                fontSize: '0.82rem',
                                backgroundColor: bg,
                                color: fg,
                                borderColor: border,
                                fontWeight: active ? 'bold' : 'normal',
                                backdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {active && <Check size={11} />}
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {/* Category Filters */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', paddingTop: '4px', paddingBottom: '10px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
                {categories.map(cat => {
                    const active = selectedCategories.includes(cat);
                    const tone = getCategoryColorRgb(cat);
                    return (
                        <button
                            key={cat}
                            onClick={() => onCategoryToggle(cat)}
                            className={`cursor-hint-pill${active ? ' is-active' : ''}`}
                            style={{
                                flexShrink: 0,
                                padding: '5px 14px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
                                fontSize: '0.82rem',
                                backgroundColor: active ? `rgba(${tone.rgb}, 0.25)` : 'rgba(255,255,255,0.05)',
                                color: active ? tone.text : 'rgba(255,255,255,0.6)',
                                borderColor: active ? `rgba(${tone.rgb}, 0.65)` : 'rgba(255,255,255,0.15)',
                                fontWeight: active ? 'bold' : 'normal',
                                backdropFilter: 'blur(8px)',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {cat}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{loadingMsg || 'データを読み込み中...'}</span>
                    </div>
                ) : data.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px' }}>データがありません</p>
                ) : (
                    data.map((item, index) => {
                        const isExpanded = expandedId === item.id;
                        const commentCount = commentCounts?.[item.id] ?? 0;
                        const hasSubRow = (item.tags && item.tags.length > 0) || (item.attachments && item.attachments.length > 0) || (item.incidents && item.incidents.length > 0) || commentCount > 0;
                        const catTone = getCategoryColorRgb(item.category || '');
                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleExpand(item)}
                                className={`knowledge-card ${item.status}`}
                                style={{
                                    cursor: 'pointer', padding: '10px 14px', marginBottom: 0,
                                    // クレーム時はカードのアクセントを赤系に上書き (強度に応じて濃く)
                                    ['--card-accent' as any]: (item.claimLevel ?? 0) > 0
                                        ? `rgba(239, 68, 68, ${0.5 + 0.05 * (item.claimLevel ?? 0)})`
                                        : `rgba(${catTone.rgb}, 0.9)`,
                                    // クレーム時は左に縦帯 (グロー)。強度が高いほど太く濃く。
                                    boxShadow: (item.claimLevel ?? 0) > 0
                                        ? `inset ${2 + Math.round((item.claimLevel ?? 0) / 2)}px 0 0 rgba(239, 68, 68, ${0.5 + 0.05 * (item.claimLevel ?? 0)}), 0 0 ${8 + 2 * (item.claimLevel ?? 0)}px rgba(239, 68, 68, ${0.08 + 0.02 * (item.claimLevel ?? 0)})`
                                        : undefined,
                                }}
                            >
                                {/* Grid: バッジ類は両行をまたいで垂直中央揃え。タイトルは1行目、タグ/展開ボタンは2行目。
                                    クレームは専用列を廃止し、出る時だけタイトル左にコンパクト表示 (空列で幅を浪費しない) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 74px 96px 90px 130px 90px minmax(0,1fr) 130px 110px 140px',
                                    gridTemplateRows: 'auto auto',
                                    alignItems: 'center',
                                    columnGap: '10px',
                                    rowGap: '4px',
                                }}>
                                    {/* Col 1: 開閉 chevron (両行・カード垂直中央) */}
                                    <button
                                        onClick={e => { e.stopPropagation(); toggleExpand(item); }}
                                        style={{
                                            gridColumn: 1, gridRow: '1 / span 2',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            width: '24px', height: '24px', padding: 0, justifySelf: 'start',
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                                            borderRadius: '6px', cursor: 'pointer', color: 'var(--muted)',
                                        }} title={isExpanded ? '閉じる' : '開く'}>
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {/* ステータス (両行・左寄せ、アイコン + テキストで列揃え) */}
                                    <div style={{ gridColumn: 2, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                            height: '16px',
                                            fontSize: '0.78rem', fontWeight: 700, lineHeight: '16px',
                                            color: item.status === 'solved' ? '#22c55e' : '#ef4444',
                                        }}>
                                            {/* アイコンは visual-center が揃うよう、同一ビューボックスの円形アイコン (Check / AlertCircle) を採用 */}
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                width: '14px', height: '14px', flexShrink: 0,
                                            }}>
                                                {item.status === 'solved'
                                                    ? <Check size={14} strokeWidth={3} style={{ display: 'block' }} />
                                                    : <AlertCircle size={14} strokeWidth={2.5} style={{ display: 'block' }} />}
                                            </span>
                                            <span style={{ lineHeight: '16px', display: 'inline-block' }}>{item.status === 'solved' ? '解決済' : '未解決'}</span>
                                        </span>
                                    </div>
                                    {/* 種別 (両行・左寄せ・トラブル/インシデント) */}
                                    <div style={{ gridColumn: 3, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {(() => {
                                            const meta = RECORD_TYPE_META[item.recordType ?? 'trouble'];
                                            const RtIcon = meta.Icon;
                                            return (
                                                <span style={{
                                                    display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                                                    height: '28px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1,
                                                    fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                                                    color: `rgb(${meta.rgb})`,
                                                    background: `rgba(${meta.rgb}, 0.14)`,
                                                    border: `1px solid rgba(${meta.rgb}, 0.4)`,
                                                    borderRadius: '8px',
                                                }}>
                                                    <RtIcon size={12} style={{ flexShrink: 0 }} />
                                                    {meta.label}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    {/* No (両行・左寄せ・28px 高) */}
                                    <div style={{ gridColumn: 4, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center',
                                            height: '28px', padding: '0 10px', boxSizing: 'border-box',
                                            fontSize: '0.75rem', color: 'var(--muted)',
                                            background: 'rgba(255,255,255,0.05)', borderRadius: '8px',
                                            border: '1px solid var(--glass-border)', whiteSpace: 'nowrap', lineHeight: 1,
                                        }}>
                                            No.{index + 1} / {data.length}
                                        </span>
                                    </div>
                                    {/* 区分 (両行・左寄せ・28px 高) */}
                                    <div style={{ gridColumn: 5, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.category ? (
                                            <span className={`metadata-badge ${getCategoryBadgeClass(item.category)}`} style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                                            }}>{item.category}</span>
                                        ) : null}
                                    </div>
                                    {/* 詳細 (両行・左寄せ・28px 高) */}
                                    <div style={{ gridColumn: 6, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.machine ? (
                                            <span className="metadata-badge badge-machine" style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                                            }}>{item.machine}</span>
                                        ) : null}
                                    </div>

                                    {/* タイトル + 編集ボタン (1行目・左寄せ、常に編集可)。クレームは出る時だけ左にコンパクト表示 */}
                                    <div style={{
                                        gridColumn: 7, gridRow: 1,
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        minWidth: 0, overflow: 'hidden',
                                    }}>
                                        {(item.claimLevel ?? 0) > 0 && (
                                            <span
                                                title={`クレーム強度 ${item.claimLevel}/10`}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                                                    height: '20px', padding: '0 7px', boxSizing: 'border-box', lineHeight: 1,
                                                    fontSize: '0.72rem', fontWeight: 800, color: '#fff',
                                                    background: `rgba(239, 68, 68, ${0.2 + 0.05 * (item.claimLevel ?? 0)})`,
                                                    border: '1px solid rgba(239, 68, 68, 0.6)', borderRadius: '8px', whiteSpace: 'nowrap',
                                                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)', textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                                                }}>
                                                <AlertOctagon size={11} style={{ flexShrink: 0 }} />{item.claimLevel}
                                            </span>
                                        )}
                                        <div style={{
                                            fontSize: '1rem', fontWeight: 700, color: 'var(--text)',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            textAlign: 'left', minWidth: 0, flexShrink: 1,
                                        }}>
                                            {stripCategoryFromTitle(item.title)}
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); onItemClick(item); }}
                                            title="編集"
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                width: '24px', height: '24px', padding: 0, flexShrink: 0,
                                                background: 'rgba(99,102,241,0.12)', color: '#c7d2fe',
                                                border: '1px solid rgba(99,102,241,0.4)', borderRadius: '6px',
                                                cursor: 'pointer',
                                            }}>
                                            <Edit3 size={12} />
                                        </button>
                                    </div>
                                    {/* 2行目・タイトル列: タグ/インシデント/添付 (コンパクト表示時のみ) */}
                                    <div style={{
                                        gridColumn: 7, gridRow: 2,
                                        display: 'flex', flexWrap: 'nowrap', overflow: 'hidden',
                                        gap: '6px', alignItems: 'center', minWidth: 0,
                                    }}>
                                        {!isExpanded && hasSubRow && (
                                            <>
                                                {item.incidents && item.incidents.length > 0 && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{item.incidents.join(', ')}</span>
                                                )}
                                                {item.tags?.map((tag, i) => (
                                                    <span key={i} style={{ fontSize: '0.75rem', color: 'var(--primary)', whiteSpace: 'nowrap' }}>#{tag}</span>
                                                ))}
                                                {item.attachments && item.attachments.length > 0 && (
                                                    <span className="metadata-badge badge-attachment" style={{ height: '24px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1, fontSize: '0.72rem' }}>
                                                        <Paperclip size={11} /> {item.attachments.length}
                                                    </span>
                                                )}
                                                {commentCount > 0 && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '0.72rem', color: '#38bdf8', whiteSpace: 'nowrap', lineHeight: 1,
                                                    }}>
                                                        <MessageSquare size={11} /> {commentCount}
                                                    </span>
                                                )}
                                                {(viewCounts?.[item.id] ?? 0) > 0 && (
                                                    <span title={`延べ ${viewCounts?.[item.id]} 回閲覧`} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap', lineHeight: 1,
                                                    }}>
                                                        <Eye size={11} /> {viewCounts?.[item.id]}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* 投稿者 (両行・左寄せ・中央揃え。クリックでプロフィール) */}
                                    <div style={{ gridColumn: 8, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden' }}>
                                        <div
                                            onClick={e => { if (onAuthorClick) { e.stopPropagation(); onAuthorClick(item.author); } }}
                                            title={onAuthorClick ? `${item.author} のプロフィールを見る` : undefined}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                fontSize: '0.78rem', color: '#94a3b8',
                                                minWidth: 0, overflow: 'hidden',
                                                cursor: onAuthorClick ? 'pointer' : 'default',
                                            }}>
                                            {getAuthorAvatar(item.author) ? (
                                                <img src={getAuthorAvatar(item.author)} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <div className="user-avatar-fallback" style={{ width: '18px', height: '18px', fontSize: '0.6rem', flexShrink: 0 }}>
                                                    {getInitial(item.author)}
                                                </div>
                                            )}
                                            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author}</span>
                                        </div>
                                    </div>
                                    {/* 日付 (両行・中央揃え、フォント 0.78rem で投稿者と合わせる) */}
                                    <div style={{ gridColumn: 9, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center',
                                            height: '28px', padding: '0 10px', boxSizing: 'border-box',
                                            fontSize: '0.78rem', color: 'var(--muted)',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '10px', whiteSpace: 'nowrap', lineHeight: 1,
                                        }}>
                                            {new Date(item.createdAt ?? item.updatedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {/* リアクション集計 (両行・中央揃え。非ゼロの種別のみ表示、押下は展開ビューの ReactionBar で) */}
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            gridColumn: 10, gridRow: '1 / span 2',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                        <ReactionBar
                                            variant="summary"
                                            counts={reactionCountsOf(item)}
                                            users={reactionUsersOf(item)}
                                            myReaction={item.myReaction}
                                            usersMaster={users}
                                        />
                                    </div>
                                </div>

                                {/* 展開: 事象・対処 (読み取り専用) */}
                                {isExpanded && (
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            marginTop: '12px', padding: '12px 14px',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '12px',
                                            display: 'flex', flexDirection: 'column', gap: '12px',
                                        }}>
                                        {/* インシデント・タグ・添付 */}
                                        {((item.incidents && item.incidents.length > 0) || (item.tags && item.tags.length > 0) || (item.attachments && item.attachments.length > 0)) && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                                {item.incidents && item.incidents.length > 0 && (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{item.incidents.join(', ')}</span>
                                                )}
                                                {item.tags?.map((tag, i) => (
                                                    <span key={i} style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>#{tag}</span>
                                                ))}
                                                {item.attachments && item.attachments.length > 0 && (
                                                    <span className="metadata-badge badge-attachment">
                                                        <Paperclip size={12} /> {item.attachments.length}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {/* 事象 (琥珀系アクセント) */}
                                        {item.phenomenon && (
                                            <div style={{
                                                borderLeft: '3px solid #fbbf24',
                                                background: 'rgba(251, 191, 36, 0.06)',
                                                borderRadius: '6px',
                                                padding: '10px 14px',
                                            }}>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px',
                                                    color: '#fbbf24', letterSpacing: '0.05em',
                                                }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }} />
                                                    事象
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.phenomenon}</div>
                                            </div>
                                        )}
                                        {/* 対処 (ミント系アクセント) */}
                                        {item.countermeasure && (
                                            <div style={{
                                                borderLeft: '3px solid #34d399',
                                                background: 'rgba(52, 211, 153, 0.06)',
                                                borderRadius: '6px',
                                                padding: '10px 14px',
                                            }}>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px',
                                                    color: '#34d399', letterSpacing: '0.05em',
                                                }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                                                    対処
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.countermeasure}</div>
                                            </div>
                                        )}
                                        {/* リアクション (展開時のみ押下可。1人1種の排他トグル) */}
                                        <ReactionBar
                                            variant="full"
                                            counts={reactionCountsOf(item)}
                                            users={reactionUsersOf(item)}
                                            myReaction={item.myReaction}
                                            usersMaster={users}
                                            onToggle={onToggleReaction ? (type) => onToggleReaction(item, type) : undefined}
                                        />
                                        {/* コメントスレッド */}
                                        <KnowledgeComments
                                            knowledgeId={item.id}
                                            user={user}
                                            usersMaster={users}
                                            onCountChange={(n) => onCommentCountChange?.(item.id, n)}
                                        />
                                        {/* 編集はタイトル右のボタンに集約しているのでここでは出さない */}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
