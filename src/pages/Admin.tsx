import React, { useState, useEffect } from 'react';
import { MasterData, User } from '../types';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
// Trash2 is used in incident/category lists; Plus is used in add buttons
import { apiClient } from '../api/client';

interface AdminProps {
    user: User;
    onBack: () => void;
}

export const Admin: React.FC<AdminProps> = ({ user, onBack }) => {
    const isFullAdmin = ['master', 'manager'].includes(user.role);
    const [masterData, setMasterData] = useState<MasterData>({ incidents: [], categories: [], users: [] });

    // Inputs
    const [newCat, setNewCat] = useState('');
    const [newInc, setNewInc] = useState('');

    useEffect(() => {
        loadMasters();
    }, []);

    const loadMasters = async () => {
        try {
            const data = await apiClient.fetchMasters();
            setMasterData(data);
        } catch (e) {
            alert("マスタ読み込み失敗");
        } finally {
            // Loading state removed
        }
    };

    const handleSave = async () => {
        if (!confirm("保存しますか？")) return;
        try {
            await apiClient.updateMasters(masterData);
            alert("保存しました");
        } catch (e) {
            alert("保存失敗");
        } finally {
            // Loading state removed
        }
    };

    const addSimple = (type: 'incidents' | 'categories', val: string, setFunc: (s: string) => void) => {
        if (!val.trim()) return;
        setMasterData(prev => ({ ...prev, [type]: [...prev[type], val.trim()] }));
        setFunc('');
    };

    const updateSimple = (type: 'incidents' | 'categories', index: number, newVal: string) => {
        const list = [...masterData[type]];
        list[index] = newVal;
        setMasterData(prev => ({ ...prev, [type]: list }));
    };

    const removeSimple = (type: 'incidents' | 'categories', index: number) => {
        if (!confirm("削除しますか？")) return;
        setMasterData(prev => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
        }));
    };

    const updateUser = (index: number, field: keyof User, val: string) => {
        const newUsers = [...masterData.users];
        (newUsers[index] as any)[field] = val;
        setMasterData(prev => ({ ...prev, users: newUsers }));
    };


    return (
        <div className="view active">
            <div className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
                <div className="dash-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                    <button onClick={onBack} className="secondary-btn" style={{ background: 'white', border: '1px solid #ccc', padding: '5px 15px', borderRadius: '5px', marginRight: '15px' }}>
                        <ArrowLeft size={16} /> 戻る
                    </button>
                    <h2>マスタ管理</h2>
                    <button onClick={handleSave} className="primary-btn" style={{ marginLeft: 'auto', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Save size={16} /> 一括保存
                    </button>
                </div>

                <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: isFullAdmin ? '1fr 1fr' : '1fr', gap: '24px' }}>
                    {/* Categories */}
                    {isFullAdmin && (
                        <div className="dash-panel" style={{ background: 'var(--card-bg)', color: 'var(--text)', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            <h3>区分マスタ</h3>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="区分名" style={{ flex: 1, padding: '5px' }} />
                                <button onClick={() => addSimple('categories', newCat, setNewCat)}><Plus size={16} /></button>
                            </div>
                            <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                                {masterData.categories.map((item, i) => (
                                    <li key={i} className="admin-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: '4px', borderBottom: '1px solid #f1f5f9' }}>
                                        <input
                                            value={item}
                                            onChange={(e) => updateSimple('categories', i, e.target.value)}
                                            style={{ border: 'none', background: 'transparent', flex: 1, padding: '4px', fontSize: '0.95rem', color: '#334155' }}
                                        />
                                        <Trash2 size={16} className="trash-icon" style={{ cursor: 'pointer' }} onClick={() => removeSimple('categories', i)} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Incidents */}
                    <div className="dash-panel" style={{ background: 'var(--card-bg)', color: 'var(--text)', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        <h3>インシデントマスタ</h3>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                            <input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="インシデント名" style={{ flex: 1, padding: '5px' }} />
                            <button onClick={() => addSimple('incidents', newInc, setNewInc)}><Plus size={16} /></button>
                        </div>
                        <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                            {masterData.incidents.map((item, i) => (
                                <li key={i} className="admin-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: '4px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={item}
                                        onChange={(e) => updateSimple('incidents', i, e.target.value)}
                                        style={{ border: 'none', background: 'transparent', flex: 1, padding: '4px', fontSize: '0.95rem', color: '#334155' }}
                                    />
                                    <Trash2 size={16} className="trash-icon" style={{ cursor: 'pointer' }} onClick={() => removeSimple('incidents', i)} />
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Users - ロール管理のみ（SSO経由でサインインしたユーザーが対象） */}
                    {isFullAdmin && (
                        <div className="dash-panel" style={{ background: 'var(--card-bg)', color: 'var(--text)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', gridColumn: '1 / -1', marginTop: '10px' }}>
                            <h3 style={{ marginBottom: '4px' }}>ユーザーロール管理</h3>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
                                Microsoftアカウントでサインイン済みのユーザーのナレッジロールを設定できます
                            </p>
                            <ul className="admin-list" style={{ listStyle: 'none', padding: '0 20px 0 0', maxHeight: '400px', overflowY: 'auto' }}>
                                {masterData.users.map((u, i) => (
                                    <li key={u.id} className="admin-item" style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 120px',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        borderBottom: '1px solid #f1f5f9',
                                        marginBottom: '4px'
                                    }}>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{u.name}</span>
                                        <select
                                            value={u.role}
                                            onChange={(e) => updateUser(i, 'role', e.target.value)}
                                            style={{
                                                fontSize: '0.85rem',
                                                padding: '6px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--input-border)',
                                                background: 'var(--input-bg)',
                                                color: 'var(--text)'
                                            }}
                                        >
                                            <option value="viewer">VIEWER</option>
                                            <option value="user">USER</option>
                                            <option value="manager">MANAGER</option>
                                            <option value="master">MASTER</option>
                                        </select>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                .admin-item {
                    transition: all 0.2s ease;
                }
                .admin-item:hover {
                    background-color: #f8fafc !important;
                }
                .trash-icon {
                    color: #94a3b8;
                    transition: color 0.2s;
                    opacity: 0.3;
                }
                .admin-item:hover .trash-icon {
                    color: #ef4444;
                    opacity: 1;
                }
                .admin-item input:focus {
                    outline: none;
                    background-color: white !important;
                    border-bottom: 1px solid #3b82f6 !important;
                }
            `}</style>
        </div>
    );
};
