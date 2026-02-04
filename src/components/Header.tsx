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
            padding: '10px 20px',
            backgroundColor: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                <Box size={24} /> Knowledge DB
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '0.9rem' }}>
                    <i className="fa-solid fa-user"></i> {user.name} <small>({user.role})</small>
                </span>
                <button
                    onClick={onLogout}
                    title="ログアウト"
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        padding: '5px'
                    }}
                >
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
};
