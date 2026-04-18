import { useState, useEffect, useRef, useCallback } from 'react';
import { KnowledgeItem, ChatMessage, ChatProposalRef } from './types';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Knowledge } from './pages/Knowledge';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { FileList } from './pages/FileList';
import { Evaluation } from './pages/Evaluation';
import { OperationalProposals } from './pages/OperationalProposals';
import { AIChatPopover } from './components/AIChatPopover';
import { apiClient } from './api/client';
import { useAuth } from './contexts/AuthContext';
import { AppNotification } from './types';
import { useRealtimeChannel } from './hooks/useRealtimeChannel';
import { searchKnowledge } from './utils/searchUtils';

type Theme = 'light' | 'dark' | 'liquid';
const THEME_ORDER: Theme[] = ['light', 'dark', 'liquid'];

// Supabase が応答しないと永遠に hang するので、全 API 呼び出しに時間制限を付ける
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`timeout: ${label} (${ms}ms)`)), ms),
        ),
    ]);
}

function App() {
    const { user, isLoading, signOut } = useAuth();
    const [currentView, setCurrentView] = useState('menu');
    const [dashboardData, setDashboardData] = useState<KnowledgeItem[]>([]);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        return saved && THEME_ORDER.includes(saved) ? saved : 'liquid';
    });
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [pendingEdit, setPendingEdit] = useState<KnowledgeItem | null>(null);
    const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
    const [proposals, setProposals] = useState<any[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isChatSearching, setIsChatSearching] = useState(false);
    const viewRef = useRef(currentView);
    useEffect(() => { viewRef.current = currentView; }, [currentView]);

    const cycleTheme = () => {
        setTheme(prev => {
            const idx = THEME_ORDER.indexOf(prev);
            return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
        });
    };

    useEffect(() => {
        document.body.dataset.theme = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 通知の取得とリアルタイム更新
    useEffect(() => {
        if (!user) return;

        const fetchNotes = async () => {
            try {
                const notes = await withTimeout(apiClient.fetchNotifications(user.id), 15000, 'fetchNotifications');
                setNotifications(notes);
                setUnreadCount(notes.filter(n => !n.is_read).length);
            } catch (e) {
                console.error("Failed to fetch notifications:", e);
            }
        };

        const fetchKData = async () => {
            try {
                const data = await withTimeout(apiClient.fetchAll(), 20000, 'fetchAll');
                setDashboardData(data);
            } catch (e) {
                console.error("Failed to fetch dashboard data:", e);
            }
        };

        fetchNotes();
        if (['dashboard', 'filelist', 'evaluation'].includes(currentView)) {
            fetchKData();
        }
    }, [user, currentView]);

    // チャット用にナレッジ + 提議を事前取得 (ログイン直後 1 回)
    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const [k, p] = await Promise.all([
                    withTimeout(apiClient.fetchAll(), 20000, 'fetchAll(chat)'),
                    withTimeout(apiClient.fetchProposals(), 20000, 'fetchProposals(chat)').catch(() => []),
                ]);
                setDashboardData(prev => (prev.length ? prev : k));
                setProposals(p);
                if (chatMessages.length === 0) {
                    setChatMessages([{
                        id: 'init', type: 'assistant',
                        text: `ナレッジ ${k.length} 件 / 運用提議 ${p.length} 件 を読み込みました。障害対応のナレッジや、提議で決まったことなど、なんでも聞いてください。`,
                    }]);
                }
            } catch (e) {
                console.warn('chat context preload failed:', e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // 2. リアルタイムサブスクリプション (自動再接続付き)
    const fetchKDataForRealtime = useCallback(async () => {
        try {
            const data = await withTimeout(apiClient.fetchAll(), 20000, 'fetchAll(realtime)');
            setDashboardData(data);
        } catch (e) {
            console.error("Failed to fetch dashboard data (Realtime):", e);
        }
    }, []);

    useRealtimeChannel(
        user ? `global-sync-${user.id}` : '',
        user ? [
            {
                event: 'INSERT',
                table: 'notifications',
                filter: `recipient_id=eq.${user.id}`,
                callback: (payload: any) => {
                    const newNote = payload.new as AppNotification;
                    setNotifications(prev => [newNote, ...prev].slice(0, 20));
                    setUnreadCount(prev => prev + 1);
                },
            },
            {
                event: '*',
                table: 'knowledge',
                callback: () => {
                    if (['dashboard', 'filelist', 'evaluation'].includes(viewRef.current)) {
                        fetchKDataForRealtime();
                    }
                },
            },
            {
                event: '*',
                table: 'master_categories',
                callback: () => { /* Knowledge.tsx 側で処理 */ },
            },
            {
                event: '*',
                table: 'master_incidents',
                callback: () => { /* 必要に応じて処理を追加 */ },
            },
            {
                event: '*',
                table: 'profiles',
                callback: () => { /* 必要に応じて処理を追加 */ },
            },
        ] : []
    );

    const prefetchDashboard = async (showOverlay: boolean) => {
        if (showOverlay) setDashboardLoading(true);
        try {
            const d = await withTimeout(apiClient.fetchAll(), 20000, 'fetchAll(prefetch)');
            setDashboardData(d);
        } catch (e) {
            console.error(e);
        } finally {
            setDashboardLoading(false);
        }
    };

    const navigate = (view: string) => {
        if (view === 'dashboard' || view === 'filelist' || view === 'evaluation') {
            // キャッシュがあるならオーバーレイを出さずバックグラウンド更新
            prefetchDashboard(dashboardData.length === 0);
        }
        setCurrentView(view);
    };

    const handleChatSend = async (text: string) => {
        const userMsg: ChatMessage = { id: `u-${Date.now()}`, type: 'user', text };
        setChatMessages(prev => [...prev, userMsg]);
        setIsChatSearching(true);

        // Gemini へ渡す会話履歴 (直近 8 ターンに絞る)
        const history = chatMessages.slice(-8).map(m => ({
            role: m.type,
            content: m.text,
        }));

        try {
            const res = await apiClient.chatWithGemini(text, history, dashboardData, proposals);
            const knowledgeHits = dashboardData.filter(k => res.knowledgeIds.includes(k.id));
            const proposalHits = proposals
                .filter((p: any) => res.proposalIds.includes(p.id))
                .map((p: any) => ({
                    id: p.id,
                    title: p.title,
                    status: p.status,
                    category: p.category,
                    priority: p.priority,
                }));
            const assistantMsg: ChatMessage = {
                id: `a-${Date.now()}`,
                type: 'assistant',
                text: res.message || '回答を取得できませんでした。',
                results: knowledgeHits.length ? knowledgeHits : undefined,
                proposalResults: proposalHits.length ? proposalHits : undefined,
                noResults: !knowledgeHits.length && !proposalHits.length,
            };
            setChatMessages(prev => [...prev, assistantMsg]);
        } catch (e) {
            console.warn('Gemini failed, falling back to keyword search:', e);
            const results = searchKnowledge(text, dashboardData);
            const fallback: ChatMessage = {
                id: `a-${Date.now()}`,
                type: 'assistant',
                text: results.length
                    ? `(オフライン検索) 「${text}」に関連するナレッジが ${results.length} 件見つかりました。`
                    : `(オフライン検索) 「${text}」に一致するナレッジは見つかりませんでした。Gemini への接続が確立されていない可能性があります。`,
                results: results.length ? results : undefined,
                noResults: !results.length,
            };
            setChatMessages(prev => [...prev, fallback]);
        } finally {
            setIsChatSearching(false);
        }
    };

    const handleChatKnowledgeClick = (item: KnowledgeItem) => {
        setPendingEdit(item);
        navigate('knowledge');
    };

    const handleChatProposalClick = (p: ChatProposalRef) => {
        setPendingProposalId(p.id);
        navigate('proposals');
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div>読み込み中...</div>
            </div>
        );
    }

    if (!user) {
        return <Login />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Header 
                user={user} 
                onLogout={signOut} 
                theme={theme}
                onCycleTheme={cycleTheme}
                notifications={notifications}
                unreadCount={unreadCount}
                onReadNotification={async (id) => {
                    await apiClient.markNotificationAsRead(id);
                    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
                    setUnreadCount(prev => Math.max(0, prev - 1));
                }}
            />

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
                {currentView === 'menu' && (
                    <Menu onNavigate={navigate} role={user.role} />
                )}

                {currentView === 'knowledge' && (
                    <Knowledge
                        user={user}
                        onBack={() => navigate('menu')}
                        initialEditItem={pendingEdit}
                        onInitialEditConsumed={() => setPendingEdit(null)}
                    />
                )}

                {currentView === 'dashboard' && (
                    <Dashboard data={dashboardData} onBack={() => navigate('menu')} />
                )}

                {currentView === 'filelist' && (
                    <FileList data={dashboardData} onBack={() => navigate('menu')} />
                )}

                {currentView === 'admin' && (
                    <Admin user={user} onBack={() => navigate('menu')} />
                )}

                {currentView === 'evaluation' && (
                    <Evaluation
                        data={dashboardData}
                        onBack={() => navigate('menu')}
                        user={user}
                        onItemClick={(item) => { setPendingEdit(item); navigate('knowledge'); }}
                    />
                )}
                
                {currentView === 'proposals' && (
                    <OperationalProposals
                        onBack={() => navigate('menu')}
                        user={user}
                        initialProposalId={pendingProposalId}
                        onInitialProposalConsumed={() => setPendingProposalId(null)}
                    />
                )}
            </div>

            {dashboardLoading && (
                <div className="loading-overlay" style={{ zIndex: 9999 }}>
                    <div style={{ color: 'var(--text)' }}>Loading...</div>
                </div>
            )}

            <AIChatPopover
                chatMessages={chatMessages}
                isChatSearching={isChatSearching}
                onChatSend={handleChatSend}
                onChatResultClick={handleChatKnowledgeClick}
                onProposalClick={handleChatProposalClick}
            />
        </div>
    );
}

export default App;
