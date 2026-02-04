import { useState, useEffect } from 'react';
import { User, KnowledgeItem } from './types';
import { Header } from './components/Header';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Knowledge } from './pages/Knowledge';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { Settings } from './pages/Settings';
import { apiClient } from './api/client';
import { ThemeProvider } from './contexts/ThemeContext';

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
        return (
            <ThemeProvider>
                <Login onLogin={handleLogin} />
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider>
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

            {currentView === 'settings' && (
                <Settings user={user} onBack={() => navigate('menu')} />
            )}

            {loading && (
                <div className="loading-overlay">
                    <div style={{ padding: '20px', background: 'var(--card-bg)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: 'var(--text-main)' }}>Loading...</div>
                </div>
            )}
        </ThemeProvider>
    );
}

export default App;
