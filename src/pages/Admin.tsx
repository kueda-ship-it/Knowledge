import React, { useState, useEffect } from 'react';
import { MasterData, User } from '../types';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import { apiClient } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';

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
    const [newUser, setNewUser] = useState({ id: '', name: '', role: 'viewer' as User['role'] });

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

    const addUser = () => {
        if (!newUser.id || !newUser.name) return;
        if (masterData.users.some(u => u.id === newUser.id)) return alert("ID重複");
        setMasterData(prev => ({ ...prev, users: [...prev.users, newUser] }));
        setNewUser({ id: '', name: '', role: 'viewer' });
    };

    const updateUser = (index: number, field: keyof User, val: string) => {
        const newUsers = [...masterData.users];
        (newUsers[index] as any)[field] = val;
        setMasterData(prev => ({ ...prev, users: newUsers }));
    };

    const removeUser = (index: number) => {
        if (masterData.users[index].id === 'admin') return alert("不可");
        if (!confirm("削除しますか？")) return;
        setMasterData(prev => ({
            ...prev,
            users: prev.users.filter((_, i) => i !== index)
        }));
    };


    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="view active"
        >
            <div className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
                <div className="dash-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onBack}
                        className="secondary-btn"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', padding: '8px 16px', borderRadius: '8px', marginRight: '16px', fontWeight: 'bold', color: 'var(--text-main)' }}
                    >
                        <ArrowLeft size={18} /> 戻る
                    </motion.button>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)' }}>マスタ管理</h2>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSave}
                        className="primary-btn"
                        style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.4)' }}
                    >
                        <Save size={18} /> 一括保存
                    </motion.button>
                </div>

                <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: isFullAdmin ? '1fr 1fr' : '1fr', gap: '24px' }}>
                    {/* Categories */}
                    {isFullAdmin && (
                        <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px var(--card-shadow)', border: '1px solid var(--card-border)' }}>
                            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-main)' }}>区分マスタ</h3>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新しい区分名" style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => addSimple('categories', newCat, setNewCat)} style={{ padding: '10px', background: 'var(--bg-overlap)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)' }}><Plus size={20} /></motion.button>
                            </div>
                            <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                                <AnimatePresence>
                                    {masterData.categories.map((item, i) => (
                                        <motion.li
                                            key={`${i}-${item}`}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="admin-item"
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', borderBottom: '1px solid var(--card-border)', marginBottom: '4px' }}
                                        >
                                            <input
                                                value={item}
                                                onChange={(e) => updateSimple('categories', i, e.target.value)}
                                                style={{ border: 'none', background: 'transparent', flex: 1, padding: '4px', fontSize: '0.95rem', color: 'var(--text-main)' }}
                                            />
                                            <Trash2 size={16} className="trash-icon" style={{ cursor: 'pointer' }} onClick={() => removeSimple('categories', i)} />
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </div>
                    )}

                    {/* Incidents */}
                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px var(--card-shadow)', border: '1px solid var(--card-border)' }}>
                        <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-main)' }}>インシデントマスタ</h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="新しいインシデント名" style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                            <motion.button whileTap={{ scale: 0.9 }} onClick={() => addSimple('incidents', newInc, setNewInc)} style={{ padding: '10px', background: 'var(--bg-overlap)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)' }}><Plus size={20} /></motion.button>
                        </div>
                        <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                            <AnimatePresence>
                                {masterData.incidents.map((item, i) => (
                                    <motion.li
                                        key={`${i}-${item}`}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="admin-item"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', borderBottom: '1px solid var(--card-border)', marginBottom: '4px' }}
                                    >
                                        <input
                                            value={item}
                                            onChange={(e) => updateSimple('incidents', i, e.target.value)}
                                            style={{ border: 'none', background: 'transparent', flex: 1, padding: '4px', fontSize: '0.95rem', color: 'var(--text-main)' }}
                                        />
                                        <Trash2 size={16} className="trash-icon" style={{ cursor: 'pointer' }} onClick={() => removeSimple('incidents', i)} />
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </ul>
                    </div>

                    {/* Users - Always in a new row if full admin */}
                    {isFullAdmin && (
                        <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px var(--card-shadow)', gridColumn: '1 / -1', marginTop: '10px', border: '1px solid var(--card-border)' }}>
                            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-main)' }}>ユーザーマスタ</h3>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', background: 'var(--bg-overlap)', padding: '12px', borderRadius: '10px' }}>
                                <input value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} placeholder="ID" style={{ width: '80px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                                <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="名前" style={{ width: '120px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}>
                                    <option value="viewer">VIEWER</option>
                                    <option value="user">USER</option>
                                    <option value="manager">MANAGER</option>
                                    <option value="master">MASTER</option>
                                </select>
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={addUser} style={{ padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}><Plus size={16} /> 追加</motion.button>
                            </div>
                            <ul className="admin-list" style={{ listStyle: 'none', padding: '0 10px 0 0', height: '400px', overflowY: 'auto' }}>
                                <AnimatePresence>
                                    {masterData.users.map((u, i) => (
                                        <motion.li
                                            key={`${i}-${u.id}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="admin-item"
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '100px 1fr 120px 40px',
                                                alignItems: 'center',
                                                gap: '16px',
                                                padding: '12px 16px',
                                                borderRadius: '10px',
                                                border: '1px solid var(--card-border)',
                                                background: 'var(--card-bg)',
                                                marginBottom: '8px',
                                                boxShadow: '0 2px 4px var(--card-shadow)'
                                            }}
                                        >
                                            <b style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.id}</b>
                                            <input
                                                value={u.name || ''}
                                                onChange={(e) => updateUser(i, 'name', e.target.value)}
                                                style={{
                                                    border: '1px solid var(--input-border)',
                                                    background: 'var(--input-bg)',
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.9rem',
                                                    color: 'var(--text-main)',
                                                    width: '100%',
                                                    fontWeight: '600'
                                                }}
                                                placeholder="名前を入力"
                                            />
                                            <select
                                                value={u.role}
                                                onChange={(e) => updateUser(i, 'role', e.target.value)}
                                                style={{
                                                    fontSize: '0.8rem',
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--input-border)',
                                                    background: 'var(--input-bg)',
                                                    color: 'var(--text-main)',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                <option value="viewer">VIEWER</option>
                                                <option value="user">USER</option>
                                                <option value="manager">MANAGER</option>
                                                <option value="master">MASTER</option>
                                            </select>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <Trash2 size={18} className="trash-icon" style={{ cursor: 'pointer' }} onClick={() => removeUser(i)} />
                                            </div>
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                .admin-item {
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .admin-item:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1) !important;
                }
                .trash-icon {
                    color: var(--text-muted);
                    transition: all 0.2s;
                    opacity: 0.5;
                }
                .trash-icon:hover {
                    color: #ef4444;
                    opacity: 1;
                    transform: scale(1.1);
                }
                .admin-item input:focus {
                    outline: none;
                    background-color: var(--card-bg) !important;
                    border-color: var(--primary) !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
            `}</style>
        </motion.div>
    );
};
