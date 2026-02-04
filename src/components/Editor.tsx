import React, { useState, useEffect } from 'react';
import { KnowledgeItem, MasterData } from '../types';
import { Trash2, X, RotateCcw, Check, Paperclip, Link, FileText, Plus } from 'lucide-react';
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
        status: 'unsolved', attachments: []
    });
    const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [newLink, setNewLink] = useState({ name: '', url: '' });
    const [showLinkInput, setShowLinkInput] = useState(false);

    useEffect(() => {
        if (item) {
            setFormData({ ...item, attachments: item.attachments || [] });
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
            author: item?.author || user.name,
            attachments: formData.attachments || []
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

    const addAttachment = () => {
        if (!newLink.name || !newLink.url) return alert("名前とURLを入力してください");
        const updated = [...(formData.attachments || []), newLink];
        setFormData(prev => ({ ...prev, attachments: updated }));
        setNewLink({ name: '', url: '' });
        setShowLinkInput(false);
    };

    const removeAttachment = (index: number) => {
        const updated = (formData.attachments || []).filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, attachments: updated }));
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

    const inputStyle = {
        width: '100%',
        padding: '8px',
        border: '1px solid var(--input-border)',
        borderRadius: '4px',
        background: 'var(--input-bg)',
        color: 'var(--text-main)'
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                    <i className="fa-solid fa-pen"></i> ナレッジ編集
                </h3>
                <button onClick={onCancel} className="secondary-btn" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)', cursor: 'pointer', padding: '8px 16px', borderRadius: '6px' }}>
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
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>タイトル (任意)</label>
                        <input
                            id="title"
                            type="text"
                            value={formData.title || ''}
                            onChange={handleChange}
                            placeholder="空欄の場合、インシデント名がタイトルになります"
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)' }}>号機 <span style={{ color: 'red' }}>*</span></label>
                        <input id="machine" type="text" value={formData.machine || ''} onChange={handleChange} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)' }}>物件名 <span style={{ color: 'red' }}>*</span></label>
                        <input id="property" type="text" value={formData.property || ''} onChange={handleChange} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)' }}>依頼番号(11桁) <span style={{ color: 'red' }}>*</span></label>
                        <input id="req_num" type="text" value={formData.req_num || ''} onChange={(e) => setFormData(p => ({ ...p, req_num: e.target.value }))} maxLength={11} style={inputStyle} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: 'var(--text-muted)' }}>インシデント区分 <span style={{ color: 'red' }}>*</span></label>
                        <select id="category" value={formData.category || ''} onChange={handleChange} style={inputStyle}>
                            <option value="">選択してください</option>
                            {masters.categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 2 }}>
                        <label style={{ color: 'var(--text-muted)' }}>インシデント詳細 (選択追加) <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <select onChange={handleIncidentAdd} style={inputStyle}>
                                <option value="">選択してください</option>
                                {masters.incidents.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {selectedIncidents.map(inc => (
                                    <div key={inc} style={{ background: 'var(--bg-overlap)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}>
                                        {inc} <X size={12} cursor="pointer" onClick={() => removeIncident(inc)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label style={{ color: 'var(--text-muted)' }}>タグ (#区切り)</label>
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#js #error" style={inputStyle} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <label style={{ color: 'var(--text-muted)' }}>内容 <span style={{ color: 'red' }}>*</span></label>
                    <textarea id="content" value={formData.content || ''} onChange={handleChange} style={{ ...inputStyle, height: '200px', resize: 'vertical' }}></textarea>
                </div>

                {/* Attachments Section */}
                <div style={{ background: 'var(--bg-overlap)', padding: '15px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            <Paperclip size={18} /> OneDrive 添付ファイル
                        </span>
                        {!showLinkInput && (
                            <button type="button" onClick={() => setShowLinkInput(true)} className="secondary-btn" style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}>
                                <Plus size={14} /> リンク追加
                            </button>
                        )}
                    </div>

                    {showLinkInput && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--card-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--card-border)', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    placeholder="ファイル名 (例: 資料.pdf)"
                                    value={newLink.name}
                                    onChange={(e) => setNewLink(p => ({ ...p, name: e.target.value }))}
                                    style={{ flex: 1, padding: '6px', border: '1px solid var(--input-border)', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                                <input
                                    placeholder="OneDrive 共有リンク"
                                    value={newLink.url}
                                    onChange={(e) => setNewLink(p => ({ ...p, url: e.target.value }))}
                                    style={{ flex: 2, padding: '6px', border: '1px solid var(--input-border)', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button type="button" onClick={() => setShowLinkInput(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>キャンセル</button>
                                <button type="button" onClick={addAttachment} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>追加</button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(formData.attachments || []).map((file, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                                <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.85rem' }}>
                                    <FileText size={16} />
                                    <span>{file.name}</span>
                                    <Link size={12} style={{ opacity: 0.5 }} />
                                </a>
                                <X size={16} cursor="pointer" style={{ color: 'var(--text-muted)' }} onClick={() => removeAttachment(idx)} />
                            </div>
                        ))}
                        {(!formData.attachments || formData.attachments.length === 0) && !showLinkInput && (
                            <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed var(--card-border)', borderRadius: '6px' }}>
                                添付ファイルはありません
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    {canEdit && (
                        <button type="submit" disabled={loading} className="primary-btn" style={{ flex: 1, padding: '12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
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
