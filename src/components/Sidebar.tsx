import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Tags, MessageSquare, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { User, KnowledgeItem, ChatMessage } from '../types';
import { Button } from './common/Button';
import { BackButton } from './common/BackButton';

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
    // Generate unique tags
    const allTags = Array.from(new Set(data.flatMap(d => d.tags || [])));


    return (
        <aside className="sidebar glass-panel" style={{
            width: '320px',
            borderRight: 'none',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            height: '100%',
            overflowY: 'auto',
            borderRadius: 0,
            borderTop: 'none',
            borderBottom: 'none',
            borderLeft: 'none'
        }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <BackButton onClick={onBack} />
                {user.role !== 'viewer' && (
                    <Button 
                        onClick={onAdd} 
                        variant="primary" 
                        icon={<Plus size={16} />} 
                        style={{ flex: 1, height: '40px' }}
                    >
                        新規作成
                    </Button>
                )}
            </div>

            {/* 1. Incident Search */}
            <div className="sidebar-section">
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Search size={14} /> インシデント検索
                </h4>
                <div className="search-box" style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="キーワード検索..."
                        onChange={(e) => onSearch(e.target.value)}
                        className="glass-input"
                        style={{
                            width: '100%', padding: '8px 10px 8px 28px',
                            border: '1px solid var(--glass-border)', borderRadius: '8px',
                            fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text)'
                        }}
                    />
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>
            </div>

            {/* 2. Tags Area */}
            <div className="sidebar-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                    <Tags size={14} /> タグ
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', overflowY: 'auto' }}>
                    <span
                        onClick={onClearTags}
                        className={`sidebar-tag ${selectedTags.length === 0 ? 'active' : ''}`}
                        style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    >
                        全て
                    </span>
                    {allTags.map(tag => (
                        <span
                            key={tag}
                            onClick={() => onTagToggle(tag)}
                            className={`sidebar-tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>



            <style>{`
                .sidebar-section { border-bottom: 1px solid var(--glass-border); padding-bottom: 12px; }
                .sidebar-section:last-child { border-bottom: none; }
                .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .knowledge-card-mini:hover { transform: translateX(3px); border-color: var(--primary); background: rgba(59,130,246,0.05); }
                @keyframes bounce {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                }
            `}</style>
        </aside>
    );
};
