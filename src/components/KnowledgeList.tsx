import React, { useState } from 'react';
import { KnowledgeItem, User, ReactionType, Attachment } from '../types';
import { RotateCcw, Check, Paperclip, AlertCircle, ChevronDown, ChevronUp, Edit3, AlertOctagon, Wrench, Siren, MessageSquare, Eye } from 'lucide-react';
import { ReactionBar } from './ReactionBar';
import { KnowledgeComments } from './KnowledgeComments';
import { reactionCountsOf, reactionUsersOf } from '../constants/reactions';

// 種別 (トラブル / インシデント) の表示メタ
const RECORD_TYPE_META: Record<'trouble' | 'incident', { label: string; rgb: string; Icon: typeof Wrench }> = {
    trouble: { label: 'トラブル', rgb: '245, 158, 11', Icon: Wrench },
    incident: { label: 'インシデント', rgb: '239, 68, 68', Icon: Siren },
};

// 添付ファイルチップ (画像以外、およびサムネの取れない画像のフォールバック)。クリックで OneDrive 原本
const AttachmentChip: React.FC<{ att: Attachment }> = ({ att }) => (
    <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="attachment-chip"
        onClick={e => e.stopPropagation()}
        title={att.name}
        style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
            fontSize: '0.78rem', color: '#93c5fd', textDecoration: 'none',
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: '8px', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
        <Paperclip size={12} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</span>
    </a>
);

// フィード内のインライン画像。サムネ URL が失効している場合はチップにフォールバックして
// 「添付があるのに見えない・開けない」状態を作らない
const FeedImage: React.FC<{ att: Attachment; single: boolean; moreCount?: number }> = ({ att, single, moreCount }) => {
    const [failed, setFailed] = useState(false);
    const src = att.storageThumbUrl || att.thumbnailUrl;
    // バックフィルで永続サムネが入ったら失敗状態を解除して画像表示に戻す
    React.useEffect(() => { setFailed(false); }, [src]);
    if (failed) {
        return <div onClick={e => e.stopPropagation()}><AttachmentChip att={att} /></div>;
    }
    return (
        <div
            onClick={e => { e.stopPropagation(); window.open(att.url, '_blank', 'noopener'); }}
            title={att.name}
            style={{ position: 'relative', cursor: 'pointer' }}>
            <img
                src={att.storageThumbUrl || att.thumbnailUrl}
                alt={att.name}
                loading="lazy"
                onError={() => setFailed(true)}
                style={{
                    width: '100%',
                    maxHeight: single ? '380px' : undefined,
                    aspectRatio: single ? undefined : '16 / 10',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)',
                    display: 'block',
                }}
            />
            {moreCount ? (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
                    borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 700, fontSize: '1.2rem',
                }}>
                    +{moreCount}
                </div>
            ) : null}
        </div>
    );
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
                        <span className="num" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
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

            {/* フィルタピル: ステータス / 種別 / 区分を横並び (グループ間は縦罫線で区切る)。
                BIZ UDPゴシックは字幅が広く 1366px 幅で横スクロールに隠れるピルが出たため、はみ出す分は折り返す */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', rowGap: '8px', alignItems: 'center', marginBottom: '20px', paddingTop: '4px', paddingBottom: '10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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

                <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

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

                <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

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

            {/* フィード: 中央寄せしつつ画面幅に追従 (狭い画面では全幅、広い画面では 76% を上限 1240px まで) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 'clamp(720px, 76%, 1240px)', margin: '0 auto' }}>
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
                        const catTone = getCategoryColorRgb(item.category || '');
                        const rtMeta = RECORD_TYPE_META[item.recordType ?? 'trouble'];
                        const RtIcon = rtMeta.Icon;
                        const atts = item.attachments ?? [];
                        const images = atts.filter(a => a.type?.startsWith('image/') && (a.storageThumbUrl || a.thumbnailUrl));
                        // 画像以外 + サムネ URL を持たない画像はファイル名チップで見せる (見えない添付を作らない)
                        const fileAtts = atts.filter(a => !images.includes(a));
                        const shownImages = images.slice(0, 4);
                        // フィードでは本文をプレビュー表示 (展開で全文)。SNS タイムライン方針: 閉じて隠さない
                        const clampStyle = (lines: number): React.CSSProperties => isExpanded ? {} : ({
                            display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        } as React.CSSProperties);
                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleExpand(item)}
                                className={`knowledge-card ${item.status}`}
                                style={{
                                    cursor: 'pointer', padding: '14px 16px', marginBottom: 0,
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
                                {/* ヘッダー: 投稿者 + 日付 (SNS の投稿ヘッダー)。右側に種別・ステータス・操作 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    <div
                                        onClick={e => { if (onAuthorClick) { e.stopPropagation(); onAuthorClick(item.author); } }}
                                        title={onAuthorClick ? `${item.author} のプロフィールを見る` : undefined}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            minWidth: 0, overflow: 'hidden', flexShrink: 1,
                                            cursor: onAuthorClick ? 'pointer' : 'default',
                                        }}>
                                        {getAuthorAvatar(item.author) ? (
                                            <img src={getAuthorAvatar(item.author)} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <div className="user-avatar-fallback" style={{ width: '36px', height: '36px', fontSize: '0.95rem', flexShrink: 0 }}>
                                                {getInitial(item.author)}
                                            </div>
                                        )}
                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3, color: '#e2e8f0', overflowWrap: 'anywhere' }}>{item.author}</div>
                                            <div className="num" style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(item.createdAt ?? item.updatedAt).toLocaleDateString()} ・ No.{index + 1}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }} />
                                    {(item.claimLevel ?? 0) > 0 && (
                                        <span
                                            title={`クレーム強度 ${item.claimLevel}/10`}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                                                height: '28px', padding: '0 8px', boxSizing: 'border-box', lineHeight: 1,
                                                fontSize: '0.72rem', fontWeight: 700, color: '#fff',
                                                background: `rgba(239, 68, 68, ${0.2 + 0.05 * (item.claimLevel ?? 0)})`,
                                                border: '1px solid rgba(239, 68, 68, 0.6)', borderRadius: '8px', whiteSpace: 'nowrap',
                                                boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)', textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                                            }}>
                                            <AlertOctagon size={12} style={{ flexShrink: 0 }} />{item.claimLevel}
                                        </span>
                                    )}
                                    <span style={{
                                        display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                                        height: '28px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1,
                                        fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                                        color: `rgb(${rtMeta.rgb})`,
                                        background: `rgba(${rtMeta.rgb}, 0.14)`,
                                        border: `1px solid rgba(${rtMeta.rgb}, 0.4)`,
                                        borderRadius: '8px',
                                    }}>
                                        <RtIcon size={12} style={{ flexShrink: 0 }} />
                                        {rtMeta.label}
                                    </span>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                                        height: '28px', boxSizing: 'border-box', lineHeight: 1,
                                        fontSize: '0.78rem', fontWeight: 700,
                                        color: item.status === 'solved' ? '#22c55e' : '#ef4444',
                                    }}>
                                        {item.status === 'solved'
                                            ? <Check size={14} strokeWidth={3} style={{ display: 'block', flexShrink: 0 }} />
                                            : <AlertCircle size={14} strokeWidth={2.5} style={{ display: 'block', flexShrink: 0 }} />}
                                        {item.status === 'solved' ? '解決済' : '未解決'}
                                    </span>
                                    <button
                                        onClick={e => { e.stopPropagation(); onItemClick(item); }}
                                        title="編集"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: '28px', height: '28px', padding: 0, flexShrink: 0,
                                            background: 'rgba(99,102,241,0.12)', color: '#c7d2fe',
                                            border: '1px solid rgba(99,102,241,0.4)', borderRadius: '6px',
                                            cursor: 'pointer',
                                        }}>
                                        <Edit3 size={12} />
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); toggleExpand(item); }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: '28px', height: '28px', padding: 0, flexShrink: 0,
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                                            borderRadius: '6px', cursor: 'pointer', color: 'var(--muted)',
                                        }} title={isExpanded ? '閉じる' : 'コメントを開く'}>
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                </div>

                                {/* タイトル */}
                                <div style={{ marginTop: '10px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                                    {stripCategoryFromTitle(item.title)}
                                </div>

                                {/* メタ行: 区分・号機・インシデント・タグ */}
                                {(item.category || item.machine || (item.incidents?.length ?? 0) > 0 || (item.tags?.length ?? 0) > 0) && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                                        {item.category && (
                                            <span className={`metadata-badge ${getCategoryBadgeClass(item.category)}`} style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
                                            }}>{item.category}</span>
                                        )}
                                        {item.machine && (
                                            <span className="metadata-badge badge-machine" style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
                                            }}>{item.machine}</span>
                                        )}
                                        {item.incidents && item.incidents.length > 0 && (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{item.incidents.join(', ')}</span>
                                        )}
                                        {item.tags?.map((tag, i) => (
                                            <span key={i} style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>#{tag}</span>
                                        ))}
                                    </div>
                                )}

                                {/* 本文: 事象・対処。フィードでは行クランプでプレビュー、展開で全文 */}
                                {item.phenomenon && (
                                    <div style={{
                                        marginTop: '10px',
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
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', ...clampStyle(4) }}>{item.phenomenon}</div>
                                    </div>
                                )}
                                {item.countermeasure && (
                                    <div style={{
                                        marginTop: '8px',
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
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', ...clampStyle(3) }}>{item.countermeasure}</div>
                                    </div>
                                )}

                                {/* 画像: タイムラインにそのまま表示 (クリックで OneDrive 原本) */}
                                {shownImages.length > 0 && (
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            marginTop: '10px', display: 'grid', gap: '6px',
                                            gridTemplateColumns: shownImages.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                                        }}>
                                        {shownImages.map((att, i) => (
                                            <FeedImage
                                                key={att.id}
                                                att={att}
                                                single={shownImages.length === 1}
                                                moreCount={i === 3 && images.length > 4 ? images.length - 4 : undefined}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* 画像以外の添付 (と、サムネの無い画像): ファイル名チップで常時表示 */}
                                {fileAtts.length > 0 && (
                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                        {fileAtts.map(att => <AttachmentChip key={att.id} att={att} />)}
                                    </div>
                                )}

                                {/* フッター: リアクション (常時押下可) + コメント・添付・閲覧数 */}
                                <div
                                    onClick={e => e.stopPropagation()}
                                    style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px', flexWrap: 'wrap' }}>
                                    <ReactionBar
                                        variant="full"
                                        counts={reactionCountsOf(item)}
                                        users={reactionUsersOf(item)}
                                        myReaction={item.myReaction}
                                        usersMaster={users}
                                        onToggle={onToggleReaction ? (type) => onToggleReaction(item, type) : undefined}
                                    />
                                    <button
                                        className="feed-comment-btn"
                                        onClick={() => toggleExpand(item)}
                                        title={isExpanded ? 'コメントを閉じる' : 'コメントを見る'}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                            height: '28px', padding: '0 10px', boxSizing: 'border-box', lineHeight: 1,
                                            fontSize: '0.78rem', color: '#38bdf8', whiteSpace: 'nowrap',
                                            background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.3)',
                                            borderRadius: '8px', cursor: 'pointer',
                                        }}>
                                        <MessageSquare size={12} /> {commentCount > 0 ? commentCount : 'コメント'}
                                    </button>
                                    {(viewCounts?.[item.id] ?? 0) > 0 && (
                                        <span title={`延べ ${viewCounts?.[item.id]} 回閲覧`} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            fontSize: '0.78rem', color: 'var(--muted)', whiteSpace: 'nowrap', lineHeight: 1,
                                        }}>
                                            <Eye size={12} /> {viewCounts?.[item.id]}
                                        </span>
                                    )}
                                </div>

                                {/* 展開: コメントスレッド (本文はクランプ解除で全文表示) */}
                                {isExpanded && (
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                        <KnowledgeComments
                                            knowledgeId={item.id}
                                            user={user}
                                            usersMaster={users}
                                            onCountChange={(n) => onCommentCountChange?.(item.id, n)}
                                        />
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
