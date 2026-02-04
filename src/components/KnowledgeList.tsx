import React from 'react';
import { KnowledgeItem, User } from '../types';
import { RotateCcw, Check, Paperclip, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>ナレッジ一覧</h2>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                        value={filterType}
                        onChange={(e) => onFilterChange(e.target.value as any)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--input-border)', fontSize: '0.9rem', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                    >
                        <option value="all">全て</option>
                        <option value="unsolved">未解決</option>
                        <option value="solved">解決済</option>
                        <option value="mine">自分の投稿</option>
                    </select>

                    <motion.button
                        whileHover={{ scale: 1.05, rotate: 180 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        onClick={onReload}
                        className="secondary-btn"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '10px', border: '1px solid var(--secondary-btn-border)', borderRadius: '8px', background: 'var(--secondary-btn-bg)', cursor: 'pointer',
                            minWidth: '40px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', color: 'var(--text-main)'
                        }}
                        title="更新"
                    >
                        <RotateCcw size={18} />
                    </motion.button>
                </div>
            </div>

            {/* Category Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--card-border)' }}>
                {categories.map(cat => (
                    <motion.button
                        key={cat}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onCategoryToggle(cat)}
                        style={{
                            padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                            fontSize: '0.85rem', fontWeight: selectedCategories.includes(cat) ? '600' : '500',
                            background: selectedCategories.includes(cat) ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'var(--card-bg)',
                            color: selectedCategories.includes(cat) ? 'white' : 'var(--text-muted)',
                            boxShadow: selectedCategories.includes(cat) ? '0 4px 12px rgba(139, 92, 246, 0.3)' : '0 2px 4px rgba(0,0,0,0.05)',
                            transition: 'color 0.2s'
                        }}
                    >
                        {cat}
                    </motion.button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--primary)', marginTop: '40px', fontWeight: 'bold' }}>
                        Loading...
                    </div>
                ) : data.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>データがありません</p>
                ) : (
                    <AnimatePresence>
                        {data.map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={() => onItemClick(item)}
                                className={`knowledge-card ${item.status}`}
                                whileHover={{ y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
                                style={{
                                    background: 'var(--card-bg)',
                                    padding: '20px',
                                    borderRadius: '16px',
                                    border: '1px solid var(--card-border)',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px var(--card-shadow), 0 2px 4px -2px var(--card-shadow)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px',
                                    background: item.status === 'solved' ? 'var(--solved-text)' : 'var(--unsolved-text)'
                                }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingLeft: '12px' }}>
                                    {item.status === 'solved' ? (
                                        <span className="status-badge" style={{ fontSize: '0.75rem', color: 'var(--solved-text)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', background: 'var(--solved-bg)', padding: '2px 8px', borderRadius: '4px' }}>
                                            <Check size={12} /> 解決済
                                        </span>
                                    ) : (
                                        <span className="status-badge" style={{ fontSize: '0.75rem', color: 'var(--unsolved-text)', fontWeight: 'bold', background: 'var(--unsolved-bg)', padding: '2px 8px', borderRadius: '4px' }}>
                                            未解決
                                        </span>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {new Date(item.updatedAt).toLocaleDateString()} | {item.author} | {item.machine}
                                    </div>
                                </div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '12px', paddingLeft: '12px' }}>
                                    {item.title}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', paddingLeft: '12px' }}>
                                    {item.category && <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>[{item.category}] </span>}
                                    {item.incidents?.join(', ')}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', paddingLeft: '12px' }}>
                                    {item.tags?.map((tag, i) => (
                                        <span key={i} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'var(--tag-bg)', padding: '2px 8px', borderRadius: '12px' }}>#{tag}</span>
                                    ))}
                                </div>

                                {item.attachments && item.attachments.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--card-border)', paddingLeft: '12px' }}>
                                        {item.attachments.map((file, idx) => (
                                            <a
                                                key={idx}
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', background: 'var(--tag-bg)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--card-border)', transition: 'background 0.2s' }}
                                                className="attachment-link"
                                            >
                                                <Paperclip size={12} />
                                                <span style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                <Link size={10} style={{ opacity: 0.5 }} />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
            <style>{`
                .attachment-link:hover {
                    background: var(--card-border) !important;
                    color: var(--text-main) !important;
                }
            `}</style>
        </div>
    );
};
