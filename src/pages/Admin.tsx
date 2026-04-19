import React, { useState, useEffect } from 'react';
import { MasterData, User } from '../types';
import { Save, Trash2, Plus, Users, LayoutGrid, ShieldCheck, Mail, Info, ChevronRight, UsersRound } from 'lucide-react';
import { apiClient } from '../api/client';
import { BackButton } from '../components/common/BackButton';
import { GroupsManager } from '../components/GroupsManager';
import { GlassModal } from '../components/common/GlassModal';
import { GlassSelect } from '../components/common/GlassSelect';
import { ROLE_OPTIONS, ROLE_META } from '../constants/roles';
import { loadCache, saveCache } from '../utils/cache';

interface AdminProps {
    user: User;
    onBack: () => void;
}

const MASTERS_CACHE_KEY = 'knowledge_masters_v2';

export const Admin: React.FC<AdminProps> = ({ user, onBack }) => {
    const isFullAdmin = ['master', 'manager'].includes(user.role);
    const [masterData, setMasterData] = useState<MasterData>(() =>
        loadCache<MasterData>(MASTERS_CACHE_KEY, { incidents: [], categories: [], users: [] })
    );
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Inputs
    const [newCat, setNewCat] = useState('');
    const [newInc, setNewInc] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<User['role']>('user');
    const [openModal, setOpenModal] = useState<'categories' | 'incidents' | 'groups' | null>(null);
    const [userFilter, setUserFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | User['role']>('all');

    useEffect(() => {
        loadMasters();

        // Realtime Subscription
        const channel = apiClient.subscribeMasters(() => {
            console.log('[Realtime] Master data change detected. Reloading...');
            loadMasters(true);
        });

        return () => {
            apiClient.unsubscribeMasters(channel);
        };
    }, []);

    const loadMasters = async (silent = false) => {
        try {
            const data = await apiClient.fetchMasters();
            // Guard: 直前まで非空だったのに全カテゴリが空で返ってきた場合は、
            // JWT 期限切れや一時的な RLS 拒否とみなしキャッシュを上書きしない。
            setMasterData(prev => {
                const prevHadData =
                    (prev.users?.length ?? 0) > 0 ||
                    (prev.categories?.length ?? 0) > 0 ||
                    (prev.incidents?.length ?? 0) > 0;
                const allEmpty =
                    (data.users?.length ?? 0) === 0 &&
                    (data.categories?.length ?? 0) === 0 &&
                    (data.incidents?.length ?? 0) === 0;
                if (prevHadData && allEmpty) {
                    console.warn('[loadMasters] 縮退レスポンスを検知したため既存データを保持します');
                    return prev;
                }
                saveCache(MASTERS_CACHE_KEY, data);
                return data;
            });
            setIsDirty(false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await apiClient.updateMasters(masterData);
            await loadMasters(); // Reload to sync with DB (IDs etc)
            setIsDirty(false);
            alert("設定を保存しました。");
        } catch (e) {
            console.error("Save error:", e);
            alert("保存に失敗しました。詳細についてはコンソールをご確認ください。");
        } finally {
            setIsSaving(false);
        }
    };

    const addSimple = (type: 'incidents' | 'categories', val: string, setFunc: (s: string) => void) => {
        if (!val.trim()) return;
        setMasterData(prev => ({ ...prev, [type]: [...prev[type], val.trim()] }));
        setFunc('');
        setIsDirty(true);
    };

    const updateSimple = (type: 'incidents' | 'categories', index: number, newVal: string) => {
        const list = [...masterData[type]];
        list[index] = newVal;
        setMasterData(prev => ({ ...prev, [type]: list }));
        setIsDirty(true);
    };

    const removeSimple = (type: 'incidents' | 'categories', index: number) => {
        setMasterData(prev => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
        }));
        setIsDirty(true);
    };

    const updateUser = (index: number, field: keyof User, val: string) => {
        const newUsers = [...masterData.users];
        (newUsers[index] as any)[field] = val;
        setMasterData(prev => ({ ...prev, users: newUsers }));
        setIsDirty(true);
    };

    const bulkPromoteViewers = () => {
        const viewerCount = masterData.users.filter(u => u.role === 'viewer').length;
        if (viewerCount === 0) {
            alert('閲覧者は現在いません。');
            return;
        }
        if (!confirm(`閲覧者 ${viewerCount} 人を全員「編集者 (USER)」に変更します。よろしいですか？\n※「変更を保存」を押すまでDBには反映されません。`)) return;
        setMasterData(prev => ({
            ...prev,
            users: prev.users.map(u => u.role === 'viewer' ? { ...u, role: 'user' } : u),
        }));
        setIsDirty(true);
    };

    const handleAddUser = () => {
        if (!newUserName.trim() || !newUserEmail.trim()) {
            alert("名前とメールアドレスを入力してください。");
            return;
        }
        const newUser: User = {
            id: `new-${Date.now()}`,
            name: newUserName.trim(),
            email: newUserEmail.trim(),
            role: newUserRole,
            categories: [],
        };
        setMasterData(prev => ({ ...prev, users: [newUser, ...prev.users] }));
        setNewUserName('');
        setNewUserEmail('');
        setNewUserRole('user');
        setIsDirty(true);
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    return (
        <div className="admin-page-root">
            <div className="admin-max-container">
                {/* Fixed Header */}
                <header className="admin-header">
                    <div className="header-left">
                        <BackButton onClick={onBack} />
                        <div className="header-titles">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <img src="/logo.png" alt="" className="admin-logo" />
                                <h1>マスタ管理</h1>
                            </div>
                            <p>アプリケーションの基本設定と権限制御</p>
                        </div>
                    </div>
                    
                    <div className="header-actions">
                        {isDirty && <span className="dirty-indicator">未保存の変更があります</span>}
                        <button 
                            onClick={handleSave} 
                            className={`save-btn ${isDirty ? 'pulse' : ''}`}
                            disabled={!isDirty}
                        >
                            <Save size={18} />
                            <span>変更を保存</span>
                        </button>
                    </div>
                </header>

                <main className="admin-content-grid">
                    {/* Master Sections Container */}
                    <div className="master-data-columns">
                        {/* Categories Master - Summary card */}
                        {isFullAdmin && (
                            <button onClick={() => setOpenModal('categories')} className="glass-card master-summary-card">
                                <div className="summary-card-icon cat-icon"><LayoutGrid size={22} /></div>
                                <div className="summary-card-text">
                                    <h3>区分マスタ</h3>
                                    <p>{masterData.categories.length} 件 · クリックで編集</p>
                                </div>
                                <ChevronRight size={20} className="summary-card-chevron" />
                            </button>
                        )}

                        {/* Incidents Master - Summary card */}
                        <button onClick={() => setOpenModal('incidents')} className="glass-card master-summary-card">
                            <div className="summary-card-icon inc-icon"><Info size={22} /></div>
                            <div className="summary-card-text">
                                <h3>インシデントマスタ</h3>
                                <p>{masterData.incidents.length} 件 · クリックで編集</p>
                            </div>
                            <ChevronRight size={20} className="summary-card-chevron" />
                        </button>

                        {/* Groups (区分マスタ同期) */}
                        {isFullAdmin && (
                            <button onClick={() => setOpenModal('groups')} className="glass-card master-summary-card">
                                <div className="summary-card-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}><UsersRound size={22} /></div>
                                <div className="summary-card-text">
                                    <h3>グループ設定</h3>
                                    <p>
                                        {masterData.users.filter(u => (u.categories?.length ?? 0) > 0).length} / {masterData.users.length} 人 割当済 · クリックで編集
                                    </p>
                                </div>
                                <ChevronRight size={20} className="summary-card-chevron" />
                            </button>
                        )}
                    </div>

                    {/* User Management Section */}
                    {isFullAdmin && (
                        <section className="glass-card user-management-card">
                            <div className="card-header">
                                <div className="card-icon user-icon"><Users size={20} /></div>
                                <div className="header-text">
                                    <h3>ユーザーロール管理</h3>
                                    <p>SSOサインイン済みユーザーのアクセス権限を制御します</p>
                                </div>
                                <button
                                    onClick={bulkPromoteViewers}
                                    className="secondary-btn"
                                    style={{
                                        marginLeft: 'auto',
                                        padding: '6px 14px',
                                        fontSize: '0.8rem',
                                        borderRadius: 10,
                                        border: '1px solid rgba(59, 130, 246, 0.35)',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        color: '#93c5fd',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                    title="現在 viewer のユーザーをすべて user (編集者) に変更"
                                >
                                    閲覧者 → 編集者 一括変更
                                </button>
                            </div>

                            <div className="add-user-form">
                                <div className="input-group">
                                    <input
                                        type="text"
                                        placeholder="名前"
                                        value={newUserName}
                                        onChange={(e) => setNewUserName(e.target.value)}
                                    />
                                    <input
                                        type="email"
                                        placeholder="メールアドレス"
                                        value={newUserEmail}
                                        onChange={(e) => setNewUserEmail(e.target.value)}
                                    />
                                    <div className="role-select-wrapper" style={{ flex: 1 }}>
                                        <ShieldCheck size={14} className={`role-icon role-${newUserRole}`} />
                                        <GlassSelect
                                            value={newUserRole}
                                            options={ROLE_OPTIONS}
                                            onChange={(v) => setNewUserRole(v as User['role'])}
                                        />
                                    </div>
                                    <button onClick={handleAddUser} className="add-user-btn">
                                        <Plus size={16} />
                                        <span>追加</span>
                                    </button>
                                </div>
                            </div>

                            <div className="user-filter-bar">
                                <input
                                    type="text"
                                    placeholder="名前・メールで絞り込み..."
                                    value={userFilter}
                                    onChange={(e) => setUserFilter(e.target.value)}
                                    className="user-filter-input"
                                />
                                <div className="role-select-wrapper" style={{ minWidth: 180 }}>
                                    <ShieldCheck size={14} className={`role-icon ${roleFilter === 'all' ? '' : `role-${roleFilter}`}`} />
                                    <GlassSelect
                                        value={roleFilter}
                                        options={[{ value: 'all', label: 'すべての権限', color: '#94a3b8' }, ...ROLE_OPTIONS]}
                                        onChange={(v) => setRoleFilter(v as 'all' | User['role'])}
                                        compact
                                    />
                                </div>
                                <span className="user-filter-count">
                                    {(() => {
                                        const q = userFilter.trim().toLowerCase();
                                        const matched = masterData.users.filter(u => {
                                            if (roleFilter !== 'all' && u.role !== roleFilter) return false;
                                            if (!q) return true;
                                            return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                                        }).length;
                                        return `${matched} / ${masterData.users.length}`;
                                    })()}
                                </span>
                            </div>

                            <div className="user-table-container scroll-area">
                                <table className="user-table">
                                    <thead>
                                        <tr>
                                            <th>ユーザー</th>
                                            <th>メールアドレス</th>
                                            <th>権限レベル</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const q = userFilter.trim().toLowerCase();
                                            return masterData.users
                                                .map((u, origIdx) => ({ u, origIdx }))
                                                .filter(({ u }) => {
                                                    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
                                                    if (!q) return true;
                                                    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                                                });
                                        })().map(({ u, origIdx: i }) => (
                                            <tr key={u.id}>
                                                <td>
                                                    <div className="user-info-cell">
                                                        {u.avatarUrl ? (
                                                            <img src={u.avatarUrl} alt="" className="avatar-img" />
                                                        ) : (
                                                            <div className="avatar-initials">{getInitial(u.name)}</div>
                                                        )}
                                                        <span className="user-name">{u.name}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="email-cell">
                                                        <Mail size={12} className="muted-icon" />
                                                        <span>{u.email || '未設定'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="role-select-wrapper">
                                                        <ShieldCheck size={14} className={`role-icon role-${u.role}`} />
                                                        <GlassSelect
                                                            value={u.role}
                                                            options={ROLE_OPTIONS}
                                                            onChange={(v) => updateUser(i, 'role', v)}
                                                            compact
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </main>
            </div>

            {isSaving && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            )}

            {/* Categories Edit Modal */}
            <GlassModal
                open={openModal === 'categories'}
                title="区分マスタ"
                icon={<div className="card-icon cat-icon" style={{ width: 32, height: 32 }}><LayoutGrid size={18} /></div>}
                onClose={() => setOpenModal(null)}
            >
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input
                        value={newCat}
                        onChange={(e) => setNewCat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addSimple('categories', newCat, setNewCat); }}
                        placeholder="新しい区分を追加..."
                        style={{
                            flex: 1, padding: '10px 14px', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.9rem',
                        }}
                    />
                    <button onClick={() => addSimple('categories', newCat, setNewCat)} className="add-btn">
                        <Plus size={18} />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {masterData.categories.map((item, i) => (
                        <div key={`cat-m-${i}`} className="master-item">
                            <input
                                value={item}
                                onChange={(e) => updateSimple('categories', i, e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button className="delete-item-btn" onClick={() => removeSimple('categories', i)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {masterData.categories.length === 0 && (
                        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: 16, textAlign: 'center' }}>
                            未登録です。上部の入力欄から追加してください。
                        </div>
                    )}
                </div>
            </GlassModal>

            {/* Groups Modal (区分マスタ同期) */}
            <GlassModal
                open={openModal === 'groups'}
                title="グループ設定"
                icon={<div className="card-icon" style={{ width: 32, height: 32, background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}><UsersRound size={18} /></div>}
                onClose={() => setOpenModal(null)}
                maxWidth={960}
            >
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                    グループは「区分マスタ」と同期しています。メンバーの所属変更のみをここで行います。
                    <br />
                    区分そのものの追加・削除は「区分マスタ」から行ってください。
                </div>
                <GroupsManager
                    user={user}
                    users={masterData.users}
                    categories={masterData.categories}
                    onRefreshUsers={async () => { await loadMasters(true); }}
                />
            </GlassModal>

            {/* Incidents Edit Modal */}
            <GlassModal
                open={openModal === 'incidents'}
                title="インシデントマスタ"
                icon={<div className="card-icon inc-icon" style={{ width: 32, height: 32 }}><Info size={18} /></div>}
                onClose={() => setOpenModal(null)}
            >
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input
                        value={newInc}
                        onChange={(e) => setNewInc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addSimple('incidents', newInc, setNewInc); }}
                        placeholder="新しい内容を追加..."
                        style={{
                            flex: 1, padding: '10px 14px', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.9rem',
                        }}
                    />
                    <button onClick={() => addSimple('incidents', newInc, setNewInc)} className="add-btn">
                        <Plus size={18} />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {masterData.incidents.map((item, i) => (
                        <div key={`inc-m-${i}`} className="master-item">
                            <input
                                value={item}
                                onChange={(e) => updateSimple('incidents', i, e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button className="delete-item-btn" onClick={() => removeSimple('incidents', i)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {masterData.incidents.length === 0 && (
                        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: 16, textAlign: 'center' }}>
                            未登録です。上部の入力欄から追加してください。
                        </div>
                    )}
                </div>
            </GlassModal>

            <style>{`
                .user-management-card {
                    height: 100%;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .add-user-form {
                    padding: 16px 20px;
                    background: rgba(255,255,255,0.03);
                    border-bottom: 1px solid var(--border);
                }
                .user-filter-bar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 20px;
                    border-bottom: 1px solid var(--border);
                }
                .user-filter-input {
                    flex: 1;
                    min-width: 0;
                    padding: 8px 12px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    background: var(--input-bg);
                    color: var(--text);
                    font-size: 0.88rem;
                }
                .user-filter-input:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent);
                }
                .user-filter-count {
                    font-size: 0.78rem;
                    color: var(--muted);
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums;
                }
                .add-user-form .input-group {
                    display: flex;
                    gap: 12px;
                }
                .add-user-form input, .add-user-form select {
                    flex: 1;
                    min-width: 0;
                    padding: 8px 12px;
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    background: var(--input-bg);
                    color: var(--text);
                    font-size: 0.9rem;
                }
                .add-user-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                .add-user-btn:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                .admin-page-root {
                    background: var(--bg);
                    color: var(--text);
                    height: calc(100vh - var(--header-height));
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    width: 100%;
                    min-width: 0;
                }

                .admin-page-root, .admin-page-root * {
                    box-sizing: border-box;
                }

                .admin-max-container {
                    max-width: 1700px;
                    width: 100%;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    padding: 0 40px;
                    flex: 1;
                    overflow: hidden;
                    min-width: 0;
                }

                /* Header */
                .admin-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 0;
                    flex-shrink: 0;
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }

                .header-titles h1 {
                    font-size: 1.8rem;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                }

                .admin-logo {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    object-fit: cover;
                }

                .header-titles p {
                    font-size: 0.9rem;
                    color: var(--muted);
                    margin: 4px 0 0 0;
                }

                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .dirty-indicator {
                    font-size: 0.75rem;
                    color: var(--primary);
                    background: color-mix(in oklab, var(--primary) 12%, transparent);
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-weight: 600;
                }

                /* Glass Card */
                .glass-card {
                    background: var(--card-bg);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: 20px;
                    box-shadow: var(--card-shadow);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .card-header {
                    padding: 20px 24px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid var(--border);
                }

                .card-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 700;
                }

                .card-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .cat-icon { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
                .inc-icon { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
                .user-icon { background: rgba(16, 185, 129, 0.15); color: #10b981; }

                /* Grid Layout */
                .admin-content-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
                    gap: 24px;
                    flex: 1;
                    overflow: hidden;
                    padding-bottom: 24px;
                    align-items: stretch;
                    min-width: 0;
                }

                .master-data-columns {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    height: 100%;
                    overflow: hidden;
                }

                .master-card {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }

                /* Summary (collapsed) master cards that open a modal */
                .master-summary-card {
                    display: flex !important;
                    flex-direction: row !important;
                    align-items: center;
                    gap: 16px;
                    padding: 20px 22px;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    color: var(--text);
                    font-family: inherit;
                    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
                }
                .master-summary-card:hover {
                    border-color: color-mix(in oklab, var(--primary) 50%, transparent);
                    background: color-mix(in oklab, var(--primary) 8%, transparent);
                    box-shadow: 0 8px 24px -8px color-mix(in oklab, var(--primary) 28%, transparent);
                }
                .summary-card-icon {
                    width: 44px; height: 44px;
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .summary-card-text { flex: 1; min-width: 0; }
                .summary-card-text h3 { margin: 0 0 2px 0; font-size: 1.05rem; font-weight: 700; }
                .summary-card-text p { margin: 0; font-size: 0.82rem; color: var(--muted); }
                .summary-card-chevron { color: var(--muted); opacity: 0.6; flex-shrink: 0; transition: transform 0.2s, opacity 0.2s; }
                .master-summary-card:hover .summary-card-chevron { transform: translateX(3px); opacity: 1; }

                /* Master Card Items */
                .quick-add {
                    padding: 0 24px 16px 24px;
                    display: flex;
                    gap: 8px;
                }

                .quick-add input {
                    background: var(--input-bg);
                    border: 1px solid var(--input-border);
                    padding: 10px 14px;
                    border-radius: 12px;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                }

                .quick-add input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent);
                    outline: none;
                }

                .add-btn {
                    background: var(--primary);
                    color: white;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: transform 0.1s, filter 0.2s;
                }

                .add-btn:hover { filter: brightness(1.1); }
                .add-btn:active { transform: scale(0.9); }

                .item-list {
                    flex: 1;
                    min-height: 0;
                    padding: 0 12px 24px 24px;
                }

                .scroll-area {
                    overflow-y: auto;
                }

                .scroll-area::-webkit-scrollbar { width: 4px; }
                .scroll-area::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

                .master-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    border-radius: 12px;
                    transition: all 0.2s;
                    position: relative;
                }

                .master-item:hover { background: rgba(0,0,0,0.03); }
                body.dark .master-item:hover { background: rgba(255,255,255,0.03); }

                .master-item:focus-within {
                    background: var(--input-bg);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }

                .master-item input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    padding: 4px;
                    font-size: 0.95rem;
                    color: var(--text);
                    cursor: text;
                }

                .master-item input:focus {
                    outline: none;
                }

                .delete-item-btn {
                    background: transparent;
                    border: none;
                    color: var(--muted);
                    padding: 6px;
                    opacity: 0;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .master-item:hover .delete-item-btn { opacity: 0.5; }
                .delete-item-btn:hover { color: var(--danger) !important; opacity: 1 !important; transform: scale(1.1); }

                /* User Table */
                .user-management-card .header-text h3 { margin-bottom: 2px; }
                .user-management-card .header-text p { margin: 0; font-size: 0.8rem; color: var(--muted); }

                .user-table-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0 24px 24px 24px;
                    min-height: 0;
                }

                .user-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .user-table th {
                    text-align: left;
                    padding: 12px 12px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid var(--border);
                }

                .user-table td {
                    padding: 16px 12px;
                    border-bottom: 1px solid var(--border);
                }

                .user-info-cell {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .user-name { font-weight: 600; font-size: 0.9rem; }

                .avatar-img, .avatar-initials {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                }

                .avatar-initials {
                    background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 75%, white), var(--primary));
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8rem;
                    font-weight: 700;
                    border: 2px solid var(--glass-border);
                }

                .email-cell { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.85rem; }
                .muted-icon { opacity: 0.6; }

                .role-select-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: var(--input-bg);
                    border: 1px solid var(--input-border);
                    border-radius: 10px;
                    padding: 4px 8px;
                    transition: border-color 0.2s;
                }

                .role-select-wrapper:focus-within { border-color: var(--primary); }

                .role-icon { opacity: 0.8; flex-shrink: 0; }
                /* Keep in sync with src/constants/roles.ts (ROLE_META.*.color) */
                .role-viewer { color: #94a3b8; }
                .role-user { color: #3b82f6; }
                .role-manager { color: #8b5cf6; }
                .role-master { color: #f59e0b; }

                /* Buttons */
                .glass-icon-btn {
                    background: var(--card-bg);
                    border: 1px solid var(--glass-border);
                    color: var(--text);
                    width: 44px;
                    height: 44px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .glass-icon-btn:hover { 
                    background: rgba(255, 255, 255, 0.2); 
                    border-color: var(--primary);
                    color: var(--primary);
                    transform: scale(1.05) translateX(-2px); 
                }
                .glass-icon-btn:active { transform: scale(0.95); }

                .save-btn {
                    background: var(--primary);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 14px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .save-btn:disabled {
                    background: #94a3b8;
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .save-btn:not(:disabled):hover {
                    box-shadow: 0 10px 20px -10px color-mix(in oklab, var(--primary) 55%, transparent);
                    transform: translateY(-2px);
                    filter: brightness(1.1);
                }

                .save-btn:active { transform: scale(0.95); }

                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 45%, transparent); }
                    70% { box-shadow: 0 0 0 12px color-mix(in oklab, var(--primary) 0%, transparent); }
                    100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 0%, transparent); }
                }

                .pulse {
                    animation: pulse 2s infinite;
                }

                /* Spinner locally defined as well just in case */
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-left-color: var(--primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @media (max-width: 1400px) {
                    .admin-content-grid { grid-template-columns: 1fr; }
                    .admin-max-container { padding: 0 24px; }
                }
                @media (max-width: 1024px) {
                    .admin-max-container { padding: 0 16px; }
                    .admin-header { flex-wrap: wrap; gap: 12px; }
                    .header-actions { margin-left: auto; }
                }
            `}</style>
        </div>
    );
};
