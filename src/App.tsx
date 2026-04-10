import { useState, useEffect } from 'react';
import { KnowledgeItem } from './types';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Knowledge } from './pages/Knowledge';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { Chat } from './pages/Chat';
import { apiClient } from './api/client';
import { useAuth } from './contexts/AuthContext';

function App() {
    const { user, isLoading, signOut } = useAuth();
    const [currentView, setCurrentView] = useState('menu');
    const [dashboardData, setDashboardData] = useState<KnowledgeItem[]>([]);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
        localStorage.setItem('darkMode', String(darkMode));
    }, [darkMode]);

    const prefetchDashboard = async () => {
        setDashboardLoading(true);
        try {
            const d = await apiClient.fetchAll();
            setDashboardData(d);
        } catch (e) { console.error(e); }
        setDashboardLoading(false);
    };

    const navigate = (view: string) => {
        if (view === 'dashboard' || view === 'chat') prefetchDashboard();
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
        <>
            <Header user={user} onLogout={signOut} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />

            {currentView === 'menu' && (
                <Menu onNavigate={navigate} role={user.role} />
            )}

            {currentView === 'knowledge' && (
                <Knowledge user={user} onBack={() => navigate('menu')} />
            )}

            {currentView === 'dashboard' && (
                <Dashboard data={dashboardData} onBack={() => navigate('menu')} />
            )}

            {currentView === 'chat' && (
                <Chat data={dashboardData} onBack={() => navigate('menu')} />
            )}

            {currentView === 'admin' && (
                <Admin user={user} onBack={() => navigate('menu')} />
            )}

            {dashboardLoading && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 9999
                }}>
                    <div>Loading...</div>
                </div>
            )}
        </>
    );
}

export default App;
