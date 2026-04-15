import React from 'react';
import { BookOpen, PieChart, Settings, MessageSquare, Paperclip, Star } from 'lucide-react';

interface MenuProps {
    onNavigate: (view: string) => void;
    role: string;
}

export const Menu: React.FC<MenuProps> = ({ onNavigate, role }) => {
    const isAdmin = role !== 'viewer';

    const GlassCard: React.FC<{ onClick: () => void; color: string; icon: React.ReactNode; label: string; isAdminCard?: boolean }> = 
        ({ onClick, color, icon, label, isAdminCard }) => (
        <button 
            onClick={onClick} 
            className={`menu-card glass-elevated glass-refract-wrap${isAdminCard ? ' admin-card' : ''}`} 
            style={{ 
                color: color, 
                '--icon-color': color,
                overflow: 'hidden' 
            } as React.CSSProperties}
        >
            <div className="glass-refraction" />
            <div className="glass-specular" />
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', height: '100%', width: '100%' }}>
                {icon}
                <span>{label}</span>
            </div>
        </button>
    );

    return (
        <div className="view active center-screen">
            <div className="menu-container" style={{
                width: '100%',
                maxWidth: '800px',
                textAlign: 'center',
                padding: '40px'
            }}>
                <h2 style={{ marginBottom: '40px', color: 'var(--text)', fontWeight: 700, fontSize: '2rem', letterSpacing: '0.05em' }}>メインメニュー</h2>
                <div className="menu-grid">
                    <GlassCard onClick={() => onNavigate('knowledge')} color="#60a5fa" icon={<BookOpen size={48} />} label="ナレッジ入力・検索" />
                    <GlassCard onClick={() => onNavigate('dashboard')} color="#34d399" icon={<PieChart size={48} />} label="集計ダッシュボード" />
                    <GlassCard onClick={() => onNavigate('filelist')} color="#fbbf24" icon={<Paperclip size={48} />} label="添付ファイル一覧" />
                    <GlassCard onClick={() => onNavigate('evaluation')} color="#a78bfa" icon={<Star size={48} />} label="評価の確認" />
                    <GlassCard onClick={() => onNavigate('proposals')} color="#f97316" icon={<MessageSquare size={48} />} label="運用提議" />
                    {isAdmin && (
                        <GlassCard onClick={() => onNavigate('admin')} color="#f87171" icon={<Settings size={48} />} label="マスタ管理" isAdminCard />
                    )}
                </div>
            </div>
        </div>
    );
};
