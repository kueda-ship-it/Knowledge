import React, { useState } from 'react';
import { User, AppNotification } from '../types';
import { LogOut, Box, Moon, Sun, Bell, AlertTriangle, Edit3, ThumbsUp, Droplet } from 'lucide-react';

interface HeaderProps {
    user: User | null;
    onLogout: () => void;
    theme: 'light' | 'dark' | 'liquid';
    onCycleTheme: () => void;
    notifications?: AppNotification[];
    unreadCount?: number;
    onReadNotification?: (id: string) => void;
}

const THEME_LABELS: Record<string, string> = {
    light: 'ライトモード',
    dark: 'ダークモード',
    liquid: 'Liquid Glass'
};

export const Header: React.FC<HeaderProps> = ({ 
    user, 
    onLogout, 
    theme,
    onCycleTheme,
    notifications = [],
    unreadCount = 0,
    onReadNotification
}) => {
    const [showNotifications, setShowNotifications] = useState(false);
    if (!user) return null;

    return (
        <header className="glass-panel" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            color: 'var(--text)',
            borderRadius: 0,
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                <Box size={24} /> Knowledge DB
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {user.avatarUrl ? (
                         <img src={user.avatarUrl} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
                    ) : (
                         <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
                            {user.name.charAt(0).toUpperCase()}
                         </div>
                    )}
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                        {user.name} <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>({user.role})</small>
                    </span>
                </div>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="dark-toggle-btn"
                        style={{ position: 'relative' }}
                        title="通知"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                background: '#ef4444',
                                color: 'white',
                                fontSize: '10px',
                                padding: '2px 5px',
                                borderRadius: '10px',
                                border: '2px solid var(--header-bg)',
                                fontWeight: 'bold'
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifications && (
                        <div className="glass-elevated" style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '10px',
                            width: '320px',
                            borderRadius: '12px',
                            zIndex: 100,
                            overflow: 'hidden',
                            animation: 'chatPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                            transformOrigin: 'top right'
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                                <span>通知</span>
                                {unreadCount > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>未読 {unreadCount}件</span>}
                            </div>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {notifications.length > 0 ? notifications.map(note => (
                                    <div 
                                        key={note.id} 
                                        onClick={() => {
                                            if (!note.is_read && onReadNotification) onReadNotification(note.id);
                                            setShowNotifications(false);
                                        }}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            background: note.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.05)',
                                            transition: 'background 0.2s',
                                            display: 'flex',
                                            gap: '12px'
                                        }}
                                    >
                                        <div style={{ 
                                            color: note.type === 'like' ? '#2563eb' : note.type === 'wrong' ? '#ef4444' : '#10b981',
                                            marginTop: '2px'
                                        }}>
                                            {note.type === 'like' && <ThumbsUp size={16} />}
                                            {note.type === 'wrong' && <AlertTriangle size={16} />}
                                            {note.type === 'edited' && <Edit3 size={16} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', marginBottom: '4px', color: note.is_read ? 'var(--muted)' : 'var(--text)' }}>
                                                <strong>{note.sender_name}</strong> が
                                                {note.type === 'like' ? ' いいね！しました' : 
                                                 note.type === 'wrong' ? ' 違うよ！と指摘しました' : 
                                                 ' ナレッジを編集しました'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                                {new Date(note.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
                                        通知はありません。
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={onCycleTheme}
                    title={THEME_LABELS[theme]}
                    className="dark-toggle-btn"
                >
                    {theme === 'light' && <Sun size={18} />}
                    {theme === 'dark' && <Moon size={18} />}
                    {theme === 'liquid' && <Droplet size={18} />}
                </button>
                <button
                    onClick={onLogout}
                    title="ログアウト"
                    className="header-action-btn logout-btn-red"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
};
