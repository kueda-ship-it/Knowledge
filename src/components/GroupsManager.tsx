import React, { useMemo, useState } from 'react';
import { User } from '../types';
import { apiClient } from '../api/client';
import { LayoutGrid, UserPlus, UserMinus } from 'lucide-react';

interface Props {
    user: User;
    users: User[];                        // すべてのユーザー (profiles)
    categories: string[];                 // master_categories.name の配列
    onRefreshUsers?: () => Promise<void>; // 保存後に users を再取得させる
}

// グループ = 区分マスタ (master_categories) と 1対1 で同期。
// メンバー = profiles.id が profile_categories に (user_id, category) 行を持つユーザー。
// 1 ユーザーが複数グループに所属可。区分そのものの追加・削除は区分マスタ側で行う。
export const GroupsManager: React.FC<Props> = ({ user: _user, users, categories, onRefreshUsers }) => {
    const [busyUserId, setBusyUserId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string | null>(categories[0] ?? null);

    React.useEffect(() => {
        if (categories.length === 0) { setActiveCategory(null); return; }
        if (!activeCategory || !categories.includes(activeCategory)) {
            setActiveCategory(categories[0]);
        }
    }, [categories, activeCategory]);

    const membersByCategory = useMemo(() => {
        const map = new Map<string, User[]>();
        for (const c of categories) map.set(c, []);
        for (const u of users) {
            for (const c of u.categories) {
                if (map.has(c)) map.get(c)!.push(u);
            }
        }
        return map;
    }, [users, categories]);

    const unassigned = useMemo(
        () => users.filter(u => u.categories.length === 0),
        [users],
    );

    const addTo = async (uid: string, cat: string) => {
        setBusyUserId(uid);
        try {
            await apiClient.addUserToCategory(uid, cat);
            await onRefreshUsers?.();
        } catch (e: any) {
            alert(`グループ追加に失敗: ${e?.message || e}`);
        } finally {
            setBusyUserId(null);
        }
    };

    const removeFrom = async (uid: string, cat: string) => {
        setBusyUserId(uid);
        try {
            await apiClient.removeUserFromCategory(uid, cat);
            await onRefreshUsers?.();
        } catch (e: any) {
            alert(`グループ削除に失敗: ${e?.message || e}`);
        } finally {
            setBusyUserId(null);
        }
    };

    if (categories.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--muted)', fontSize: '0.9rem' }}>
                区分マスタが空です。先に「区分マスタ」からグループを登録してください。
            </div>
        );
    }

    const members = activeCategory ? membersByCategory.get(activeCategory) ?? [] : [];
    // 追加候補 = このグループに未所属のユーザー全員 (他グループに所属していても OK)
    const assignableUsers = activeCategory
        ? users.filter(u => !u.categories.includes(activeCategory))
        : [];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20, minHeight: 360 }}>
            {/* 左: カテゴリ (グループ) リスト */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px 8px' }}>
                    グループ ({categories.length})
                </div>
                {categories.map(c => {
                    const count = membersByCategory.get(c)?.length ?? 0;
                    const isActive = c === activeCategory;
                    return (
                        <button
                            key={c}
                            onClick={() => setActiveCategory(c)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '9px 12px',
                                border: '1px solid transparent',
                                borderRadius: 10,
                                background: isActive ? 'rgba(99,102,241,0.16)' : 'transparent',
                                color: isActive ? '#c7d2fe' : 'var(--text)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '0.88rem',
                                fontWeight: isActive ? 700 : 500,
                                transition: 'all 0.15s',
                            }}
                        >
                            <LayoutGrid size={14} style={{ opacity: isActive ? 1 : 0.6 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: 8 }}>{count}</span>
                        </button>
                    );
                })}
                {unassigned.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--muted)', padding: '0 8px' }}>
                        未所属: {unassigned.length} 人
                    </div>
                )}
            </aside>

            {/* 右: 選択中グループのメンバー + 追加UI */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                        {activeCategory} のメンバー
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                        このグループに属するメンバーのみが「このグループに絞って公開」の提議を閲覧できます。1 ユーザーは複数グループに所属可能です。
                    </div>
                </div>

                {members.length === 0 ? (
                    <div style={{ padding: '12px 14px', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--muted)' }}>
                        まだメンバーがいません。下のリストから追加してください。
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                        {members.map(m => (
                            <div key={m.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', borderRadius: 10,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                {m.avatarUrl ? (
                                    <img
                                        src={m.avatarUrl}
                                        alt={m.name}
                                        style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                    />
                                ) : (
                                    <div className="user-avatar-fallback" style={{ width: 26, height: 26, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                                        {m.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.86rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{m.email}</div>
                                </div>
                                {m.categories.length > 1 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6, marginRight: 4, flexShrink: 0 }}>
                                        他 {m.categories.length - 1} グループ
                                    </div>
                                )}
                                <button
                                    onClick={() => activeCategory && removeFrom(m.id, activeCategory)}
                                    disabled={busyUserId === m.id}
                                    title={`${activeCategory} から外す`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px',
                                        border: '1px solid rgba(239,68,68,0.35)',
                                        background: 'rgba(239,68,68,0.08)',
                                        color: '#fca5a5', borderRadius: 8,
                                        fontSize: '0.75rem',
                                        cursor: busyUserId === m.id ? 'wait' : 'pointer',
                                    }}
                                >
                                    <UserMinus size={12} /> 外す
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* 追加候補 */}
                <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>追加できるユーザー</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                        {assignableUsers.map(u => (
                            <div key={u.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '6px 10px', borderRadius: 8,
                                fontSize: '0.83rem',
                            }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {u.avatarUrl ? (
                                        <img
                                            src={u.avatarUrl}
                                            alt={u.name}
                                            style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                        />
                                    ) : (
                                        <div className="user-avatar-fallback" style={{ width: 26, height: 26, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                                    {u.categories.length > 0 && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: 6, flexShrink: 0 }}>
                                            所属: {u.categories.join(', ')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => activeCategory && addTo(u.id, activeCategory)}
                                    disabled={busyUserId === u.id || !activeCategory}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px',
                                        border: '1px solid rgba(99,102,241,0.4)',
                                        background: 'rgba(99,102,241,0.1)',
                                        color: '#c7d2fe', borderRadius: 8,
                                        fontSize: '0.75rem',
                                        cursor: busyUserId === u.id ? 'wait' : 'pointer',
                                    }}
                                >
                                    <UserPlus size={12} /> 追加
                                </button>
                            </div>
                        ))}
                        {assignableUsers.length === 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '8px 0' }}>全員がこのグループに所属済みです。</div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};
