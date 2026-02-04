import React from 'react';
import { ArrowLeft, Plus, Search, Tags } from 'lucide-react';
import { User, KnowledgeItem } from '../types';

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
        <aside className="sidebar" style={{
            width: '280px',
            backgroundColor: 'white',
            borderRight: '1px solid #e2e8f0',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            height: 'calc(100vh - 60px)',
            position: 'sticky',
            top: '60px'
        }}>
            <button onClick={onBack} className="secondary-btn" style={{ gap: '8px' }}>
                <ArrowLeft size={16} /> メニュー
            </button>

            {user.role !== 'viewer' && (
                <button onClick={onAdd} className="primary-btn" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
                }}>
                    <Plus size={16} /> 新規作成
                </button>
            )}

            <div className="search-box" style={{ position: 'relative' }}>
                <input
                    type="text"
                    placeholder="キーワード検索..."
                    onChange={(e) => onSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '10px 10px 10px 35px',
                        border: '1px solid #e2e8f0', borderRadius: '8px',
                        fontSize: '0.9rem'
                    }}
                />
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: '#94a3b8' }} />
            </div>

            <div className="tag-cloud-area" style={{ flex: 1, overflowY: 'auto' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#64748b', fontSize: '0.9rem' }}>
                    <Tags size={16} /> タグ一覧
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <span
                        onClick={onClearTags}
                        style={{
                            padding: '4px 10px', borderRadius: '15px', fontSize: '0.8rem', cursor: 'pointer',
                            backgroundColor: selectedTags.length === 0 ? '#3b82f6' : '#f1f5f9',
                            color: selectedTags.length === 0 ? 'white' : '#475569'
                        }}
                    >
                        全て
                    </span>
                    {allTags.map(tag => (
                        <span
                            key={tag}
                            onClick={() => onTagToggle(tag)}
                            style={{
                                padding: '4px 10px', borderRadius: '15px', fontSize: '0.8rem', cursor: 'pointer',
                                backgroundColor: selectedTags.includes(tag) ? '#3b82f6' : '#f1f5f9',
                                color: selectedTags.includes(tag) ? 'white' : '#475569'
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </aside>
    );
};
