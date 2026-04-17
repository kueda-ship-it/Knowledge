import React, { useEffect, useState } from 'react';
import { KnowledgeGroup, User } from '../types';
import { apiClient } from '../api/client';
import { Plus, Trash2, Users as UsersIcon, Save, X } from 'lucide-react';

interface Props {
    user: User;
    users: User[];
}

export const GroupsManager: React.FC<Props> = ({ user, users }) => {
    const [groups, setGroups] = useState<KnowledgeGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<{ name: string; description: string; memberIds: string[] }>({
        name: '', description: '', memberIds: []
    });

    const load = async () => {
        setLoading(true);
        try { setGroups(await apiClient.fetchGroups()); }
        catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const startNew = () => {
        setEditingId('new');
        setDraft({ name: '', description: '', memberIds: [] });
    };

    const startEdit = (g: KnowledgeGroup) => {
        setEditingId(g.id);
        setDraft({ name: g.name, description: g.description || '', memberIds: [...g.memberIds] });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft({ name: '', description: '', memberIds: [] });
    };

    const toggleMember = (uid: string) => {
        setDraft(d => ({
            ...d,
            memberIds: d.memberIds.includes(uid) ? d.memberIds.filter(x => x !== uid) : [...d.memberIds, uid]
        }));
    };

    const save = async () => {
        if (!draft.name.trim()) { alert('グループ名を入力してください'); return; }
        try {
            const saved = await apiClient.upsertGroup({
                id: editingId === 'new' ? undefined : editingId!,
                name: draft.name.trim(),
                description: draft.description.trim() || undefined,
            }, user.id);
            await apiClient.setGroupMembers(saved.id, draft.memberIds, user.id);
            await load();
            cancelEdit();
        } catch (e: any) {
            console.error(e);
            alert(`保存に失敗: ${e.message || e}`);
        }
    };

    const remove = async (g: KnowledgeGroup) => {
        if (!confirm(`グループ「${g.name}」を削除しますか？`)) return;
        try { await apiClient.deleteGroup(g.id); await load(); }
        catch (e: any) { alert(`削除に失敗: ${e.message || e}`); }
    };

    return (
        <section className="glass-card master-card">
            <div className="card-header">
                <div className="card-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                    <UsersIcon size={20} />
                </div>
                <h3>通知グループ</h3>
                <button onClick={startNew} className="secondary-btn" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}>
                    <Plus size={14} /> 新規
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
                {loading && <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>読み込み中...</div>}
                {!loading && groups.length === 0 && editingId !== 'new' && (
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '8px 0' }}>
                        グループ未作成。「新規」から追加してください。
                    </div>
                )}

                {groups.map(g => (
                    <div key={g.id} style={{ border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
                        {editingId === g.id ? (
                            <EditForm draft={draft} setDraft={setDraft} users={users} toggleMember={toggleMember} onSave={save} onCancel={cancelEdit} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text)' }}>{g.name}</div>
                                    {g.description && <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>{g.description}</div>}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                                        メンバー: {g.memberIds.length} 人
                                        {g.memberIds.length > 0 && ` (${g.memberIds.slice(0, 3).map(uid => users.find(u => u.id === uid)?.name || '?').join(', ')}${g.memberIds.length > 3 ? '...' : ''})`}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => startEdit(g)} className="secondary-btn" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>編集</button>
                                    <button onClick={() => remove(g)} className="danger-btn" style={{ padding: '4px 8px' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {editingId === 'new' && (
                    <div style={{ border: '1px dashed var(--glass-border)', borderRadius: 8, padding: '10px 12px', background: 'rgba(99, 102, 241, 0.05)' }}>
                        <EditForm draft={draft} setDraft={setDraft} users={users} toggleMember={toggleMember} onSave={save} onCancel={cancelEdit} />
                    </div>
                )}
            </div>
        </section>
    );
};

const EditForm: React.FC<{
    draft: { name: string; description: string; memberIds: string[] };
    setDraft: React.Dispatch<React.SetStateAction<{ name: string; description: string; memberIds: string[] }>>;
    users: User[];
    toggleMember: (uid: string) => void;
    onSave: () => void;
    onCancel: () => void;
}> = ({ draft, setDraft, users, toggleMember, onSave, onCancel }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
            type="text"
            placeholder="グループ名（例: 配車担当者）"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.9rem' }}
        />
        <input
            type="text"
            placeholder="説明（任意）"
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '0.85rem' }}
        />
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>メンバー選択 ({draft.memberIds.length} 人)</div>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {users.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={draft.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                    <span>{u.name}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 'auto' }}>{u.role}</span>
                </label>
            ))}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onCancel} className="secondary-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <X size={14} /> キャンセル
            </button>
            <button onClick={onSave} className="save-btn" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Save size={14} /> 保存
            </button>
        </div>
    </div>
);
