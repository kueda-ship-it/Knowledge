import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Tags, MessageSquare, Send, CheckCircle, AlertCircle, List, ChevronDown, X } from 'lucide-react';
import { User, KnowledgeItem, ChatMessage } from '../types';
import { Button } from './common/Button';
import { BackButton } from './common/BackButton';
import { GlassSelect } from './common/GlassSelect';

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

    // タグの検索キーワードと表示モード (一覧 / プルダウン)
    const [tagQuery, setTagQuery] = useState('');
    const [tagMode, setTagMode] = useState<'list' | 'dropdown'>('list');
    const filteredTags = allTags.filter(t => t.toLowerCase().includes(tagQuery.toLowerCase()));


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

            {/* 1. Incident Search — 見出しとアイコンは削除し、検索窓のみ */}
            <div className="sidebar-section">
                <div className="search-box" style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="インシデント検索..."
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--muted)', fontSize: '0.8rem' }}>
                        <Tags size={14} /> タグ
                    </h4>
                    {/* 一覧 / プルダウン 切替 */}
                    <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
                        {([
                            { mode: 'list' as const, Icon: List, title: '一覧' },
                            { mode: 'dropdown' as const, Icon: ChevronDown, title: 'プルダウン' },
                        ]).map(({ mode, Icon, title }) => (
                            <button
                                key={mode}
                                onClick={() => setTagMode(mode)}
                                title={title}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '26px', height: '22px', padding: 0, borderRadius: '6px', cursor: 'pointer', border: 'none',
                                    background: tagMode === mode ? 'color-mix(in oklab, var(--primary) 40%, transparent)' : 'transparent',
                                    color: tagMode === mode ? '#fff' : 'var(--muted)',
                                }}>
                                <Icon size={13} />
                            </button>
                        ))}
                    </div>
                </div>

                {/* タグ検索 */}
                <div style={{ position: 'relative', marginBottom: '8px', flexShrink: 0 }}>
                    <input
                        type="text"
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value)}
                        placeholder="タグを検索..."
                        className="glass-input"
                        style={{
                            width: '100%', padding: '6px 8px 6px 26px',
                            border: '1px solid var(--glass-border)', borderRadius: '8px',
                            fontSize: '0.8rem', background: 'var(--input-bg)', color: 'var(--text)',
                        }}
                    />
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
                </div>

                {tagMode === 'list' ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', overflowY: 'auto' }}>
                        <span
                            onClick={onClearTags}
                            className={`sidebar-tag ${selectedTags.length === 0 ? 'active' : ''}`}
                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                        >
                            全て
                        </span>
                        {filteredTags.map(tag => (
                            <span
                                key={tag}
                                onClick={() => onTagToggle(tag)}
                                className={`sidebar-tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                                style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                            >
                                {tag}
                            </span>
                        ))}
                        {filteredTags.length === 0 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>該当するタグなし</span>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                        {/* プルダウン: 選択するとタグをトグル */}
                        <div style={{ border: '1px solid var(--input-border)', borderRadius: '8px', background: 'var(--input-bg)', flexShrink: 0 }}>
                            <GlassSelect
                                value=""
                                onChange={(v) => { if (v) onTagToggle(v); }}
                                options={[
                                    { value: '', label: tagQuery ? `「${tagQuery}」で絞り込み` : 'タグを選択...' },
                                    ...filteredTags.map(t => ({ value: t, label: selectedTags.includes(t) ? `✓ ${t}` : t })),
                                ]}
                            />
                        </div>
                        {/* 選択中タグ */}
                        {selectedTags.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                {selectedTags.map(tag => (
                                    <span
                                        key={tag}
                                        onClick={() => onTagToggle(tag)}
                                        className="sidebar-tag active"
                                        style={{ fontSize: '0.7rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {tag} <X size={10} />
                                    </span>
                                ))}
                                <span onClick={onClearTags} style={{ fontSize: '0.68rem', color: 'var(--muted)', cursor: 'pointer' }}>クリア</span>
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>タグ未選択（全件表示）</span>
                        )}
                    </div>
                )}
            </div>



            <style>{`
                .sidebar-section { border-bottom: 1px solid var(--glass-border); padding-bottom: 12px; }
                .sidebar-section:last-child { border-bottom: none; }
                .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .knowledge-card-mini:hover { transform: translateX(3px); border-color: var(--primary); background: color-mix(in oklab, var(--primary) 7%, transparent); }
                @keyframes bounce {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                }
            `}</style>
        </aside>
    );
};
