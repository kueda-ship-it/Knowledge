import React, { useState, useMemo } from 'react';
import { Star, AlertTriangle, MessageCircle, User, Calendar, Trophy, ThumbsUp } from 'lucide-react';
import { KnowledgeItem, User as AppUser } from '../types';
import { BackButton } from '../components/common/BackButton';

interface EvaluationProps {
    data: KnowledgeItem[];
    onBack: () => void;
    user: AppUser;
}

export const Evaluation: React.FC<EvaluationProps> = ({ data, onBack, user }) => {
    const [activeTab, setActiveTab] = useState<'ranking' | 'alerts'>('ranking');

    // ランキング（いいね数順、最低1件以上）
    const ranking = useMemo(() => {
        return [...data]
            .filter(item => (item.likeCount || 0) > 0)
            .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
            .slice(0, 10);
    }, [data]);

    // 指摘アラート（違うよ！がついているもの）
    const alerts = useMemo(() => {
        return [...data]
            .filter(item => (item.wrongCount || 0) > 0)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [data]);

    return (
        <div className="view" style={{ overflowY: 'auto', paddingBottom: '40px' }}>
            <div style={{
                padding: '24px 40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--header-bg)',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                borderBottom: '1px solid var(--glass-border)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <BackButton onClick={onBack} />
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>評価の確認</h1>
                </div>

                <div style={{
                    display: 'flex',
                    background: 'rgba(0,0,0,0.05)',
                    padding: '4px',
                    borderRadius: '8px',
                    gap: '4px'
                }}>
                    <button 
                        onClick={() => setActiveTab('ranking')}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'ranking' ? 'white' : 'transparent',
                            color: activeTab === 'ranking' ? 'var(--primary)' : 'var(--text)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'ranking' ? 600 : 400,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: activeTab === 'ranking' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <Trophy size={16} /> ランキング
                    </button>
                    <button 
                        onClick={() => setActiveTab('alerts')}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            background: activeTab === 'alerts' ? 'white' : 'transparent',
                            color: activeTab === 'alerts' ? '#ef4444' : 'var(--text)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'alerts' ? 600 : 400,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: activeTab === 'alerts' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <AlertTriangle size={16} /> 指摘アラート
                    </button>
                </div>
            </div>

            <div className="dashboard-container">
                {activeTab === 'ranking' ? (
                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '1.8rem', color: '#f59e0b' }}>
                                <Star size={32} style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                                みんなが認めた優良ナレッジ
                            </h2>
                            <p style={{ color: 'var(--muted)' }}>リアクション評価の高い投稿です。新人教育やトラブル対応の参考にしてください。</p>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {ranking.length > 0 ? ranking.map((item, index) => (
                                <div key={item.id} className="knowledge-card" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '20px',
                                    padding: '24px',
                                    background: 'var(--card-bg)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        color: index < 3 ? '#f59e0b' : 'var(--muted)',
                                        width: '40px',
                                        textAlign: 'center'
                                    }}>
                                        {index + 1}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                                            {item.category} / {item.machine}
                                        </div>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>{item.title}</h3>
                                        <div style={{ display: 'flex', gap: '16px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <User size={14} /> {item.author}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Calendar size={14} /> {new Date(item.updatedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        color: 'var(--primary)',
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <ThumbsUp size={18} /> {item.likeCount} Likes
                                    </div>
                                    {index < 3 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            right: '-10px',
                                            background: '#f59e0b',
                                            color: 'white',
                                            padding: '20px 20px 5px 20px',
                                            transform: 'rotate(45deg)',
                                            fontSize: '0.7rem',
                                            fontWeight: 800
                                        }}>
                                            TOP {index + 1}
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--muted)' }}>
                                    まだ高評価のナレッジはありません。
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '1.8rem', color: '#ef4444' }}>
                                <AlertTriangle size={32} style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                                要修正・指摘ありナレッジ
                            </h2>
                            <p style={{ color: 'var(--muted)' }}>「違うよ」のリアクションがついた投稿です。内容の再確認とブラッシュアップをお願いします。</p>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {alerts.length > 0 ? alerts.map((item) => (
                                <div key={item.id} className="knowledge-card" style={{
                                    padding: '24px',
                                    background: 'var(--card-bg)',
                                    borderLeft: '4px solid #ef4444'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{item.title}</h3>
                                        <div style={{ color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <MessageCircle size={18} /> {item.wrongCount} 指摘
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                        <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>最新の指摘コメント:</div>
                                        <div style={{ color: 'var(--text)', fontStyle: 'italic' }}>
                                            「内容が一部古くなっています。最新の仕様書を確認してください。」
                                            {/* Note: In real app, we'd map and show multiple comments here */}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '16px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                                            <span>作成者: {item.author}</span>
                                            <span>最終更新: {new Date(item.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                        <button className="primary-btn" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                                            修正する
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--muted)' }}>
                                    現在、指摘のついたナレッジはありません。
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
