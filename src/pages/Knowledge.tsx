import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { KnowledgeList } from '../components/KnowledgeList';
import { Editor } from '../components/Editor';
import { KnowledgeItem, User, MasterData } from '../types';
import { apiClient } from '../api/client';

interface KnowledgeProps {
    user: User;
    onBack: () => void;
}

export const Knowledge: React.FC<KnowledgeProps> = ({ user, onBack }) => {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [data, setData] = useState<KnowledgeItem[]>([]);
    const [filteredData, setFilteredData] = useState<KnowledgeItem[]>([]);
    const [masterData, setMasterData] = useState<MasterData>({ incidents: [], categories: [], users: [] });
    const [loading, setLoading] = useState(false);

    // Filters state
    const [searchKeyword, setSearchKeyword] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'all' | 'unsolved' | 'solved' | 'mine'>('all');

    // Editor state
    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);

    // Initial load
    useEffect(() => {
        refreshData();
        // Auto-update every 60s
        const timer = setInterval(refreshData, 60000);
        return () => clearInterval(timer);
    }, []);

    // Filter effect
    useEffect(() => {
        let res = [...data];

        // 1. Search
        if (searchKeyword) {
            const k = searchKeyword.toLowerCase();
            res = res.filter(item => JSON.stringify(item).toLowerCase().includes(k));
        }

        // 2. Tags (OR logic: match any selected tag)
        if (selectedTags.length > 0) {
            res = res.filter(item => item.tags && item.tags.some(t => selectedTags.includes(t)));
        }

        // 3. Categories (OR logic: match any selected category)
        if (selectedCategories.length > 0) {
            res = res.filter(item => item.category && selectedCategories.includes(item.category));
        }

        // 4. Status/Type Filter
        if (filterType === 'unsolved') {
            res = res.filter(item => item.status !== 'solved');
        } else if (filterType === 'solved') {
            res = res.filter(item => item.status === 'solved');
        } else if (filterType === 'mine') {
            res = res.filter(item => item.author === user.name);
        }

        // Sort: newest first
        res.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        setFilteredData(res);
    }, [data, searchKeyword, selectedTags, selectedCategories, filterType, user]);

    const refreshData = async () => {
        setLoading(true);
        try {
            // ナレッジを先に取得してリストを表示し、マスタは後から取得
            const kData = await apiClient.fetchAll();
            setData(kData);
            setLoading(false);

            const mData = await apiClient.fetchMasters();
            setMasterData(mData);
        } catch (e) {
            console.error("Failed to load data", e);
            setLoading(false);
        }
    };

    const handleAddItem = () => {
        setEditingItem(null);
        setView('editor');
    };

    const handleEditItem = (item: KnowledgeItem) => {
        setEditingItem(item);
        setView('editor');
    };

    const handleSave = async () => {
        await refreshData();
        setView('list');
    };

    const handleDelete = async () => {
        await refreshData();
        setView('list');
    };

    return (
        <div className="view active" style={{ display: 'flex' }}>
            <div className="container" style={{ display: 'flex', width: '100%' }}>
                <Sidebar
                    user={user}
                    onBack={onBack}
                    onAdd={handleAddItem}
                    onSearch={setSearchKeyword}
                    selectedTags={selectedTags}
                    onTagToggle={(tag) => {
                        setSelectedTags(prev =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                    }}
                    onClearTags={() => setSelectedTags([])}
                    data={data}
                />

                <main className="main-content" style={{ flex: 1, backgroundColor: 'var(--bg)', height: 'calc(100vh - 60px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {view === 'list' ? (
                        <KnowledgeList
                            data={filteredData}
                            onReload={refreshData}
                            filterType={filterType}
                            onFilterChange={setFilterType}
                            onItemClick={handleEditItem}
                            user={user}
                            categories={masterData.categories}
                            selectedCategories={selectedCategories}
                            onCategoryToggle={(cat) => {
                                setSelectedCategories(prev =>
                                    prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                                );
                            }}
                            loading={loading}
                        />
                    ) : (
                        <div style={{ padding: '20px', overflowY: 'auto' }}>
                            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <Editor
                                    item={editingItem}
                                    masters={masterData}
                                    onSave={handleSave}
                                    onDelete={handleDelete}
                                    onCancel={() => setView('list')}
                                    user={user}
                                />
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
