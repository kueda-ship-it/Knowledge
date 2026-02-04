import React from 'react';
import { User } from '../types';
import { LogOut, Box } from 'lucide-react';

interface HeaderProps {
    user: User | null;
    onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
    if (!user) return null;

    return (
        <header style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            height: 'var(--header-height)',
            backgroundColor: 'var(--card-bg)',
            boxShadow: '0 1px 0 var(--glass-border)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backdropFilter: 'blur(8px)',
            background: 'var(--bg-overlap)', /* Semi-transparent for glass effect check index.css */
            borderBottom: '1px solid var(--card-border)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary)', letterSpacing: '-0.02em' }}>
                <Box size={24} /> Knowledge System
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.2' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)' }}>{user.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{user.role}</span>
                </div>
                <button
                    onClick={onLogout}
                    title="ログアウト"
                    className="header-logout-btn"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    );
};
