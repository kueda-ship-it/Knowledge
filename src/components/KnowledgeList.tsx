import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KnowledgeItem, User } from '../types';
import { RotateCcw, Check, Paperclip, ThumbsUp, AlertTriangle, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

interface KnowledgeListProps {
    data: KnowledgeItem[];
    totalCount?: number;
    onReload: () => void;
    filterType: 'all' | 'unsolved' | 'solved' | 'mine';
    onFilterChange: (type: 'all' | 'unsolved' | 'solved' | 'mine') => void;
    onItemClick: (item: KnowledgeItem) => void;
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
    onItemClick,
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

    const [hoveredPill, setHoveredPill] = useState<{ key: string; rect: DOMRect; placement: 'top' | 'bottom' } | null>(null);
    // カードの展開状態 (展開すると事象・対処が読み取り専用で見える)
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handlePillEnter = (key: string, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const midY = window.innerHeight / 2;
        // ピルが画面上半分にある → 下に表示、下半分にある → 上に表示
        const placement: 'top' | 'bottom' = rect.top < midY ? 'bottom' : 'top';
        setHoveredPill({ key, rect, placement });
    };

    const renderPopover = (userIds: string[] | undefined, label: string, key: string) => {
        if (!hoveredPill || hoveredPill.key !== key) return null;
        if (!userIds || userIds.length === 0) return null;
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
                }}>{label}・{userIds.length}人</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {userIds.map(uid => {
                        const u = users.find(x => x.id === uid);
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

    const statusOptions: { value: 'all' | 'unsolved' | 'solved' | 'mine'; label: string }[] = [
        { value: 'all', label: '全て' },
        { value: 'solved', label: '解決済' },
        { value: 'unsolved', label: '未解決' },
        { value: 'mine', label: '自分の投稿' },
    ];

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

            {/* Status Filter Badges */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', flexShrink: 0, paddingBottom: '2px' }}>
                {statusOptions.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => onFilterChange(opt.value)}
                        className={`cursor-hint-pill${filterType === opt.value ? ' is-active' : ''}`}
                        style={{
                            flexShrink: 0,
                            padding: '5px 14px', borderRadius: '20px', border: '1px solid var(--glass-border)', cursor: 'pointer',
                            fontSize: '0.82rem',
                            backgroundColor: filterType === opt.value ? 'color-mix(in oklab, var(--primary) 55%, transparent)' : 'rgba(255,255,255,0.05)',
                            color: filterType === opt.value ? 'white' : 'rgba(255,255,255,0.6)',
                            borderColor: filterType === opt.value ? 'color-mix(in oklab, var(--primary) 80%, transparent)' : 'rgba(255,255,255,0.15)',
                            fontWeight: filterType === opt.value ? 'bold' : 'normal',
                            backdropFilter: 'blur(8px)',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {filterType === opt.value && <Check size={11} />}
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Category Filters */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => onCategoryToggle(cat)}
                        className={`cursor-hint-pill${selectedCategories.includes(cat) ? ' is-active' : ''}`}
                        style={{
                            flexShrink: 0,
                            padding: '5px 14px', borderRadius: '20px', border: '1px solid var(--glass-border)', cursor: 'pointer',
                            fontSize: '0.82rem',
                            backgroundColor: selectedCategories.includes(cat) ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255,255,255,0.05)',
                            color: selectedCategories.includes(cat) ? 'white' : 'rgba(255,255,255,0.6)',
                            borderColor: selectedCategories.includes(cat) ? 'rgba(99, 102, 241, 0.8)' : 'rgba(255,255,255,0.15)',
                            fontWeight: selectedCategories.includes(cat) ? 'bold' : 'normal',
                            backdropFilter: 'blur(8px)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                        return (
                            <div
                                key={item.id}
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className={`knowledge-card ${item.status}`}
                                style={{ cursor: 'pointer', padding: '10px 14px' }}
                            >
                                {/* コンパクト 1行レイアウト (grid) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '80px 66px 130px 70px minmax(0, 1fr) 130px 120px 90px 28px',
                                    alignItems: 'center',
                                    columnGap: '10px',
                                }}>
                                    {/* ステータス */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                        {item.status === 'solved' ? (
                                            <span style={{ fontSize: '0.78rem', color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, lineHeight: 1 }}>
                                                <Check size={12} /> 解決済
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 700, lineHeight: 1 }}>未解決</span>
                                        )}
                                    </div>
                                    {/* No */}
                                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: '8px', border: '1px solid var(--glass-border)', whiteSpace: 'nowrap', justifySelf: 'start' }}>
                                        No.{index + 1} / {data.length}
                                    </span>
                                    {/* 区分 (カテゴリ) */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.category ? (
                                            <span className={`metadata-badge ${getCategoryBadgeClass(item.category)}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{item.category}</span>
                                        ) : null}
                                    </div>
                                    {/* 詳細 (machine) */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.machine ? (
                                            <span className="metadata-badge badge-machine" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{item.machine}</span>
                                        ) : null}
                                    </div>
                                    {/* タイトル */}
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', minWidth: 0 }}>
                                        {stripCategoryFromTitle(item.title)}
                                    </div>
                                    {/* 著者 */}
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden' }}>
                                        {getAuthorAvatar(item.author) ? (
                                            <img src={getAuthorAvatar(item.author)} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <div className="user-avatar-fallback" style={{ width: '18px', height: '18px', fontSize: '0.6rem', flexShrink: 0 }}>
                                                {getInitial(item.author)}
                                            </div>
                                        )}
                                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author}</span>
                                    </div>
                                    {/* 日付 (中央) */}
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <span className="date-badge" style={{ whiteSpace: 'nowrap' }}>{new Date(item.createdAt ?? item.updatedAt).toLocaleDateString()}</span>
                                    </div>
                                    {/* 👍/⚠ (中央) */}
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center',
                                            padding: '4px 10px', background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '20px', border: '1px solid var(--glass-border)',
                                        }}>
                                        <span
                                            onMouseEnter={e => (item.likeCount || 0) > 0 && handlePillEnter(`${item.id}-like`, e.currentTarget)}
                                            onMouseLeave={() => setHoveredPill(null)}
                                            style={{ position: 'relative', fontSize: '0.8rem', color: (item.likeCount || 0) > 0 ? 'var(--primary)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, cursor: 'default' }}>
                                            <ThumbsUp size={12} fill={(item.likeCount || 0) > 0 ? 'var(--primary)' : 'transparent'} />
                                            {item.likeCount || 0}
                                            {renderPopover(item.likeUsers, '👍 いいね！', `${item.id}-like`)}
                                        </span>
                                        <span
                                            onMouseEnter={e => (item.wrongCount || 0) > 0 && handlePillEnter(`${item.id}-wrong`, e.currentTarget)}
                                            onMouseLeave={() => setHoveredPill(null)}
                                            style={{ position: 'relative', fontSize: '0.8rem', color: (item.wrongCount || 0) > 0 ? '#ef4444' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, cursor: 'default' }}>
                                            <AlertTriangle size={12} fill={(item.wrongCount || 0) > 0 ? '#ef4444' : 'transparent'} />
                                            {item.wrongCount || 0}
                                            {renderPopover(item.wrongUsers, '⚠ 違うよ！', `${item.id}-wrong`)}
                                        </span>
                                    </div>
                                    {/* 展開インジケータ (中央) */}
                                    <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--muted)' }}>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>

                                {/* タグ + 添付 (サブ行・コンパクト表示時のみ) */}
                                {!isExpanded && ((item.tags && item.tags.length > 0) || (item.attachments && item.attachments.length > 0) || (item.incidents && item.incidents.length > 0)) && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
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
                                        {/* 事象 */}
                                        {item.phenomenon && (
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.05em' }}>事象</div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.phenomenon}</div>
                                            </div>
                                        )}
                                        {/* 対処 */}
                                        {item.countermeasure && (
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.05em' }}>対処</div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.countermeasure}</div>
                                            </div>
                                        )}
                                        {/* 編集ボタン (展開ビュー下部) */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                                            <button
                                                onClick={() => { setExpandedId(null); onItemClick(item); }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    padding: '6px 14px', borderRadius: '10px', cursor: 'pointer',
                                                    fontSize: '0.82rem',
                                                    background: 'rgba(99,102,241,0.15)', color: '#c7d2fe',
                                                    border: '1px solid rgba(99,102,241,0.45)',
                                                }}>
                                                <Edit3 size={13} /> 編集
                                            </button>
                                        </div>
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
