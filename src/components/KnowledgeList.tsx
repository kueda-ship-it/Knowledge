import React from 'react';
import { KnowledgeItem, User } from '../types';
import { RotateCcw, Check, Paperclip, Link } from 'lucide-react';

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
    loading
}) => {
    return (
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b' }}>ナレッジ一覧</h2>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                        value={filterType}
                        onChange={(e) => onFilterChange(e.target.value as any)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                        <option value="all">全て</option>
                        <option value="unsolved">未解決</option>
                        <option value="solved">解決済</option>
                        <option value="mine">自分の投稿</option>
                    </select>

                    <button onClick={onReload} className="secondary-btn" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer',
                        minWidth: '36px'
                    }} title="更新">
                        <RotateCcw size={18} />
                    </button>
                </div>
            </div>

            {/* Category Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => onCategoryToggle(cat)}
                        style={{
                            padding: '6px 12px', borderRadius: '20px', border: '1px solid #e2e8f0', cursor: 'pointer',
                            fontSize: '0.9rem',
                            backgroundColor: selectedCategories.includes(cat) ? '#8b5cf6' : 'white',
                            color: selectedCategories.includes(cat) ? 'white' : '#64748b',
                            borderColor: selectedCategories.includes(cat) ? '#8b5cf6' : '#e2e8f0',
                            fontWeight: selectedCategories.includes(cat) ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#3b82f6', marginTop: '40px', fontWeight: 'bold' }}>
                        Processing...
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
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    {new Date(item.updatedAt).toLocaleDateString()} | {item.author} | {item.machine}
                                </div>
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                                {item.title}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '8px' }}>
                                {item.category && <span style={{ fontWeight: 'bold' }}>[{item.category}] </span>}
                                {item.incidents?.join(', ')}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                {item.tags?.map((tag, i) => (
                                    <span key={i} style={{ fontSize: '0.8rem', color: '#3b82f6' }}>#{tag}</span>
                                ))}
                            </div>

                            {item.attachments && item.attachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                                    {item.attachments.map((file, idx) => (
                                        <a
                                            key={idx}
                                            href={file.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b', textDecoration: 'none', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}
                                        >
                                            <Paperclip size={12} />
                                            <span>{file.name}</span>
                                            <Link size={10} style={{ opacity: 0.5 }} />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
