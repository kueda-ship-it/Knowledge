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
    // 展開時のみ押せるリアクション切替 (楽観的 UI + バックグラウンド同期)
    onToggleReaction?: (item: KnowledgeItem, type: 'like' | 'wrong') => void;
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
    onToggleReaction,
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                        const hasSubRow = (item.tags && item.tags.length > 0) || (item.attachments && item.attachments.length > 0) || (item.incidents && item.incidents.length > 0);
                        return (
                            <div
                                key={item.id}
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className={`knowledge-card ${item.status}`}
                                style={{ cursor: 'pointer', padding: '10px 14px', marginBottom: 0 }}
                            >
                                {/* Grid: バッジ類は両行をまたいで垂直中央揃え。タイトルは1行目、タグ/展開ボタンは2行目 */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 74px 90px 130px 90px minmax(0,1fr) 130px 110px 100px',
                                    gridTemplateRows: 'auto auto',
                                    alignItems: 'center',
                                    columnGap: '10px',
                                    rowGap: '4px',
                                }}>
                                    {/* Col 1: 開閉 chevron (両行・カード垂直中央) */}
                                    <button
                                        onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : item.id); }}
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
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            height: '16px', // アイコンサイズ(12px)より少し大きく確保、baseline ずれ防止
                                            fontSize: '0.78rem', fontWeight: 700, lineHeight: '16px',
                                            color: item.status === 'solved' ? '#22c55e' : '#ef4444',
                                        }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', flexShrink: 0 }}>
                                                {item.status === 'solved' ? <Check size={14} strokeWidth={2.5} /> : <AlertTriangle size={14} strokeWidth={2.5} />}
                                            </span>
                                            <span style={{ lineHeight: '16px' }}>{item.status === 'solved' ? '解決済' : '未解決'}</span>
                                        </span>
                                    </div>
                                    {/* No (両行・左寄せ・28px 高) */}
                                    <div style={{ gridColumn: 3, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
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
                                    <div style={{ gridColumn: 4, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.category ? (
                                            <span className={`metadata-badge ${getCategoryBadgeClass(item.category)}`} style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                                            }}>{item.category}</span>
                                        ) : null}
                                    </div>
                                    {/* 詳細 (両行・左寄せ・28px 高) */}
                                    <div style={{ gridColumn: 5, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
                                        {item.machine ? (
                                            <span className="metadata-badge badge-machine" style={{
                                                height: '28px', padding: '0 12px', boxSizing: 'border-box', lineHeight: 1,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                                            }}>{item.machine}</span>
                                        ) : null}
                                    </div>

                                    {/* タイトル + 編集ボタン (1行目・左寄せ、常に編集可) */}
                                    <div style={{
                                        gridColumn: 6, gridRow: 1,
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        minWidth: 0, overflow: 'hidden',
                                    }}>
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
                                        gridColumn: 6, gridRow: 2,
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
                                            </>
                                        )}
                                    </div>

                                    {/* 投稿者 (両行・左寄せ・中央揃え) */}
                                    <div style={{ gridColumn: 7, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden' }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            fontSize: '0.78rem', color: '#94a3b8',
                                            minWidth: 0, overflow: 'hidden',
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
                                    <div style={{ gridColumn: 8, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                    {/* 👍⚠ (両行・中央揃え。展開時のみクリックでトグル) */}
                                    <div
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            gridColumn: 9, gridRow: '1 / span 2',
                                            display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center',
                                            height: '28px', padding: '0 10px', boxSizing: 'border-box',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '20px', border: '1px solid var(--glass-border)',
                                        }}>
                                        <span
                                            onClick={e => { if (isExpanded && onToggleReaction) { e.stopPropagation(); onToggleReaction(item, 'like'); } }}
                                            onMouseEnter={e => (item.likeCount || 0) > 0 && handlePillEnter(`${item.id}-like`, e.currentTarget)}
                                            onMouseLeave={() => setHoveredPill(null)}
                                            title={isExpanded ? 'いいね！をトグル' : '展開してから押せます'}
                                            style={{
                                                position: 'relative', fontSize: '0.78rem',
                                                color: item.myReaction === 'like' ? 'var(--primary)' : (item.likeCount || 0) > 0 ? 'var(--primary)' : 'var(--muted)',
                                                display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, lineHeight: 1,
                                                cursor: isExpanded ? 'pointer' : 'default',
                                                opacity: isExpanded ? 1 : 0.9,
                                            }}>
                                            <ThumbsUp size={12} fill={item.myReaction === 'like' ? 'var(--primary)' : (item.likeCount || 0) > 0 ? 'var(--primary)' : 'transparent'} />
                                            {item.likeCount || 0}
                                            {renderPopover(item.likeUsers, '👍 いいね！', `${item.id}-like`)}
                                        </span>
                                        <span
                                            onClick={e => { if (isExpanded && onToggleReaction) { e.stopPropagation(); onToggleReaction(item, 'wrong'); } }}
                                            onMouseEnter={e => (item.wrongCount || 0) > 0 && handlePillEnter(`${item.id}-wrong`, e.currentTarget)}
                                            onMouseLeave={() => setHoveredPill(null)}
                                            title={isExpanded ? 'だめだねをトグル' : '展開してから押せます'}
                                            style={{
                                                position: 'relative', fontSize: '0.78rem',
                                                color: item.myReaction === 'wrong' ? '#ef4444' : (item.wrongCount || 0) > 0 ? '#ef4444' : 'var(--muted)',
                                                display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, lineHeight: 1,
                                                cursor: isExpanded ? 'pointer' : 'default',
                                                opacity: isExpanded ? 1 : 0.9,
                                            }}>
                                            <AlertTriangle size={12} fill={item.myReaction === 'wrong' ? '#ef4444' : (item.wrongCount || 0) > 0 ? '#ef4444' : 'transparent'} />
                                            {item.wrongCount || 0}
                                            {renderPopover(item.wrongUsers, '⚠ 違うよ！', `${item.id}-wrong`)}
                                        </span>
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
