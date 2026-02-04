import { useState, useEffect } from 'react';
import { User, KnowledgeItem } from './types';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Knowledge } from './pages/Knowledge';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { apiClient } from './api/client';

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState('login');
    const [loading, setLoading] = useState(false);

    // Dashboard data cache
    const [data, setData] = useState<KnowledgeItem[]>([]);

    useEffect(() => {
        // Check local storage for session
        const stored = localStorage.getItem('kb_user');
        if (stored) {
            try {
                const u = JSON.parse(stored);
                setUser(u);
                setCurrentView('menu');
            } catch (e) {
                localStorage.removeItem('kb_user');
            }
        }
    }, []);

    const handleLogin = (u: User) => {
        setUser(u);
        localStorage.setItem('kb_user', JSON.stringify(u));
        setCurrentView('menu');
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('kb_user');
        setCurrentView('login');
    };

    const prefetchData = async () => {
        setLoading(true);
        try {
            const d = await apiClient.fetchAll();
            setData(d);
        } catch (e) { console.error(e); }
        setLoading(false);
    }

    const navigate = (view: string) => {
        // Preload data for dashboard
        if (view === 'dashboard') {
            prefetchData();
        }
        setCurrentView(view);
    };

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <>
            <Header user={user} onLogout={handleLogout} />

            {currentView === 'menu' && (
                <Menu
                    onNavigate={navigate}
                    role={user.role}
                />
            )}

            {currentView === 'knowledge' && (
                <Knowledge user={user} onBack={() => navigate('menu')} />
            )}

            {currentView === 'dashboard' && (
                <Dashboard data={data} onBack={() => navigate('menu')} />
            )}

            {currentView === 'admin' && (
                <Admin user={user} onBack={() => navigate('menu')} />
            )}

            {loading && (
                <div className="loading-overlay" style={{
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
