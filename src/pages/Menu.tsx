import React from 'react';
import { BookOpen, PieChart, Settings, MessageSquare } from 'lucide-react';

interface MenuProps {
    onNavigate: (view: string) => void;
    role: string;
}

export const Menu: React.FC<MenuProps> = ({ onNavigate, role }) => {
    const isAdmin = role !== 'viewer';
    return (
        <div className="view active center-screen">
            <div className="menu-container" style={{
                background: 'var(--card-bg)',
                padding: '40px',
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                width: '100%',
                maxWidth: '800px',
                textAlign: 'center'
            }}>
                <h2 style={{ marginBottom: '30px', color: 'var(--text)' }}>メインメニュー</h2>
                <div className="menu-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <button onClick={() => onNavigate('knowledge')} className="menu-card" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px',
                        padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
                        cursor: 'pointer', transition: 'all 0.2s', fontSize: '1.2rem', color: '#3b82f6', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <BookOpen size={48} /> <span>ナレッジ入力・検索</span>
                    </button>
                    <button onClick={() => onNavigate('dashboard')} className="menu-card" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px',
                        padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
                        cursor: 'pointer', fontSize: '1.2rem', color: '#10b981', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <PieChart size={48} /> <span>集計ダッシュボード</span>
                    </button>
                    <button onClick={() => onNavigate('chat')} className="menu-card" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px',
                        padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
                        cursor: 'pointer', transition: 'all 0.2s', fontSize: '1.2rem', color: '#8b5cf6', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <MessageSquare size={48} /> <span>ナレッジ検索チャット</span>
                    </button>
                    {isAdmin && (
                        <button onClick={() => onNavigate('admin')} className="menu-card admin-card" style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px',
                            padding: '30px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px',
                            cursor: 'pointer', transition: 'all 0.2s', fontSize: '1.2rem', color: '#ef4444', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            <Settings size={48} /> <span>マスタ管理</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
