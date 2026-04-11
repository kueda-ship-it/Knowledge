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

const CACHE_KEY = 'knowledge_data_v1';
const MASTERS_CACHE_KEY = 'knowledge_masters_v1';

function loadCache<T>(key: string, fallback: T): T {
    try {
        const s = localStorage.getItem(key);
        return s ? (JSON.parse(s) as T) : fallback;
    } catch { return fallback; }
}

export const Knowledge: React.FC<KnowledgeProps> = ({ user, onBack }) => {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [data, setData] = useState<KnowledgeItem[]>(() =>
        loadCache<KnowledgeItem[]>(CACHE_KEY, [])
    );
    const [filteredData, setFilteredData] = useState<KnowledgeItem[]>([]);
    const [masterData, setMasterData] = useState<MasterData>(() =>
        loadCache<MasterData>(MASTERS_CACHE_KEY, { incidents: [], categories: [], users: [] })
    );
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        // Auto-update every 60s silently
        const timer = setInterval(() => refreshData(true), 60000);
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

    const refreshData = async (silent = false) => {
        setError(null);
        const hasCache = data.length > 0;

        if (!silent && !hasCache) {
            setLoading(true);
            setLoadingMsg('データを読み込み中...');
        } else {
            setRefreshing(true);
        }

        // Progressive wake-up messages (no timeout — wait until Supabase responds)
        const timers: ReturnType<typeof setTimeout>[] = [];
        if (!hasCache) {
            timers.push(setTimeout(() => setLoadingMsg('接続中... Supabaseが起動中の場合は1分ほどかかります'), 8000));
            timers.push(setTimeout(() => setLoadingMsg('もう少しお待ちください...'), 25000));
            timers.push(setTimeout(() => setLoadingMsg('起動完了まで間もなくです...'), 45000));
        }
        const clearTimers = () => timers.forEach(clearTimeout);

        try {
            const kData = await apiClient.fetchAll();
            clearTimers();

            setData(kData);
            localStorage.setItem(CACHE_KEY, JSON.stringify(kData));
            setLoadingMsg('');
            setLoading(false);
            setRefreshing(false);

            const mData = await apiClient.fetchMasters();
            setMasterData(mData);
            localStorage.setItem(MASTERS_CACHE_KEY, JSON.stringify(mData));
        } catch (e: unknown) {
            clearTimers();
            console.error("Failed to load data", e);
            if (!hasCache) {
                setError('接続できませんでした。Supabaseが起動中の可能性があります。しばらく待ってから再試行してください。');
            }
            setLoadingMsg('');
            setLoading(false);
            setRefreshing(false);
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
                        <>
                        {error && (
                            <div style={{ margin: '20px', padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.9rem' }}>
                                <strong>読み込みエラー:</strong> {error}
                                <button onClick={() => refreshData()} style={{ marginLeft: '12px', padding: '4px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>再試行</button>
                            </div>
                        )}
                        {refreshing && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 20px', fontSize: '0.78rem', color: 'var(--muted)' }}>
                                <div style={{ width: '10px', height: '10px', border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                更新中...
                            </div>
                        )}
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
                            loadingMsg={loadingMsg}
                        />
                        </>
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
