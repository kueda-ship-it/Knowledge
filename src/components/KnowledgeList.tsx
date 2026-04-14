import React, { useState, useRef, useEffect } from 'react';
import { KnowledgeItem, User } from '../types';
import { RotateCcw, Check, Paperclip, ThumbsUp, AlertTriangle, ChevronDown, Filter } from 'lucide-react';

interface KnowledgeListProps {
    data: KnowledgeItem[];
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

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)' }}>ナレッジ一覧</h2>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ position: 'relative' }} ref={filterRef}>
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 16px', borderRadius: '12px', 
                                border: '1px solid var(--glass-border)', 
                                background: 'var(--glass-bg)', color: 'var(--text)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}
                        >
                            <Filter size={16} color="var(--muted)" />
                            {filterType === 'all' && '全て'}
                            {filterType === 'unsolved' && '未解決'}
                            {filterType === 'solved' && '解決済'}
                            {filterType === 'mine' && '自分の投稿'}
                            <ChevronDown size={16} color="var(--muted)" style={{ transition: 'transform 0.2s', transform: isFilterOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                        </button>

                        {isFilterOpen && (
                            <div className="glass-elevated" style={{
                                position: 'absolute',
                                top: '100%', right: 0, marginTop: '8px',
                                borderRadius: '12px',
                                padding: '6px',
                                minWidth: '160px',
                                zIndex: 100,
                                display: 'flex', flexDirection: 'column', gap: '4px',
                                animation: 'chatPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                transformOrigin: 'top right'
                            }}>
                                {[
                                    { value: 'all', label: '全て' },
                                    { value: 'unsolved', label: '未解決' },
                                    { value: 'solved', label: '解決済' },
                                    { value: 'mine', label: '自分の投稿' }
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            onFilterChange(option.value as any);
                                            setIsFilterOpen(false);
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            background: filterType === option.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                            color: filterType === option.value ? '#3b82f6' : 'var(--text)',
                                            border: 'none',
                                            borderRadius: '6px',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: filterType === option.value ? 'bold' : 'normal',
                                            transition: 'background 0.2s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (filterType !== option.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (filterType !== option.value) e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        {option.label}
                                        {filterType === option.value && <Check size={14} />}
                                    </button>
                                ))}
                            </div>
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
            </div>

            {/* Category Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => onCategoryToggle(cat)}
                        style={{
                            padding: '6px 16px', borderRadius: '20px', border: '1px solid var(--glass-border)', cursor: 'pointer',
                            fontSize: '0.85rem',
                            backgroundColor: selectedCategories.includes(cat) ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255,255,255,0.05)',
                            color: selectedCategories.includes(cat) ? 'white' : 'rgba(255,255,255,0.6)',
                            borderColor: selectedCategories.includes(cat) ? 'rgba(99, 102, 241, 0.8)' : 'rgba(255,255,255,0.15)',
                            fontWeight: selectedCategories.includes(cat) ? 'bold' : 'normal',
                            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                            backdropFilter: 'blur(8px)'
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{loadingMsg || 'データを読み込み中...'}</span>
                    </div>
                ) : data.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '40px' }}>データがありません</p>
                ) : (
                    data.map(item => (
                        <div
                            key={item.id}
                            onClick={() => onItemClick(item)}
                            className={`knowledge-card ${item.status}`}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                {item.status === 'solved' ? (
                                    <span style={{ fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                        <Check size={12} /> 解決済
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>
                                        未解決
                                    </span>
                                )}
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="date-badge">{new Date(item.updatedAt).toLocaleDateString()}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px' }}>
                                        {getAuthorAvatar(item.author) ? (
                                            <img src={getAuthorAvatar(item.author)} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#64748b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold' }}>
                                                {getInitial(item.author)}
                                            </div>
                                        )}
                                        <span style={{ fontWeight: '500' }}>{item.author}</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                {item.machine && (
                                    <span className="metadata-badge badge-machine">{item.machine}</span>
                                )}
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                    {stripCategoryFromTitle(item.title)}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                {item.category && (
                                    <span className={`metadata-badge ${getCategoryBadgeClass(item.category)}`}>{item.category}</span>
                                )}
                                {item.incidents && item.incidents.length > 0 && (
                                    <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{item.incidents.join(', ')}</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                {item.tags?.map((tag, i) => (
                                    <span key={i} style={{ fontSize: '0.8rem', color: '#3b82f6' }}>#{tag}</span>
                                ))}
                                {item.attachments && item.attachments.length > 0 && (
                                    <span className="metadata-badge badge-attachment">
                                        <Paperclip size={12} /> {item.attachments.length}
                                    </span>
                                )}
                                <div style={{ 
                                    marginLeft: 'auto', 
                                    display: 'flex', 
                                    gap: '12px', 
                                    alignItems: 'center',
                                    padding: '4px 12px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: '20px',
                                    border: '1px solid var(--glass-border)'
                                }}>
                                    <span style={{ 
                                        fontSize: '0.85rem', 
                                        color: (item.likeCount || 0) > 0 ? '#3b82f6' : 'var(--muted)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontWeight: 'bold',
                                        textShadow: (item.likeCount || 0) > 0 ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none'
                                    }}>
                                        <ThumbsUp size={14} fill={(item.likeCount || 0) > 0 ? '#3b82f6' : 'transparent'} /> 
                                        {item.likeCount || 0}
                                    </span>
                                    <span style={{ 
                                        fontSize: '0.85rem', 
                                        color: (item.wrongCount || 0) > 0 ? '#ef4444' : 'var(--muted)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontWeight: 'bold',
                                        textShadow: (item.wrongCount || 0) > 0 ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none'
                                    }}>
                                        <AlertTriangle size={14} fill={(item.wrongCount || 0) > 0 ? '#ef4444' : 'transparent'} /> 
                                        {item.wrongCount || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
