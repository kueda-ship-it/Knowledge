import React from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { User } from '../types';
import { motion } from 'framer-motion';

interface SettingsProps {
    user: User;
    onBack: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onBack }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="view active"
        >
            <div className="dashboard-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                    <button onClick={onBack} className="secondary-btn" style={{ marginRight: '16px' }}>
                        <ArrowLeft size={18} style={{ marginRight: '8px' }} /> 戻る
                    </button>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>設定</h2>
                </div>

                <div className="dash-panel">
                    <h3 style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '16px', marginBottom: '24px', color: 'var(--text-main)' }}>個人設定</h3>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px', color: 'var(--text-main)' }}>外観テーマ</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                {theme === 'light' ? 'ライトモード' : 'ダークモード'}を使用中
                            </div>
                        </div>

                        <button
                            onClick={toggleTheme}
                            style={{
                                background: theme === 'light' ? '#e2e8f0' : '#334155',
                                border: 'none',
                                padding: '4px',
                                borderRadius: '30px',
                                width: '64px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                paddingLeft: theme === 'light' ? '4px' : '36px',
                                transition: 'all 0.3s ease',
                                position: 'relative'
                            }}
                        >
                            <motion.div
                                layout
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                            >
                                {theme === 'light' ? <Sun size={14} color="#f59e0b" /> : <Moon size={14} color="#3b82f6" />}
                            </motion.div>
                        </button>
                    </div>

                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--card-border)' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-main)' }}>アカウント情報</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', alignItems: 'center' }}>
                            <div style={{ color: 'var(--text-muted)' }}>ユーザー名</div>
                            <div style={{ fontWeight: '500', color: 'var(--text-main)' }}>{user.id}</div>

                            <div style={{ color: 'var(--text-muted)' }}>権限</div>
                            <div>
                                <span style={{
                                    background: 'var(--tag-bg)', color: 'var(--tag-text)',
                                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase'
                                }}>
                                    {user.role}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
