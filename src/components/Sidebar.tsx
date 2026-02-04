import React from 'react';
import { ArrowLeft, Plus, Search, Tags } from 'lucide-react';
import { User, KnowledgeItem } from '../types';
import { motion } from 'framer-motion';

interface SidebarProps {
    user: User;
    onBack: () => void;
    onAdd: () => void;
    onSearch: (keyword: string) => void;
    selectedTags: string[];
    onTagToggle: (tag: string) => void;
    onClearTags: () => void;
    data: KnowledgeItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
    user,
    onBack,
    onAdd,
    onSearch,
    selectedTags,
    onTagToggle,
    onClearTags,
    data
}) => {
    const allTags = Array.from(new Set(data.flatMap(d => d.tags || [])));

    return (
        <motion.aside
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="sidebar"
            style={{
                width: '280px',
                background: 'var(--bg-overlap)',
                backdropFilter: 'blur(10px)',
                borderRight: '1px solid var(--glass-border)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                height: 'calc(100vh - 60px)',
                position: 'sticky',
                top: '60px',
                boxShadow: '4px 0 24px rgba(0,0,0,0.02)'
            }}
        >
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onBack}
                className="secondary-btn"
                style={{ gap: '8px' }}
            >
                <ArrowLeft size={16} /> メニュー
            </motion.button>

            {user.role !== 'viewer' && (
                <motion.button
                    whileHover={{ scale: 1.02, boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onAdd}
                    className="primary-btn"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '12px', background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                        color: 'white', border: 'none', borderRadius: '12px',
                        cursor: 'pointer', fontWeight: 'bold',
                        boxShadow: "0 2px 8px rgba(59, 130, 246, 0.2)"
                    }}
                >
                    <Plus size={16} /> 新規作成
                </motion.button>
            )}

            <div className="search-box" style={{ position: 'relative' }}>
                <input
                    type="text"
                    placeholder="キーワード検索..."
                    onChange={(e) => onSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '12px 12px 12px 40px',
                        border: '1px solid var(--input-border)', borderRadius: '12px',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                        background: 'var(--input-bg)',
                        color: 'var(--text-main)'
                    }}
                    className="search-input"
                />
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                <style>{`
                    .search-input:focus {
                        outline: none;
                        border-color: var(--primary);
                        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                    }
                `}</style>
            </div>

            <div className="tag-cloud-area" style={{ flex: 1, overflowY: 'auto' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Tags size={14} /> タグ一覧
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <motion.span
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onClearTags}
                        style={{
                            padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                            background: selectedTags.length === 0 ? 'var(--primary)' : 'var(--tag-bg)',
                            color: selectedTags.length === 0 ? 'white' : 'var(--tag-text)',
                            border: selectedTags.length === 0 ? 'none' : 'none',
                            boxShadow: selectedTags.length === 0 ? '0 2px 6px rgba(59, 130, 246, 0.2)' : 'none'
                        }}
                    >
                        全て
                    </motion.span>
                    {allTags.map(tag => (
                        <motion.span
                            key={tag}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onTagToggle(tag)}
                            style={{
                                padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                                background: selectedTags.includes(tag) ? 'var(--primary)' : 'var(--tag-bg)',
                                color: selectedTags.includes(tag) ? 'white' : 'var(--tag-text)',
                                border: selectedTags.includes(tag) ? 'none' : 'none',
                                boxShadow: selectedTags.includes(tag) ? '0 2px 6px rgba(59, 130, 246, 0.2)' : 'none'
                            }}
                        >
                            {tag}
                        </motion.span>
                    ))}
                </div>
            </div>
        </motion.aside>
    );
};
