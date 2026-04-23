import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { KnowledgeList } from '../components/KnowledgeList';
import { Editor } from '../components/Editor';
import { KnowledgeItem, User, MasterData } from '../types';
import { apiClient, toItem } from '../api/client';
import { useRealtimeChannel } from '../hooks/useRealtimeChannel';
import { loadCache, saveCache } from '../utils/cache';

interface KnowledgeProps {
    user: User;
    onBack: () => void;
    initialEditItem?: KnowledgeItem | null;
    onInitialEditConsumed?: () => void;
}

const CACHE_KEY = 'knowledge_data_v1';
const MASTERS_CACHE_KEY = 'knowledge_masters_v2';

// 作成日 desc でソート。createdAt が空の場合は updatedAt でフォールバック。
// サーバー側でも同じ順にしているが、古いキャッシュ (updated_at desc) が残っていても
// 表示順が崩れないように念のためクライアントでもソートする。
const sortByCreatedDesc = (items: KnowledgeItem[]): KnowledgeItem[] =>
    [...items].sort((a, b) => {
        const ak = (a.createdAt ?? a.updatedAt) || '';
        const bk = (b.createdAt ?? b.updatedAt) || '';
        return bk.localeCompare(ak);
    });

export const Knowledge: React.FC<KnowledgeProps> = ({ user, onBack, initialEditItem, onInitialEditConsumed }) => {
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [data, setData] = useState<KnowledgeItem[]>(() =>
        sortByCreatedDesc(loadCache<KnowledgeItem[]>(CACHE_KEY, []))
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

    // 初回ロード
    useEffect(() => {
        refreshData();
    }, []);

    // Realtimeチャンネル購読（自動再接続付き）
    useRealtimeChannel('knowledge-realtime', [
        {
            event: 'INSERT',
            table: 'knowledge',
            callback: (payload) => {
                const newItem = toItem(payload.new as Record<string, unknown>);
                setData(prev => {
                    if (prev.some(i => i.id === newItem.id)) return prev;
                    const next = [newItem, ...prev];
                    saveCache(CACHE_KEY, next);
                    return next;
                });
            },
        },
        {
            event: 'UPDATE',
            table: 'knowledge',
            callback: (payload) => {
                const updated = toItem(payload.new as Record<string, unknown>);
                setData(prev => {
                    const next = prev.map(i => i.id === updated.id ? { ...i, ...updated } : i);
                    saveCache(CACHE_KEY, next);
                    return next;
                });
            },
        },
        {
            event: 'DELETE',
            table: 'knowledge',
            callback: (payload) => {
                const deletedId = (payload.old as { id: string }).id;
                setData(prev => {
                    const next = prev.filter(i => i.id !== deletedId);
                    saveCache(CACHE_KEY, next);
                    return next;
                });
            },
        },
    ]);

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
        if (loading || refreshing) return;
        setError(null);
        const hasCache = data.length > 0;

        if (!silent && !hasCache) {
            setLoading(true);
            setLoadingMsg('データを読み込み中...');
        } else {
            setRefreshing(true);
        }

        // 初回（キャッシュなし）のみウェイクアップメッセージを表示。サイレント更新中は出さない
        const timers: ReturnType<typeof setTimeout>[] = [];
        if (!silent && !hasCache) {
            timers.push(setTimeout(() => setLoadingMsg('接続中... Supabaseが起動中の場合は1分ほどかかります'), 8000));
            timers.push(setTimeout(() => setLoadingMsg('もう少しお待ちください...'), 25000));
            timers.push(setTimeout(() => setLoadingMsg('起動完了まで間もなくです...'), 45000));
        }

        const clearTimers = () => {
            timers.forEach(clearTimeout);
            setLoadingMsg('');
        };

        // 独自タイムアウトを廃止し、ネットワーク・ブラウザの制限に任せる
        // 低速環境でもエラーで中断させないための処置

        // ナレッジ一覧とマスタ取得
        const fetchKnowledge = async () => {
            try {
                const raw = await apiClient.fetchAll();
                const kData = sortByCreatedDesc(raw);
                setData(kData);
                saveCache(CACHE_KEY, kData);
            } catch (e) {
                console.error("Knowledge load error:", e);
                // キャッシュがない場合のみエラーを投げる
                if (!hasCache) throw e;
            }
        };

        const fetchMasters = async () => {
            try {
                const mData = await apiClient.fetchMasters();
                setMasterData(mData);
                saveCache(MASTERS_CACHE_KEY, mData);
            } catch (e) {
                console.warn("Masters background load delayed or failed:", e);
            }
        };

        try {
            // 片方が失敗してももう片方を活かすため並列実行
            await Promise.allSettled([fetchKnowledge(), fetchMasters()]);
            
            clearTimers();
            setLoading(false);
            setRefreshing(false);
        } catch (e: unknown) {
            clearTimers();
            if (!silent) console.error("Failed to load data", e);
            if (!hasCache) {
                setError('データの読み込みに失敗しました。ネットワーク環境を確認してください。');
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

    const handleEditItem = async (item: KnowledgeItem) => {
        // fetchAll で全フィールド取得済みのため、キャッシュを即座に表示
        setEditingItem(item);
        setView('editor');
        // バックグラウンドで最新詳細を取得し、取得できたら更新（失敗してもキャッシュ表示のまま）
        try {
            const full = await apiClient.fetchOne(item.id, (user as any).id);
            setEditingItem(full || item);
        } catch (e) {
            console.warn('[fetchOne] failed, keeping cached item', e);
        }
    };

    // 外部から渡された編集対象があれば自動で編集モードに入る（Evaluation からの遷移など）
    useEffect(() => {
        if (initialEditItem) {
            handleEditItem(initialEditItem);
            onInitialEditConsumed?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialEditItem]);

    const handleSave = async (updatedItem: KnowledgeItem, shouldClose = true) => {
        setData(prev => {
            const index = prev.findIndex(i => i.id === updatedItem.id);
            if (index === -1) return [updatedItem, ...prev];
            const next = [...prev];
            next[index] = updatedItem;
            return next;
        });
        setEditingItem(updatedItem);
        if (shouldClose) {
            setView('list');
            await refreshData(true);
        }
    };

    const handleDelete = async () => {
        await refreshData();
        setView('list');
    };

    return (
        <div className="view active" style={{ display: 'flex', height: '100%' }}>
            <div className="container" style={{ display: 'flex', width: '100%', height: '100%' }}>
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

                <main className="main-content" style={{ flex: 1, backgroundColor: 'var(--bg)', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {view === 'list' ? (
                        <>
                        {error && (
                            <div style={{ margin: '20px', padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.9rem' }}>
                                <strong>読み込みエラー:</strong> {error}
                                <button onClick={() => refreshData()} className="cursor-hint-danger" style={{ marginLeft: '12px', padding: '4px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>再試行</button>
                            </div>
                        )}
                        <KnowledgeList
                            data={filteredData}
                            totalCount={data.length}
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
                            users={masterData.users}
                        />
                        </>
                    ) : (
                        <div style={{ padding: 'var(--space-lg)', overflowY: 'auto' }}>
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
