import React, { useState, useEffect } from 'react';
import { MasterData, User } from '../types';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import { apiClient } from '../api/client';

interface AdminProps {
    onBack: () => void;
}

export const Admin: React.FC<AdminProps> = ({ onBack }) => {
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
            setLoading(false);
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

    const removeUser = (index: number) => {
        if (masterData.users[index].id === 'admin') return alert("不可");
        if (!confirm("削除しますか？")) return;
        setMasterData(prev => ({
            ...prev,
            users: prev.users.filter((_, i) => i !== index)
        }));
    };

    const changeUserRole = (index: number, role: any) => {
        const newUsers = [...masterData.users];
        newUsers[index].role = role;
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

                <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                    {/* Categories */}
                    <div className="dash-panel" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        <h3>区分マスタ</h3>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="区分名" style={{ flex: 1, padding: '5px' }} />
                            <button onClick={() => addSimple('categories', newCat, setNewCat)}><Plus size={16} /></button>
                        </div>
                        <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                            {masterData.categories.map((item, i) => (
                                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    {item}
                                    <Trash2 size={16} cursor="pointer" onClick={() => removeSimple('categories', i)} />
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Incidents */}
                    <div className="dash-panel" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        <h3>インシデントマスタ</h3>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                            <input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="インシデント名" style={{ flex: 1, padding: '5px' }} />
                            <button onClick={() => addSimple('incidents', newInc, setNewInc)}><Plus size={16} /></button>
                        </div>
                        <ul className="admin-list" style={{ listStyle: 'none', padding: 0 }}>
                            {masterData.incidents.map((item, i) => (
                                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    {item}
                                    <Trash2 size={16} cursor="pointer" onClick={() => removeSimple('incidents', i)} />
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Users */}
                    <div className="dash-panel" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        <h3>ユーザーマスタ</h3>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <input value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} placeholder="ID" style={{ width: '60px', padding: '5px' }} />
                            <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="名前" style={{ width: '80px', padding: '5px' }} />
                            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })} style={{ padding: '5px' }}>
                                <option value="viewer">VIEW</option>
                                <option value="user">USER</option>
                                <option value="manager">MNGR</option>
                                <option value="master">MSTR</option>
                            </select>
                            <button onClick={addUser}><Plus size={16} /></button>
                        </div>
                        <ul className="admin-list" style={{ listStyle: 'none', padding: 0, height: '300px', overflowY: 'scroll' }}>
                            {masterData.users.map((u, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee' }}>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <b>{u.id}</b>: {u.name}
                                        <select value={u.role} onChange={(e) => changeUserRole(i, e.target.value)} style={{ marginLeft: '5px', fontSize: '0.75rem' }}>
                                            <option value="viewer">VIEW</option>
                                            <option value="user">USER</option>
                                            <option value="manager">MNGR</option>
                                            <option value="master">MSTR</option>
                                        </select>
                                    </div>
                                    <Trash2 size={16} cursor="pointer" onClick={() => removeUser(i)} />
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
