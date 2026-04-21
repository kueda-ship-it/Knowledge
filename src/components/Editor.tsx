import React, { useState, useEffect, useRef } from 'react';
import { KnowledgeItem, MasterData, Attachment } from '../types';
import { Trash2, X, RotateCcw, Check, Paperclip, ExternalLink, FileText, Image, ShieldCheck, ShieldAlert, ThumbsUp, AlertTriangle, Clock, History, MessageSquare } from 'lucide-react';
import { apiClient } from '../api/client';
import { useOneDriveUpload } from '../hooks/useOneDriveUpload';
import { EditHistory } from '../types';
import { GlassSelect } from './common/GlassSelect';

interface EditorProps {
    item: KnowledgeItem | null;
    masters: MasterData;
    onSave: (data: any, shouldClose?: boolean) => void;
    onDelete: (id: string) => void;
    onCancel: () => void;
    user: { name: string, role: string, email?: string };
}

export const Editor: React.FC<EditorProps> = ({ item, masters, onSave, onDelete, onCancel, user }) => {
    const [formData, setFormData] = useState<Partial<KnowledgeItem>>({
        title: '', machine: '', property: '', req_num: '',
        category: '', incidents: [], tags: [], content: '',
        phenomenon: '', countermeasure: '',
        status: 'unsolved'
    });
    const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingProperty, setFetchingProperty] = useState(false);
    const [history, setHistory] = useState<EditHistory[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showWrongDialog, setShowWrongDialog] = useState(false);
    const [wrongComment, setWrongComment] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadFile, uploading, statusMessage, isAuthenticated, authenticate } = useOneDriveUpload(user.email as string | undefined);

    useEffect(() => {
        if (item) {
            setFormData({
                ...item,
                phenomenon: item.phenomenon ?? '',
                countermeasure: item.countermeasure ?? '',
            });
            setSelectedIncidents(item.incidents || []);
            setTagInput((item.tags || []).join(' #'));
            setAttachments(item.attachments || []);
            // 履歴取得
            apiClient.fetchHistory(item.id).then(setHistory).catch(console.error);
        } else {
            setFormData({
                title: '', machine: '', property: '', req_num: '',
                category: '', incidents: [], tags: [], content: '',
                phenomenon: '', countermeasure: '',
                status: 'unsolved'
            });
            setSelectedIncidents([]);
            setTagInput('');
            setAttachments([]);
            setHistory([]);
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

        const isConstruction = formData.category?.toLowerCase() === 'construction';
        
        // Basic validation
        const hasMachine = !!formData.machine;
        const hasProperty = !!formData.property;
        const hasPhenomenon = !!formData.phenomenon;
        const hasCountermeasure = !!formData.countermeasure;
        const hasIncidents = selectedIncidents.length > 0;
        const hasCategory = !!formData.category;
        const hasValidReqNum = isConstruction ? true : /^\d{11}$/.test(formData.req_num || '');

        if (!hasMachine || !hasProperty || (!isConstruction && !formData.req_num) || !hasPhenomenon || !hasCountermeasure || !hasIncidents || !hasCategory) {
            return alert("必須項目(*)をすべて入力してください");
        }
        
        if (!hasValidReqNum) {
            return alert("依頼番号は半角数字11桁で入力してください");
        }

        const tags = tagInput.split('#').map(t => t.trim()).filter(t => t);
        let title = formData.title?.trim();
        if (!title) title = `[${formData.category}] ${selectedIncidents.join(', ')}`;

        const phenomenon = formData.phenomenon || '';
        const countermeasure = formData.countermeasure || '';
        const content = phenomenon && countermeasure ? `${phenomenon}\n\n【対処】\n${countermeasure}` : (phenomenon || countermeasure || formData.content || '');

        const payload: KnowledgeItem = {
            id: item?.id || Date.now().toString(),
            machine: formData.machine || '',
            property: formData.property || '',
            req_num: formData.req_num || '',
            title: title,
            category: formData.category || '',
            incidents: selectedIncidents,
            tags: tags,
            content: content,
            phenomenon,
            countermeasure,
            status: formData.status || 'unsolved',
            updatedAt: new Date().toISOString(),
            author: user.name, // 最終更新者を常に現在のユーザーにする
            attachments,
        };

        setLoading(true);
        try {
            // 30秒でタイムアウト（ネットワーク不安定時にハング防止）
            await Promise.race([
                apiClient.save(payload, item || undefined),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
            ]);
            onSave(payload);
        } catch (e: any) {
            const msg = e?.message === 'TIMEOUT'
                ? '保存がタイムアウトしました。ネットワークを確認して再試行してください。'
                : `保存失敗: ${e?.message || '不明なエラー'}`;
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleReaction = async (type: 'like' | 'wrong', comment?: string) => {
        if (!item || !user.name) return;
        const userId = (user as any).id;
        if (!userId) return alert("ユーザーIDが見つかりません");

        // --- 楽観的UI更新 (Optimistic Update) ---
        const newItem = { ...item };
        const isRemoving = newItem.myReaction === type;
        
        // 元の状態を保存（エラー時のロールバック用）
        const originalItem = { ...item };

        if (isRemoving) {
            newItem.myReaction = null;
            if (type === 'like') newItem.likeCount = Math.max(0, (newItem.likeCount || 0) - 1);
            else newItem.wrongCount = Math.max(0, (newItem.wrongCount || 0) - 1);
        } else {
            // 別のリアクションがあった場合はそれを減らす
            if (newItem.myReaction === 'like') newItem.likeCount = Math.max(0, (newItem.likeCount || 0) - 1);
            if (newItem.myReaction === 'wrong') newItem.wrongCount = Math.max(0, (newItem.wrongCount || 0) - 1);
            
            newItem.myReaction = type;
            if (type === 'like') newItem.likeCount = (newItem.likeCount || 0) + 1;
            else newItem.wrongCount = (newItem.wrongCount || 0) + 1;
        }

        // 先にUIを更新して体感速度を上げる
        if (onSave) onSave(newItem, false);

        // バックグラウンドでサーバー更新
        try {
            await apiClient.toggleReaction(item.id, userId, type, comment);
        } catch (e) {
            console.error("Reaction failed:", e);
            alert("リアクションの同期に失敗しました。再試行してください。");
            // ロールバック
            if (onSave) onSave(originalItem, false);
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

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        e.target.value = ''; // 同じファイルを再選択できるようリセット

        for (const file of files) {
            const att = await uploadFile(file);
            if (att) {
                setAttachments(prev => [...prev, att]);
            }
        }
    };

    const handleMachineBlur = async () => {
        if (!formData.machine || formData.property) return; // すでに物件名がある場合は自動上書きしない（または空の場合のみ）
        
        setFetchingProperty(true);
        try {
            const name = await apiClient.fetchPropertyNameByMachine(formData.machine);
            if (name) {
                setFormData(prev => ({ ...prev, property: name }));
            }
        } finally {
            setFetchingProperty(false);
        }
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <i className="fa-solid fa-pen"></i> ナレッジ編集
                </h3>
                <button onClick={onCancel} className="secondary-btn" title="閉じる" style={{ width: '36px', height: '36px', padding: 0 }}>
                    <X size={18} />
                </button>
            </div>

            {/* Reaction Section (Only for existing items) */}
            {item && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    padding: '20px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    border: '1px solid var(--glass-border)',
                    marginBottom: '25px',
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                }}>
                    <button 
                        type="button"
                        onClick={() => handleReaction('like')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '12px 28px', borderRadius: '40px', border: '1px solid var(--primary)',
                            background: item.myReaction === 'like' ? 'var(--primary)' : 'transparent',
                            color: item.myReaction === 'like' ? 'white' : 'var(--primary)',
                            cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s ease',
                            boxShadow: item.myReaction === 'like' ? '0 0 15px var(--primary)' : 'none',
                        }}
                        className="reaction-btn"
                    >
                        <ThumbsUp size={22} fill={item.myReaction === 'like' ? 'white' : 'transparent'} /> 
                        いいね！ <span style={{ fontSize: '1.2rem', marginLeft: '4px' }}>{item.likeCount || 0}</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => setShowWrongDialog(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '12px 28px', borderRadius: '40px', border: '1px solid #ef4444',
                            background: item.myReaction === 'wrong' ? '#ef4444' : 'transparent',
                            color: item.myReaction === 'wrong' ? 'white' : '#ef4444',
                            cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s ease',
                            boxShadow: item.myReaction === 'wrong' ? '0 0 15px #ef4444' : 'none',
                        }}
                        className="reaction-btn"
                    >
                        <AlertTriangle size={22} fill={item.myReaction === 'wrong' ? 'white' : 'transparent'} /> 
                        違うよ！ <span style={{ fontSize: '1.2rem', marginLeft: '4px' }}>{item.wrongCount || 0}</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="secondary-btn"
                        style={{ borderRadius: '40px', padding: '12px 24px', gap: '8px' }}
                    >
                        <History size={18} /> {showHistory ? '詳細を隠す' : '履歴を表示'}
                    </button>
                </div>
            )}

            {showWrongDialog && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="login-box" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                            <AlertTriangle size={20} /> どこが違いますか？
                        </h3>
                        <textarea 
                            value={wrongComment}
                            onChange={(e) => setWrongComment(e.target.value)}
                            placeholder="具体的な修正箇所や指摘内容を入力してください..."
                            style={{ width: '100%', height: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={() => { handleReaction('wrong', wrongComment); setShowWrongDialog(false); setWrongComment(''); }}
                                className="primary-btn" style={{ flex: 1, background: '#ef4444' }}
                            >
                                送信する
                            </button>
                            <button onClick={() => setShowWrongDialog(false)} className="secondary-btn" style={{ flex: 1 }}>キャンセル</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change History with Diff */}
            {showHistory && item && (
                <div style={{
                    marginBottom: '25px', padding: '20px', background: 'var(--card-bg)',
                    borderRadius: '12px', border: '1px solid var(--glass-border)',
                }}>
                    <h4 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} /> 変更履歴 (差分)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {history.length > 0 ? history.map(h => (
                            <div key={h.id} style={{ borderLeft: '2px solid var(--primary)', paddingLeft: '15px', position: 'relative' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>
                                    <strong>{h.changedBy}</strong> • {new Date(h.updatedAt).toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.85rem', marginBottom: '8px', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                                    <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                                    {h.comment || '内容を更新しました'}
                                </div>
                                <DiffView oldText={h.oldContent} newText={h.newContent} />
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                                履歴はありません
                            </div>
                        )}
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* 1. Incident Category & Details (Moved to top) */}
                <div style={{ display: 'flex', gap: '14px', padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>インシデント区分 <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--input-border)', borderRadius: '8px', background: 'var(--input-bg)' }}>
                            <GlassSelect
                                value={formData.category || ''}
                                options={[{ value: '', label: '選択してください' }, ...masters.categories.map(c => ({ value: c, label: c }))]}
                                onChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                            />
                        </div>
                    </div>
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>インシデント詳細 (選択追加) <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--input-border)', borderRadius: '8px', background: 'var(--input-bg)' }}>
                                <GlassSelect
                                    value=""
                                    options={[
                                        { value: '', label: '選択してください' },
                                        ...masters.incidents
                                            .filter(i => !selectedIncidents.includes(i))
                                            .map(i => ({ value: i, label: i })),
                                    ]}
                                    onChange={(v) => {
                                        if (v && !selectedIncidents.includes(v)) {
                                            setSelectedIncidents([...selectedIncidents, v]);
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {selectedIncidents.map(inc => (
                                    <div key={inc} style={{ background: 'var(--border)', color: 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {inc} <X size={12} cursor="pointer" onClick={() => removeIncident(inc)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

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
                            style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }}
                        />
                    </div>
                </div>

                {/* 2. Unit info */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>号機 <span style={{ color: 'red' }}>*</span> {fetchingProperty && <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>取得中...</span>}</label>
                        <input id="machine" type="text" value={formData.machine || ''} onChange={handleChange} onBlur={handleMachineBlur} placeholder="例: E1" style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>物件名 <span style={{ color: 'red' }}>*</span></label>
                        <input id="property" type="text" value={formData.property || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>依頼番号(11桁) {formData.category?.toLowerCase() !== 'construction' && <span style={{ color: 'red' }}>*</span>}</label>
                        <input id="req_num" type="text" value={formData.req_num || ''} onChange={(e) => setFormData(p => ({ ...p, req_num: e.target.value }))} maxLength={11} style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                </div>

                <div>
                    <label>タグ (#区切り)</label>
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#js #error" style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label>事象 <span style={{ color: 'red' }}>*</span></label>
                        <textarea id="phenomenon" value={formData.phenomenon || ''} onChange={handleChange} placeholder="発生した事象・現象を記入してください" style={{ width: '100%', height: '150px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical' }}></textarea>
                    </div>
                    <div>
                        <label>対処 <span style={{ color: 'red' }}>*</span></label>
                        <textarea id="countermeasure" value={formData.countermeasure || ''} onChange={handleChange} placeholder="実施した対処・解決策を記入してください" style={{ width: '100%', height: '150px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical' }}></textarea>
                    </div>
                </div>

                {/* Attachments */}
                <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Paperclip size={14} /> 添付ファイル (OneDrive)
                        {/* Auth status badge */}
                        {isAuthenticated ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: '#22c55e', marginLeft: '4px' }}>
                                <ShieldCheck size={13} /> 認証済み
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={authenticate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '3px',
                                    fontSize: '0.75rem', color: '#f59e0b', background: 'none',
                                    border: '1px solid #f59e0b', borderRadius: '4px',
                                    padding: '2px 7px', cursor: 'pointer', marginLeft: '4px',
                                }}
                            >
                                <ShieldAlert size={13} /> Microsoft認証
                            </button>
                        )}
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {attachments.map(att => (
                                <div key={att.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 10px', background: 'var(--bg)',
                                    border: '1px solid var(--border)', borderRadius: '6px',
                                    fontSize: '0.85rem',
                                }}>
                                    {att.type.startsWith('image/') ? <Image size={14} color="var(--primary)" /> : <FileText size={14} color="#64748b" />}
                                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                                        style={{ flex: 1, color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {att.name}
                                    </a>
                                    <ExternalLink size={12} color="#94a3b8" />
                                    {canEdit && (
                                        <X size={14} style={{ cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}
                                            onClick={() => removeAttachment(att.id)} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {canEdit && (
                        <button type="button"
                            onClick={() => {
                                if (!isAuthenticated) {
                                    authenticate().then(ok => { if (ok) fileInputRef.current?.click(); });
                                } else {
                                    fileInputRef.current?.click();
                                }
                            }}
                            disabled={uploading}
                            className="secondary-btn"
                            style={{ fontSize: '0.85rem', gap: '6px', display: 'flex', alignItems: 'center', width: 'fit-content' }}
                        >
                            <Paperclip size={14} />
                            {uploading ? statusMessage || 'アップロード中...' : 'ファイルを追加'}
                        </button>
                    )}
                </div>

                {item && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'right', marginTop: '8px' }}>
                        最終更新: <strong>{item.author}</strong> &nbsp;
                        {new Date(item.updatedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    {canEdit && (
                        <button type="submit" disabled={loading} className="primary-btn" style={{ flex: 1, padding: '12px' }}>
                            {loading ? 'Processing...' : '保存'}
                        </button>
                    )}
                    {canEdit && item && (
                        <button type="button" onClick={handleDelete} disabled={loading} className="danger-btn" style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <Trash2 size={16} /> 削除
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};

const DiffView: React.FC<{ oldText: string, newText: string }> = ({ oldText, newText }) => {
    // Basic line-based diff
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    // In a real app we'd use a more sophisticated longest common subsequence algorithm
    // but for simple knowledge updates, we can show side-by-side or stacked highlights.
    // Let's do a simple stacked comparison for visibility.
    
    return (
        <div style={{
            fontSize: '0.8rem', fontFamily: 'monospace', padding: '10px',
            background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border)'
        }}>
            {oldText !== newText ? (
                <>
                    <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.7, marginBottom: '4px' }}>
                        - {oldLines.slice(0, 3).join(' ')}{oldLines.length > 3 ? '...' : ''}
                    </div>
                    <div style={{ color: '#10b981', fontWeight: 600 }}>
                        + {newLines.slice(0, 3).join(' ')}{newLines.length > 3 ? '...' : ''}
                    </div>
                    {newLines.length > 3 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>
                            (他 {newLines.length - 3} 行の変更あり)
                        </div>
                    )}
                </>
            ) : (
                <div style={{ color: 'var(--muted)' }}>内容の変更はありません（ステータスのみ等）</div>
            )}
        </div>
    );
};
