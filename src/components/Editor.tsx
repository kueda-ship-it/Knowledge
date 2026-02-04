import React, { useState, useEffect } from 'react';
import { KnowledgeItem, MasterData } from '../types';
import { Trash2, X, RotateCcw, Check } from 'lucide-react';
import { apiClient } from '../api/client';

interface EditorProps {
    item: KnowledgeItem | null;
    masters: MasterData;
    onSave: (data: any) => void;
    onDelete: (id: string) => void;
    onCancel: () => void;
    user: { name: string, role: string };
}

export const Editor: React.FC<EditorProps> = ({ item, masters, onSave, onDelete, onCancel, user }) => {
    const [formData, setFormData] = useState<Partial<KnowledgeItem>>({
        title: '', machine: '', property: '', req_num: '',
        category: '', incidents: [], tags: [], content: '',
        status: 'unsolved'
    });
    const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (item) {
            setFormData(item);
            setSelectedIncidents(item.incidents || []);
            setTagInput((item.tags || []).join(' #'));
        } else {
            setFormData({
                title: '', machine: '', property: '', req_num: '',
                category: '', incidents: [], tags: [], content: '',
                status: 'unsolved'
            });
            setSelectedIncidents([]);
            setTagInput('');
        }
    }, [item]);

    const canEdit = !item ||
        user.role === 'master' ||
        user.role === 'manager' ||
        (user.role === 'user' && item.author === user.name);

    useEffect(() => {
        if (item) {
            console.log("Permission check:", {
                user: user.name,
                author: item.author,
                role: user.role,
                canEdit
            });
        }
    }, [item, user, canEdit]);

    if (!canEdit && item) {
        // Just show read-only or similar, but for now we might just let it be readonly inputs
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleIncidentAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val && !selectedIncidents.includes(val)) {
            setSelectedIncidents([...selectedIncidents, val]);
        }
        e.target.value = '';
    };

    const removeIncident = (val: string) => {
        setSelectedIncidents(selectedIncidents.filter(i => i !== val));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Basic validation
        if (!formData.machine || !formData.property || !formData.req_num || !formData.content || selectedIncidents.length === 0 || !formData.category) {
            return alert("必須項目(*)をすべて入力してください");
        }
        if (!/^\d{11}$/.test(formData.req_num || '')) {
            return alert("依頼番号は半角数字11桁で入力してください");
        }

        const tags = tagInput.split('#').map(t => t.trim()).filter(t => t);
        let title = formData.title?.trim();
        if (!title) title = `[${formData.category}] ${selectedIncidents.join(', ')}`;

        const payload: KnowledgeItem = {
            id: item?.id || Date.now().toString(),
            machine: formData.machine || '',
            property: formData.property || '',
            req_num: formData.req_num || '',
            title: title,
            category: formData.category || '',
            incidents: selectedIncidents,
            tags: tags,
            content: formData.content || '',
            status: formData.status || 'unsolved',
            updatedAt: new Date().toISOString(),
            author: item?.author || user.name
        };

        setLoading(true);
        try {
            await apiClient.save(payload);
            onSave(payload);
        } catch (e) {
            alert("保存失敗");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!item?.id) return;
        if (!confirm("本当に削除しますか？")) return;
        setLoading(true);
        try {
            await apiClient.delete(item.id);
            onDelete(item.id);
        } catch (e) {
            alert("削除失敗");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <i className="fa-solid fa-pen"></i> ナレッジ編集
                </h3>
                <button onClick={onCancel} className="secondary-btn">
                    閉じる
                </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div
                            className={`status-toggle-btn solved ${formData.status === 'solved' ? 'active' : ''}`}
                            onClick={() => setFormData(p => ({ ...p, status: 'solved' }))}
                            title="解決済みにする"
                        >
                            <Check size={24} strokeWidth={3} />
                        </div>
                        <div
                            className={`status-toggle-btn unsolved ${formData.status === 'unsolved' ? 'active' : ''}`}
                            onClick={() => setFormData(p => ({ ...p, status: 'unsolved' }))}
                            title="未解決に戻す"
                        >
                            <RotateCcw size={22} strokeWidth={2.5} />
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>タイトル (任意)</label>
                        <input
                            id="title"
                            type="text"
                            value={formData.title || ''}
                            onChange={handleChange}
                            placeholder="空欄の場合、インシデント名がタイトルになります"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>号機 <span style={{ color: 'red' }}>*</span></label>
                        <input id="machine" type="text" value={formData.machine || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>物件名 <span style={{ color: 'red' }}>*</span></label>
                        <input id="property" type="text" value={formData.property || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>依頼番号(11桁) <span style={{ color: 'red' }}>*</span></label>
                        <input id="req_num" type="text" value={formData.req_num || ''} onChange={(e) => setFormData(p => ({ ...p, req_num: e.target.value }))} maxLength={11} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>インシデント区分 <span style={{ color: 'red' }}>*</span></label>
                        <select id="category" value={formData.category || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                            <option value="">選択してください</option>
                            {masters.categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 2 }}>
                        <label>インシデント詳細 (選択追加) <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <select onChange={handleIncidentAdd} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                                <option value="">選択してください</option>
                                {masters.incidents.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {selectedIncidents.map(inc => (
                                    <div key={inc} style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {inc} <X size={12} cursor="pointer" onClick={() => removeIncident(inc)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label>タグ (#区切り)</label>
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#js #error" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <label>内容 <span style={{ color: 'red' }}>*</span></label>
                    <textarea id="content" value={formData.content || ''} onChange={handleChange} style={{ width: '100%', height: '200px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical' }}></textarea>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    {canEdit && (
                        <button type="submit" disabled={loading} className="primary-btn" style={{ flex: 1, padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                            {loading ? 'Processing...' : '保存'}
                        </button>
                    )}
                    {canEdit && item && (
                        <button type="button" onClick={handleDelete} disabled={loading} className="danger-btn" style={{ flex: 1, padding: '12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <Trash2 size={16} /> 削除
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};
