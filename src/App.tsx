import { useState, useEffect, useRef } from 'react';
import { KnowledgeItem } from './types';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Knowledge } from './pages/Knowledge';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { FileList } from './pages/FileList';
import { Evaluation } from './pages/Evaluation';
import { OperationalProposals } from './pages/OperationalProposals';
import { apiClient } from './api/client';
import { useAuth } from './contexts/AuthContext';
import { AppNotification } from './types';

type Theme = 'light' | 'dark' | 'liquid';
const THEME_ORDER: Theme[] = ['light', 'dark', 'liquid'];

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
                const notes = await apiClient.fetchNotifications(user.id);
                setNotifications(notes);
                setUnreadCount(notes.filter(n => !n.is_read).length);
            } catch (e) {
                console.error("Failed to fetch notifications:", e);
            }
        };

        const fetchKData = async () => {
            try {
                const data = await apiClient.fetchAll();
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

    // 2. リアルタイムサブスクリプション (重複防止のため user のみに依存)
    useEffect(() => {
        if (!user) return;

        const fetchKData = async () => {
            try {
                const data = await apiClient.fetchAll();
                setDashboardData(data);
            } catch (e) {
                console.error("Failed to fetch dashboard data (Realtime):", e);
            }
        };

        const channelName = `global-sync-${user.id}`;
        console.log(`[Realtime] Initializing ${channelName}...`);

        let channel: any;
        
        import('./lib/supabase').then(m => {
            const supabase = m.supabase;
            
            // 既存の同じ名前のチャンネルがある場合は削除してから作成する
            supabase.removeChannel(supabase.channel(channelName));

            channel = supabase.channel(channelName);
            
            channel
                .on(
                    'postgres_changes',
                    { 
                        event: 'INSERT', 
                        schema: 'public', 
                        table: 'notifications',
                        filter: `recipient_id=eq.${user.id}`
                    },
                    (payload: any) => {
                        console.log('[Realtime] New notification received:', payload.new);
                        const newNote = payload.new as AppNotification;
                        setNotifications(prev => [newNote, ...prev].slice(0, 20));
                        setUnreadCount(prev => prev + 1);
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'knowledge' },
                    (payload: any) => {
                        console.log('[Realtime] Knowledge change detected:', payload.eventType);
                        // viewRef を使って最新のビューを確認
                        if (['dashboard', 'filelist', 'evaluation'].includes(viewRef.current)) {
                            fetchKData();
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'master_categories' },
                    (payload: any) => {
                        console.log('[Realtime] Master categories changed:', payload.eventType);
                        // 全体的なリフレッシュを促すため、もし今 Knowledge ビューならデータを再取得する
                        if (viewRef.current === 'knowledge') {
                            // Knowledge.tsx側でも独自にサブスクリプションを持たせる方が綺麗だが、
                            // 現状はページのリロードまたは遷移で対応。
                            // ここで fetchKData を呼んでも Knowledge ページ内の masterData は更新されないため注意。
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'master_incidents' },
                    (payload: any) => {
                        console.log('[Realtime] Master incidents changed:', payload.eventType);
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'profiles' },
                    (payload: any) => {
                        console.log('[Realtime] Profiles (Users) changed:', payload.eventType);
                    }
                )
                .subscribe((status: string) => {
                    console.log(`[Realtime] Status for ${channelName}:`, status);
                });
        });

        return () => {
            if (channel) {
                console.log(`[Realtime] Cleaning up ${channelName}`);
                import('./lib/supabase').then(m => m.supabase.removeChannel(channel));
            }
        };
    }, [user]);

    const prefetchDashboard = async () => {
        setDashboardLoading(true);
        try {
            const d = await apiClient.fetchAll();
            setDashboardData(d);
        } catch (e) { console.error(e); }
        setDashboardLoading(false);
    };

    const navigate = (view: string) => {
        if (view === 'dashboard' || view === 'filelist' || view === 'evaluation') prefetchDashboard();
        setCurrentView(view);
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
                    <Knowledge user={user} onBack={() => navigate('menu')} />
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
                    <Evaluation data={dashboardData} onBack={() => navigate('menu')} user={user} />
                )}
                
                {currentView === 'proposals' && (
                    <OperationalProposals onBack={() => navigate('menu')} user={user} />
                )}
            </div>

            {dashboardLoading && (
                <div className="loading-overlay" style={{ zIndex: 9999 }}>
                    <div style={{ color: 'var(--text)' }}>Loading...</div>
                </div>
            )}
        </div>
    );
}

export default App;
