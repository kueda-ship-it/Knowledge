import React from 'react';
import { BookOpen, PieChart, Database, Settings as SettingsIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface MenuProps {
    onNavigate: (view: string) => void;
    role: string;
}

export const Menu: React.FC<MenuProps> = ({ onNavigate, role }) => {
    // Only manager/master can see Master Management
    const canManageMaster = ['manager', 'master'].includes(role);

    return (
        <div className="view active center-screen">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="menu-container"
            >
                <h2 style={{ marginBottom: '32px', color: 'var(--text-main)' }}>メインメニュー</h2>
                <div className="menu-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>

                    <motion.button
                        whileHover={{ y: -5, boxShadow: '0 10px 20px -5px var(--card-shadow)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onNavigate('knowledge')}
                        className="menu-card"
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
                            fontSize: '1.2rem', color: 'var(--primary)',
                            height: '200px'
                        }}
                    >
                        <div style={{ padding: '20px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }}>
                            <BookOpen size={40} />
                        </div>
                        <span style={{ fontWeight: 'bold' }}>ナレッジ</span>
                    </motion.button>

                    <motion.button
                        whileHover={{ y: -5, boxShadow: '0 10px 20px -5px var(--card-shadow)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onNavigate('dashboard')}
                        className="menu-card"
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
                            fontSize: '1.2rem', color: '#10b981',
                            height: '200px'
                        }}
                    >
                        <div style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%' }}>
                            <PieChart size={40} />
                        </div>
                        <span style={{ fontWeight: 'bold' }}>ダッシュボード</span>
                    </motion.button>

                    <motion.button
                        whileHover={{ y: -5, boxShadow: '0 10px 20px -5px var(--card-shadow)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onNavigate('settings')}
                        className="menu-card"
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
                            fontSize: '1.2rem', color: 'var(--text-muted)',
                            height: '200px'
                        }}
                    >
                        <div style={{ padding: '20px', background: 'rgba(148, 163, 184, 0.1)', borderRadius: '50%' }}>
                            <SettingsIcon size={40} />
                        </div>
                        <span style={{ fontWeight: 'bold' }}>設定</span>
                    </motion.button>

                    {canManageMaster && (
                        <motion.button
                            whileHover={{ y: -5, boxShadow: '0 10px 20px -5px var(--card-shadow)' }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onNavigate('admin')}
                            className="menu-card admin-card"
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
                                fontSize: '1.2rem', color: 'var(--danger)',
                                height: '200px'
                            }}
                        >
                            <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
                                <Database size={40} />
                            </div>
                            <span style={{ fontWeight: 'bold' }}>マスタ管理</span>
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
