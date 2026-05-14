import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Clock, AlertCircle, User as UserIcon, Calendar, MessageSquare, Tag, ArrowUpDown, Hash, Plus, ArrowLeft, Edit2, Send, X, Check, Gavel, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { supabase } from '../lib/supabase';
import { OperationalProposal, OperationalProposalComment, User, ProposalDraft, NavigateParams } from '../types';
import { BackButton } from '../components/common/BackButton';
import { useRealtimeChannel } from '../hooks/useRealtimeChannel';
import { loadCache, saveCache } from '../utils/cache';

interface ProposalsProps {
    onBack: () => void;
    user?: User;
    initialProposalId?: string | null;
    onInitialProposalConsumed?: () => void;
    // AI チャットからの「運用提議を立てる」アクション。新規作成モーダルを下書き入りで開く。
    initialDraft?: ProposalDraft | null;
    onInitialDraftConsumed?: () => void;
    // AI チャットからの「絞り込みで開く」アクション
    initialNavParams?: NavigateParams | null;
    onInitialNavParamsConsumed?: () => void;
}

type SortMode = 'date' | 'number';

const TODAY = new Date().toISOString().split('T')[0];

// 保存値（苗字だけ / スペース有無 / メール前半など）から profiles を堅牢に引き当てる。
// 登録順: exact → email prefix → normalized exact → startsWith → includes（最長優先）
const resolveProfileByName = (users: User[], raw: string): User | undefined => {
    const needle = raw.trim();
    if (!needle || users.length === 0) return undefined;
    const norm = (s: string) => s.replace(/[\s\u3000]+/g, '').toLowerCase();
    const needleN = norm(needle);

    const exact = users.find(u => (u.name || '').trim() === needle);
    if (exact) return exact;

    const emailPrefix = users.find(u => (u.email || '').split('@')[0]?.toLowerCase() === needle.toLowerCase());
    if (emailPrefix) return emailPrefix;

    const normExact = users.find(u => norm(u.name || '') === needleN);
    if (normExact) return normExact;

    // needle が苗字のみ等で短い場合 → 長いフル名を prefer
    const candidates = users
        .filter(u => {
            const nN = norm(u.name || '');
            return nN && (nN.startsWith(needleN) || needleN.startsWith(nN) || nN.includes(needleN) || needleN.includes(nN));
        })
        .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
    return candidates[0];
};

export const OperationalProposals: React.FC<ProposalsProps> = ({ onBack, user, initialProposalId, onInitialProposalConsumed, initialDraft, onInitialDraftConsumed, initialNavParams, onInitialNavParamsConsumed }) => {
    const PROPOSALS_CACHE_KEY = 'proposals_data_v1';
    const USERS_CACHE_KEY = 'knl_users_master_v1';
    const loadProposalCache = (): OperationalProposal[] => loadCache<OperationalProposal[]>(PROPOSALS_CACHE_KEY, []);
    const loadUsersCache = (): User[] => loadCache<User[]>(USERS_CACHE_KEY, []);

    const [proposals, setProposals] = useState<OperationalProposal[]>(() => loadProposalCache());
    const [loading, setLoading] = useState(false); // 初回からローディングを表示しない（キャッシュ活用）
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [usersMaster, setUsersMaster] = useState<User[]>(() => loadUsersCache());
    const [groupCategories, setGroupCategories] = useState<string[]>([]); // master_categories.name (= グループ)
    const [activeCategory, setActiveCategory] = useState<string>('全て');
    const [activeStatus, setActiveStatus] = useState<string>('全て');
    const [selectedProposal, setSelectedProposal] = useState<OperationalProposal | null>(null);
    const [sortMode, setSortMode] = useState<SortMode>('date');

    // AIチャットから提議IDで直接詳細を開く
    useEffect(() => {
        if (!initialProposalId) return;
        const hit = proposals.find(p => p.id === initialProposalId);
        if (hit) {
            setSelectedProposal(hit);
            onInitialProposalConsumed?.();
        }
    }, [initialProposalId, proposals]);

    // AIチャットの create_proposal アクション → 新規作成モーダルを下書き入りで開く
    useEffect(() => {
        if (!initialDraft) return;
        setForm(prev => ({
            ...prev,
            title: initialDraft.title ?? prev.title,
            problem: initialDraft.problem ?? prev.problem,
            proposal: initialDraft.proposal ?? prev.proposal,
            category: initialDraft.category ?? prev.category,
            priority: initialDraft.priority ?? prev.priority,
            status: initialDraft.status ?? prev.status,
            author: user?.name ?? prev.author,
            proposed_at: TODAY,
        }));
        setShowCreateModal(true);
        onInitialDraftConsumed?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDraft]);

    // AIチャットの navigate アクション → status / category 絞り込み + openCreate を反映
    useEffect(() => {
        if (!initialNavParams) return;
        if (initialNavParams.proposalStatus) {
            setActiveStatus(initialNavParams.proposalStatus);
        }
        if (initialNavParams.proposalCategory) {
            setActiveCategory(initialNavParams.proposalCategory);
        }
        if (initialNavParams.openCreate) {
            // 空フォームで新規作成モーダルを開く (ユーザー自身に記入してもらう)
            setForm(prev => ({
                ...prev,
                title: '', problem: '', proposal: '',
                author: user?.name ?? prev.author,
                proposed_at: TODAY,
            }));
            setShowCreateModal(true);
        }
        onInitialNavParamsConsumed?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialNavParams]);

    // 詳細モーダル用: 合議コメント / インライン編集
    const [comments, setComments] = useState<OperationalProposalComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentBusy, setCommentBusy] = useState(false);
    const [editingProposal, setEditingProposal] = useState(false);
    const [proposalDraft, setProposalDraft] = useState('');
    const [editingDecision, setEditingDecision] = useState(false);
    const [decisionDraft, setDecisionDraft] = useState('');
    const [editingVisibility, setEditingVisibility] = useState(false);
    const [visibilityDraft, setVisibilityDraft] = useState<string[]>([]);
    const [savingField, setSavingField] = useState<'proposal' | 'decision' | 'visibility' | null>(null);

    // 新規作成モーダル
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
        category: 'Engineer（施工）',
        title: '',        // 改善要望概要
        problem: '',      // 問題点
        proposal: '',     // 改善提案
        author: user?.name ?? '',
        proposed_at: TODAY,
        priority: '中' as '高' | '中' | '低',
        status: '未着手' as '未着手' | '対応中' | '完了' | '保留',
        visible_groups: [] as string[], // 空 = 全員公開
    });

    const masterCategories = ['Engineer（障害）', 'Engineer（施工）', '施工管理', '設置管理'];
    const categories = ['全て', ...masterCategories, 'その他'];

    useEffect(() => {
        fetchData();
    }, []);

    // profiles は proposals と独立して取得（失敗しても proposals 表示は継続）
    useEffect(() => {
        let cancelled = false;
        apiClient.fetchMasters()
            .then(m => {
                if (cancelled) return;
                const users = m?.users || [];
                setUsersMaster(users);
                setGroupCategories(m?.categories || []);
                saveCache(USERS_CACHE_KEY, users);
            })
            .catch(e => console.warn('[OperationalProposals] fetchMasters failed:', e?.message));
        return () => { cancelled = true; };
    }, []);

    useRealtimeChannel('proposals-realtime', [
        {
            event: 'INSERT',
            table: 'operational_proposals',
            callback: (payload) => {
                const newItem = payload.new as OperationalProposal;
                setProposals(prev => prev.some(p => p.id === newItem.id) ? prev : [newItem, ...prev]);
            },
        },
        {
            event: 'UPDATE',
            table: 'operational_proposals',
            callback: (payload) => {
                const updated = payload.new as OperationalProposal;
                setProposals(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
                setSelectedProposal(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
            },
        },
        {
            event: 'DELETE',
            table: 'operational_proposals',
            callback: (payload) => {
                const deletedId = (payload.old as { id: string }).id;
                setProposals(prev => prev.filter(p => p.id !== deletedId));
                setSelectedProposal(prev => prev?.id === deletedId ? null : prev);
            },
        },
    ]);

    const fetchData = async (silent = true) => {
        const hasCache = loadProposalCache().length > 0;

        if (!hasCache && !silent) {
            setLoading(true);
        }
        setFetchError(null);

        try {
            const data = await apiClient.fetchProposals();
            const result = data || [];
            setProposals(result);
            saveCache(PROPOSALS_CACHE_KEY, result);
            setFetchError(null);
        } catch (e: any) {
            console.warn('[OperationalProposals] fetch failed (using cache):', e?.message);
            if (!hasCache) {
                setFetchError('接続に失敗しました。再試行ボタンを押してください。');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProposal = async () => {
        if (!selectedProposal) return;
        const title = selectedProposal.title || '(無題)';
        if (!window.confirm(`提議「${title}」を削除します。合議コメントも一緒に削除されます。よろしいですか？`)) return;
        try {
            await apiClient.deleteProposal(selectedProposal.id);
            setProposals(prev => prev.filter(p => p.id !== selectedProposal.id));
            setSelectedProposal(null);
        } catch (e) {
            console.error("Failed to delete proposal:", e);
            window.alert('削除に失敗しました。時間をおいて再度お試しください。');
        }
    };

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        try {
            // 15秒で強制タイムアウト (auth ロック / ネットワーク不安定に備えて)
            const updateP = apiClient.updateProposalStatus(id, newStatus, user?.id);
            const timeoutP = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout: updateProposalStatus (15s)')), 15000),
            );
            await Promise.race([updateP, timeoutP]);
            const updated_by = user?.id;
            const updated_at = new Date().toISOString();
            setProposals(prev => prev.map(p => p.id === id ? { ...p, status: newStatus as any, updated_by, updated_at } : p));
            if (selectedProposal?.id === id) {
                setSelectedProposal(prev => prev ? { ...prev, status: newStatus as any, updated_by, updated_at } : null);
            }
        } catch (e: any) {
            console.error("Failed to update status:", e);
            window.alert(`ステータス更新に失敗しました。${e?.message ?? ''}`);
        }
    };

    // 選択時にコメントをロード / 編集stateを初期化
    useEffect(() => {
        if (!selectedProposal) {
            setComments([]);
            setCommentDraft('');
            setEditingProposal(false);
            setProposalDraft('');
            setEditingDecision(false);
            setDecisionDraft('');
            return;
        }
        setProposalDraft(selectedProposal.proposal ?? '');
        setDecisionDraft(selectedProposal.decision ?? '');
        setVisibilityDraft(Array.isArray(selectedProposal.visible_groups) ? [...selectedProposal.visible_groups] : []);
        setEditingProposal(false);
        setEditingDecision(false);
        setEditingVisibility(false);
        setCommentDraft('');

        let cancelled = false;
        setCommentsLoading(true);
        apiClient.fetchProposalComments(selectedProposal.id)
            .then(rows => {
                if (cancelled) return;
                // 表示名はページに既にロード済みの usersMaster から解決 (profiles FDW を叩かない)
                const nameById = new Map(usersMaster.map(u => [u.id, u.name]));
                const enriched = (rows as any[]).map(r => ({ ...r, author_name: nameById.get(r.author_id) ?? '' }));
                setComments(enriched as OperationalProposalComment[]);
            })
            .catch(e => console.warn('[OperationalProposals] fetchProposalComments failed:', e?.message))
            .finally(() => { if (!cancelled) setCommentsLoading(false); });
        return () => { cancelled = true; };
    }, [selectedProposal?.id, usersMaster]);

    // 提議のコメント Realtime 購読 (追記・更新・削除をライブ反映)
    useRealtimeChannel(selectedProposal ? `proposal-comments-${selectedProposal.id}` : 'proposal-comments-idle', selectedProposal ? [
        {
            event: 'INSERT',
            table: 'operational_proposal_comments',
            filter: `proposal_id=eq.${selectedProposal.id}`,
            callback: (payload) => {
                const row = payload.new as any;
                // ローカル usersMaster から名前解決 (profiles FDW を叩かない)
                const author_name = usersMaster.find(u => u.id === row.author_id)?.name ?? '';
                setComments(prev => prev.some(c => c.id === row.id) ? prev : [...prev, { ...row, author_name }]);
            },
        },
        {
            event: 'UPDATE',
            table: 'operational_proposal_comments',
            filter: `proposal_id=eq.${selectedProposal.id}`,
            callback: (payload) => {
                const row = payload.new as any;
                setComments(prev => prev.map(c => c.id === row.id ? { ...c, ...row } : c));
            },
        },
        {
            event: 'DELETE',
            table: 'operational_proposal_comments',
            filter: `proposal_id=eq.${selectedProposal.id}`,
            callback: (payload) => {
                const id = (payload.old as any).id;
                setComments(prev => prev.filter(c => c.id !== id));
            },
        },
    ] : []);

    const canEditProposal = !!selectedProposal && !!user && (
        user.role === 'manager' || user.role === 'master' ||
        (!!selectedProposal.author && selectedProposal.author.trim() === user.name?.trim())
    );
    const canEditDecision = !!user && (user.role === 'manager' || user.role === 'master');
    const canAddComment = !!user && user.role !== 'viewer';

    const handleSaveProposal = async () => {
        if (!selectedProposal || !user?.id) return;
        setSavingField('proposal');
        try {
            const body = proposalDraft.trim();
            await apiClient.updateProposalContent(selectedProposal.id, { proposal: body }, user.id);
            const now = new Date().toISOString();
            setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, proposal: body, updated_by: user.id, updated_at: now } : p));
            setSelectedProposal(prev => prev ? { ...prev, proposal: body, updated_by: user.id, updated_at: now } : null);
            setEditingProposal(false);
        } catch (e) {
            console.error("Failed to save proposal:", e);
        } finally {
            setSavingField(null);
        }
    };

    const handleSaveVisibility = async () => {
        if (!selectedProposal || !user?.id) return;
        setSavingField('visibility');
        try {
            const vg = visibilityDraft.length > 0 ? visibilityDraft : null;
            await apiClient.updateProposalContent(selectedProposal.id, { visible_groups: vg }, user.id);
            const now = new Date().toISOString();
            setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, visible_groups: vg, updated_by: user.id, updated_at: now } : p));
            setSelectedProposal(prev => prev ? { ...prev, visible_groups: vg, updated_by: user.id, updated_at: now } : null);
            setEditingVisibility(false);
        } catch (e) {
            console.error("Failed to save visibility:", e);
        } finally {
            setSavingField(null);
        }
    };

    const handleSaveDecision = async () => {
        if (!selectedProposal || !user?.id) return;
        setSavingField('decision');
        try {
            const body = decisionDraft.trim();
            await apiClient.updateProposalContent(selectedProposal.id, { decision: body }, user.id);
            const now = new Date().toISOString();
            setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, decision: body, updated_by: user.id, updated_at: now } : p));
            setSelectedProposal(prev => prev ? { ...prev, decision: body, updated_by: user.id, updated_at: now } : null);
            setEditingDecision(false);
        } catch (e) {
            console.error("Failed to save decision:", e);
        } finally {
            setSavingField(null);
        }
    };

    const handleAddComment = async () => {
        if (!selectedProposal || !user?.id) return;
        const body = commentDraft.trim();
        if (!body) return;
        setCommentBusy(true);
        try {
            await apiClient.createProposalComment(selectedProposal.id, body, user.id);
            setCommentDraft('');
            // Realtime 経由で反映されるが、保険として即時リロード
            const rows = await apiClient.fetchProposalComments(selectedProposal.id);
            const nameById = new Map(usersMaster.map(u => [u.id, u.name]));
            const enriched = (rows as any[]).map(r => ({ ...r, author_name: nameById.get(r.author_id) ?? '' }));
            setComments(enriched as OperationalProposalComment[]);
        } catch (e) {
            console.error("Failed to add comment:", e);
        } finally {
            setCommentBusy(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await apiClient.deleteProposalComment(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (e) {
            console.error("Failed to delete comment:", e);
        }
    };

    const handleCreate = async () => {
        if (!form.title.trim()) return;
        setCreating(true);
        try {
            // ネットワーク不安定時に "追加中..." のまま永久ハングしないよう 20 秒でタイムアウト
            const createP = apiClient.createProposal({
                title: form.title.trim(),
                problem: form.problem.trim(),
                proposal: form.proposal.trim(),
                author: form.author.trim() || null,
                proposed_at: form.proposed_at || null,
                priority: form.priority,
                status: form.status,
                category: form.category,
                visible_groups: form.visible_groups.length > 0 ? form.visible_groups : null,
            });
            const timeoutP = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout: createProposal (20s)')), 20000),
            );
            await Promise.race([createP, timeoutP]);
            // 一覧 refetch は await しない (fetchProposals が詰まるとモーダルが閉じなくなるため)
            fetchData().catch(e => console.warn('[handleCreate] refetch failed:', e?.message));
            setShowCreateModal(false);
            setForm({ category: 'Engineer（施工）', title: '', problem: '', proposal: '', author: user?.name ?? '', proposed_at: TODAY, priority: '中', status: '未着手', visible_groups: [] });
        } catch (e: any) {
            console.error("Failed to create proposal:", e);
            window.alert(`作成に失敗しました。${e?.message ?? ''}`);
        } finally {
            setCreating(false);
        }
    };

    const getNormalizedCategory = (cat: string | undefined): string => {
        if (!cat) return 'その他';
        const c = cat.trim();
        if (masterCategories.includes(c)) return c;
        if (c === 'AfterTrouble' || (c.toLowerCase().includes('engineer') && c.includes('障害'))) return 'Engineer（障害）';
        if (c === 'Construction' || (c.toLowerCase().includes('engineer') && c.includes('施工'))) return 'Engineer（施工）';
        if (c.includes('施工管理')) return '施工管理';
        if (c.includes('設置管理')) return '設置管理';
        return 'その他';
    };

    const filteredProposals = (() => {
        let filtered = activeCategory === '全て'
            ? proposals
            : proposals.filter(p => getNormalizedCategory(p.category) === activeCategory);

        if (activeStatus !== '全て') {
            filtered = filtered.filter(p => p.status === activeStatus);
        }

        return [...filtered].sort((a, b) => {
            if (sortMode === 'number') {
                return parseInt(a.source_no || '0', 10) - parseInt(b.source_no || '0', 10);
            }
            const da = a.proposed_at ? new Date(a.proposed_at).getTime() : 0;
            const db = b.proposed_at ? new Date(b.proposed_at).getTime() : 0;
            return db - da;
        });
    })();

    // 決定事項ありの提議（サイドバー用）: updated_at 降順
    const decidedProposals = [...proposals]
        .filter(p => (p.decision ?? '').trim().length > 0)
        .sort((a, b) => {
            const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return db - da;
        });

    const getStatusIcon = (status: string) => {
        switch (status) {
            case '完了': return <CheckCircle size={12} />;
            case '対応中': return <Clock size={12} />;
            default: return <AlertCircle size={12} />;
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case '高': return '#f87171';
            case '中': return '#fbbf24';
            default: return '#60a5fa';
        }
    };

    // 区分マスタ（公開先グループ）のチップ配色。name から安定的に hue を決めて、
    // 区分ごとに視覚的に見分けがつくようにする。
    const groupChipStyle = (name: string, on: boolean): React.CSSProperties => {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        const hue = h % 360;
        if (on) {
            return {
                background: `hsla(${hue}, 75%, 55%, 0.28)`,
                border: `1px solid hsla(${hue}, 80%, 65%, 0.9)`,
                color: `hsl(${hue}, 90%, 82%)`,
                fontWeight: 700,
                boxShadow: `0 0 0 1px hsla(${hue}, 80%, 65%, 0.35) inset`,
            };
        }
        return {
            background: `hsla(${hue}, 45%, 45%, 0.10)`,
            border: `1px solid hsla(${hue}, 40%, 55%, 0.35)`,
            color: `hsl(${hue}, 45%, 78%)`,
            fontWeight: 500,
        };
    };

    const getCategoryStyles = (category: string) => {
        const norm = getNormalizedCategory(category);
        switch (norm) {
            case 'Engineer（障害）': return { bg: 'rgba(249,115,22,0.1)', color: '#fdba74', border: 'rgba(249,115,22,0.4)' };
            case 'Engineer（施工）': return { bg: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' };
            case '施工管理':         return { bg: 'rgba(16,185,129,0.1)', color: '#34d399', border: 'rgba(16,185,129,0.4)' };
            case '設置管理':         return { bg: 'rgba(6,182,212,0.1)',   color: '#22d3ee', border: 'rgba(6,182,212,0.4)' };
            default:                 return { bg: 'rgba(71,85,105,0.15)',  color: '#94a3b8', border: 'rgba(71,85,105,0.4)' };
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 14px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: 'var(--text)',
        fontSize: '0.95rem',
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '0.8rem',
        color: 'var(--text-dim)',
        marginBottom: '6px',
        display: 'block',
    };

    // ---- Close button used in modals (BackButtonと統一) ----
    const ModalCloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
        <BackButton onClick={onClick} />
    );

    const UserIdentity: React.FC<{ name: string | null | undefined; size?: number }> = ({ name, size = 20 }) => {
        const raw = (name ?? '').trim();
        const targetUser = raw ? resolveProfileByName(usersMaster, raw) : undefined;
        const displayName = targetUser?.name || raw || '—';

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                {targetUser?.avatarUrl ? (
                    <img src={targetUser.avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--glass-border)', flexShrink: 0 }} />
                ) : (
                    <div className="user-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42, flexShrink: 0 }}>
                        {displayName.charAt(0)}
                    </div>
                )}
                <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{displayName}</span>
            </div>
        );
    };

    return (
        <div className="view active flex-column" style={{ background: 'var(--bg)', minHeight: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div className="glass-header" style={{
                padding: '20px 40px',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'rgba(255,255,255,0.02)',
                backdropFilter: 'blur(30px)',
                zIndex: 10,
            }}>
                <BackButton onClick={onBack} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>運用提議</h1>
                        {!loading && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                {activeCategory === '全て'
                                    ? `全 ${proposals.length} 件`
                                    : `${filteredProposals.length} 件 / 全 ${proposals.length} 件`}
                            </span>
                        )}
                    </div>
                    <button
                        className="btn-ghost-glass"
                        onClick={() => setSortMode(prev => prev === 'date' ? 'number' : 'date')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', cursor: 'pointer',
                            transition: 'all 0.2s', whiteSpace: 'nowrap',
                        }}
                    >
                        {sortMode === 'date' ? <><ArrowUpDown size={13} /> 日付順</> : <><Hash size={13} /> 番号順</>}
                    </button>
                </div>

                <div style={{ flex: 1, display: 'flex', gap: '10px', flexWrap: 'nowrap', justifyContent: 'flex-start', alignItems: 'center', minWidth: 0 }}>
                    {user?.role !== 'viewer' && (
                        <button
                            className="btn-indigo-solid"
                            onClick={() => setShowCreateModal(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: '10px',
                                background: 'rgba(99,102,241,0.85)',
                                border: 'none',
                                color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
                                marginRight: '8px',
                                flexShrink: 0,
                            }}
                        >
                            <Plus size={15} /> 新規追加
                        </button>
                    )}

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.12)', marginRight: '4px', flexShrink: 0 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0, overflowX: 'auto', paddingTop: '4px', paddingBottom: '4px' }}>
                    {/* カテゴリフィルター */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap', alignItems: 'center' }}>
                        {categories.map(cat => {
                            const isActive = activeCategory === cat;
                            const isAll = cat === '全て';
                            const cs = getCategoryStyles(cat);
                            const activeStyle = isActive
                                ? isAll
                                    ? { background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.7)', boxShadow: '0 4px 15px rgba(255,255,255,0.25)', fontWeight: 700 }
                                    : { background: cs.bg, color: cs.color, borderColor: cs.border, boxShadow: `0 4px 15px ${cs.border}`, fontWeight: 700 }
                                : {};
                            return (
                                <button key={cat} className={`badge-tab${isActive ? ' is-active' : ''}`}
                                    style={{ fontSize: '0.75rem', padding: '6px 14px', ...activeStyle }}
                                    onClick={() => setActiveCategory(cat)}>{cat}</button>
                            );
                        })}
                    </div>
                    {/* ステータスフィルター */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap', alignItems: 'center' }}>
                        {(['全て', '未着手', '対応中', '完了', '保留'] as const).map(s => {
                            const isActive = activeStatus === s;
                            const sc: Record<string, { color: string; bg: string; glow: string }> = {
                                '未着手': { color: '#f87171', bg: 'rgba(248,113,113,0.15)', glow: 'rgba(248,113,113,0.35)' },
                                '対応中': { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  glow: 'rgba(251,191,36,0.35)'  },
                                '完了':   { color: '#34d399', bg: 'rgba(52,211,153,0.15)',  glow: 'rgba(52,211,153,0.35)'  },
                                '保留':   { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', glow: 'rgba(148,163,184,0.25)' },
                            };
                            const c = sc[s];
                            return (
                                <button key={s} className={`badge-tab${isActive ? ' is-active' : ''}`}
                                    style={{
                                        fontSize: '0.72rem', padding: '4px 12px',
                                        ...(c ? {
                                            color: isActive ? c.color : 'rgba(255,255,255,0.5)',
                                            borderColor: isActive ? c.color : 'rgba(255,255,255,0.1)',
                                            background: isActive ? c.bg : 'rgba(255,255,255,0.05)',
                                            boxShadow: isActive ? `0 4px 15px ${c.glow}` : 'none',
                                            fontWeight: isActive ? 700 : 400,
                                        } : {
                                            // 「全て」— カテゴリ行と同じ白 glow
                                            color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                                            background: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                            borderColor: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.1)',
                                            boxShadow: isActive ? '0 4px 15px rgba(255,255,255,0.25)' : 'none',
                                            fontWeight: isActive ? 700 : 400,
                                        })
                                    }}
                                    onClick={() => setActiveStatus(s)}>{s}</button>
                            );
                        })}
                    </div>
                </div>
            </div>
            </div>

            {/* Body: Sidebar (決定事項) + List */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {decidedProposals.length > 0 && (
                <aside style={{
                    order: 1,
                    width: '280px', flexShrink: 0, overflowY: 'auto',
                    padding: '28px 28px 28px 18px',
                    borderLeft: '1px solid rgba(52,211,153,0.12)',
                    background: 'linear-gradient(180deg, rgba(52,211,153,0.04), rgba(52,211,153,0) 65%)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', padding: '0 4px' }}>
                        <Gavel size={14} style={{ color: '#34d399' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.04em' }}>
                            決定事項
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                            {decidedProposals.length} 件
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {decidedProposals.map(p => {
                            const catStyle = getCategoryStyles(p.category || '');
                            const isActive = selectedProposal?.id === p.id;
                            return (
                                <button key={p.id} onClick={() => setSelectedProposal(p)}
                                    className="decided-card"
                                    style={{
                                        textAlign: 'left', padding: '10px 12px', borderRadius: '12px',
                                        background: isActive ? 'rgba(52,211,153,0.12)' : 'rgba(52,211,153,0.035)',
                                        border: '1px solid ' + (isActive ? 'rgba(52,211,153,0.55)' : 'rgba(52,211,153,0.16)'),
                                        color: 'var(--text)', cursor: 'pointer',
                                        transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
                                        display: 'flex', flexDirection: 'column', gap: '4px',
                                        ['--card-accent' as any]: '#34d399',
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{
                                            fontSize: '0.62rem', padding: '2px 6px', borderRadius: '6px',
                                            color: catStyle.color, background: catStyle.bg,
                                            border: `1px solid ${catStyle.border}`, whiteSpace: 'nowrap',
                                        }}>
                                            {getNormalizedCategory(p.category)}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                                            No.{p.source_no || '—'}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.title}
                                    </span>
                                    <span style={{
                                        fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.4,
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}>
                                        {p.decision}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px' }}>
                {fetchError && (
                    <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: '14px',
                        padding: '20px 24px', borderRadius: '16px',
                        background: 'rgba(239,68,68,0.18)', border: '1.5px solid rgba(239,68,68,0.6)',
                        color: '#fca5a5', fontSize: '0.9rem', maxWidth: '1200px', margin: '0 auto 24px',
                        boxShadow: '0 4px 24px rgba(239,68,68,0.15)',
                    }}>
                        <AlertCircle size={22} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#f87171' }}>データの取得に失敗しました</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.85, fontFamily: 'monospace', wordBreak: 'break-all' }}>{fetchError}</div>
                        </div>
                        <button className="btn-retry-danger" onClick={() => fetchData()} style={{
                            padding: '8px 18px', borderRadius: '10px', flexShrink: 0,
                            background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.6)',
                            color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                            transition: 'all 0.2s',
                        }}>再試行</button>
                    </div>
                )}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div className="loading-spinner" />
                    </div>
                ) : !fetchError && filteredProposals.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: 'var(--text-dim)', textAlign: 'center' }}>
                        <MessageSquare size={64} style={{ marginBottom: '20px', opacity: 0.2 }} />
                        <p>該当するチケットはありません</p>
                    </div>
                ) : (
                    <div className="proposal-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '1200px', margin: '0 auto' }}>
                        {filteredProposals.map(proposal => {
                            const catStyle = getCategoryStyles(proposal.category || '');
                            return (
                                <div key={proposal.id} className="glass-card proposal-card animate-in"
                                    onClick={() => setSelectedProposal(proposal)}
                                    style={{
                                        cursor: 'pointer', padding: '16px 24px',
                                        display: 'grid',
                                        gridTemplateColumns: '150px 70px 90px minmax(0, 1fr) 150px 120px 32px',
                                        gridTemplateRows: 'auto auto',
                                        columnGap: '12px',
                                        rowGap: '4px',
                                        alignItems: 'center',
                                        border: '1px solid transparent',
                                        background: 'var(--glass-bg)',
                                        borderRadius: '16px',
                                        transition: 'border-color 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s cubic-bezier(0.16,1,0.3,1), transform 0.22s cubic-bezier(0.16,1,0.3,1)',
                                        backdropFilter: 'blur(10px)',
                                        ['--card-accent' as any]: catStyle.color,
                                    }}>
                                    {(() => {
                                        const desc = proposal.description || '';
                                        const marker = '【改善提案】\n';
                                        const idx = desc.indexOf(marker);
                                        const preview = (proposal as any).problem
                                            || (idx >= 0 ? desc.slice(0, idx).trim() : desc.trim())
                                            || (proposal as any).proposal
                                            || '';
                                        const hasPreview = !!preview;
                                        const spanRows = hasPreview ? '1 / span 2' : '1';
                                        return (
                                            <>
                                                {/* 種別 (全行・左寄せ・垂直中央) */}
                                                <div style={{ gridColumn: '1', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                                    <div style={{
                                                        display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                                                        height: '28px', padding: '0 10px', boxSizing: 'border-box',
                                                        borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                                                        background: catStyle.bg, color: catStyle.color, border: `1px solid ${catStyle.border}`, whiteSpace: 'nowrap',
                                                        boxShadow: `0 0 12px ${catStyle.border}`, lineHeight: 1,
                                                    }}>
                                                        <Tag size={12} style={{ flexShrink: 0 }} />
                                                        <span>{getNormalizedCategory(proposal.category)}</span>
                                                    </div>
                                                </div>
                                                {/* No (全行・左寄せ・垂直中央) */}
                                                <div style={{ gridColumn: '2', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                                                    No.{proposal.source_no || '—'}
                                                </div>
                                                {/* 進捗バッジ (全行・左寄せ・垂直中央) */}
                                                <div style={{ gridColumn: '3', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                                    <div style={{
                                                        display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                                                        height: '28px', padding: '0 12px', boxSizing: 'border-box',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem', fontWeight: 800,
                                                        background: proposal.status === '完了' ? 'rgba(16,185,129,0.15)' : proposal.status === '対応中' ? 'rgba(245,158,11,0.15)' : proposal.status === '保留' ? 'rgba(148,163,184,0.15)' : 'rgba(239,68,68,0.15)',
                                                        color: proposal.status === '完了' ? '#34d399' : proposal.status === '対応中' ? '#fbbf24' : proposal.status === '保留' ? '#94a3b8' : '#f87171',
                                                        border: '1px solid currentColor',
                                                        boxShadow: proposal.status === '完了' ? '0 0 12px rgba(52,211,153,0.4)' : proposal.status === '対応中' ? '0 0 12px rgba(251,191,36,0.4)' : proposal.status === '保留' ? '0 0 12px rgba(148,163,184,0.3)' : '0 0 12px rgba(248,113,113,0.4)',
                                                        whiteSpace: 'nowrap', lineHeight: 1,
                                                    }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{getStatusIcon(proposal.status)}</span>
                                                        <span>{proposal.status}</span>
                                                    </div>
                                                </div>
                                                {/* タイトル (1行目・左寄せ) */}
                                                <h3 style={{ gridColumn: '4', gridRow: '1', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, textAlign: 'left' }}>
                                                    {proposal.title}
                                                </h3>
                                                {/* 問題点プレビュー (2行目・タイトル列) */}
                                                {hasPreview && (
                                                    <p style={{
                                                        gridColumn: '4', gridRow: '2',
                                                        fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5,
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        margin: 0, minWidth: 0, textAlign: 'left',
                                                    }}>
                                                        {preview}
                                                    </p>
                                                )}
                                                {/* 投稿者 (全行・左寄せ・1行固定) */}
                                                <div style={{ gridColumn: '5', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                    <UserIdentity name={proposal.author} size={18} />
                                                </div>
                                                {/* 日付バッジ (全行・中央揃え) */}
                                                <div style={{ gridColumn: '6', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                        height: '28px', padding: '0 10px', boxSizing: 'border-box',
                                                        borderRadius: '10px', fontSize: '0.75rem',
                                                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)',
                                                        border: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', lineHeight: 1,
                                                    }}>
                                                        <Calendar size={12} />
                                                        {proposal.proposed_at ? new Date(proposal.proposed_at).toLocaleDateString() : '未設定'}
                                                    </div>
                                                </div>
                                                {/* 優先度ドット (全行・中央揃え・テキスト無し) */}
                                                <div style={{ gridColumn: '7', gridRow: spanRows, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span
                                                        title={`優先度: ${proposal.priority}`}
                                                        style={{
                                                            width: '8px', height: '8px', borderRadius: '50%',
                                                            background: getPriorityColor(proposal.priority),
                                                            boxShadow: `0 0 6px ${getPriorityColor(proposal.priority)}99`,
                                                            border: `1px solid ${getPriorityColor(proposal.priority)}`,
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            </div>

            {/* Detail Modal */}
            {selectedProposal && (
                <div className="modal-overlay active" onClick={() => setSelectedProposal(null)} style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}>
                    <div className="modal-content glass-elevated" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '800px', width: '90%', maxHeight: '85vh', overflowY: 'auto',
                        padding: '40px', borderRadius: '32px',
                        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <ModalCloseButton onClick={() => setSelectedProposal(null)} />
                                <span style={{
                                    padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                                    background: getCategoryStyles(selectedProposal.category || '').bg,
                                    color: getCategoryStyles(selectedProposal.category || '').color,
                                    border: `1px solid ${getCategoryStyles(selectedProposal.category || '').border}`,
                                }}>
                                    {getNormalizedCategory(selectedProposal.category)}
                                </span>
                            </div>
                        </div>

                        <h2 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '24px', color: 'var(--text)', lineHeight: 1.3 }}>{selectedProposal.title}</h2>

                        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
                            <div style={{
                                padding: '8px 24px', borderRadius: '24px', fontSize: '0.9rem', fontWeight: 600,
                                background: selectedProposal.status === '完了' ? 'rgba(16,185,129,0.15)' : selectedProposal.status === '対応中' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                color: selectedProposal.status === '完了' ? '#34d399' : selectedProposal.status === '対応中' ? '#fbbf24' : '#f87171',
                                border: '1px solid currentColor',
                            }}>{selectedProposal.status}</div>
                            <div style={{
                                padding: '8px 24px', borderRadius: '24px', fontSize: '0.9rem',
                                border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                                color: getPriorityColor(selectedProposal.priority),
                            }}>優先度: {selectedProposal.priority}</div>
                        </div>

                        {(() => {
                            const desc = selectedProposal.description || '';
                            const marker = '【改善提案】\n';
                            const idx = desc.indexOf(marker);

                            // DBの新しいカラム (problem/proposal) があれば優先、なければ description からパース
                            const problemText = selectedProposal.problem || (idx >= 0 ? desc.slice(0, idx).trim() : desc.trim());
                            const proposalText = (selectedProposal.proposal ?? '') || (idx >= 0 ? desc.slice(idx + marker.length).trim() : '');
                            const decisionText = selectedProposal.decision ?? '';

                            const blockStyle: React.CSSProperties = {
                                background: 'rgba(255,255,255,0.02)', padding: '24px 28px', borderRadius: '20px',
                                border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.8, fontSize: '1rem',
                                whiteSpace: 'pre-wrap', color: 'var(--text)',
                            };
                            const sectionLabel: React.CSSProperties = {
                                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
                                color: 'var(--text-dim)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px',
                            };
                            const editIconBtn: React.CSSProperties = {
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '10px', padding: '4px 8px', color: 'var(--text-dim)',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                fontSize: '0.72rem',
                            };
                            const editAreaStyle: React.CSSProperties = {
                                width: '100%', minHeight: '120px', padding: '16px 20px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                                color: 'var(--text)', fontSize: '1rem', lineHeight: 1.8, resize: 'vertical',
                                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                            };

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                                    {/* 問題点 */}
                                    <div>
                                        <span style={sectionLabel}>問題点</span>
                                        <div style={blockStyle}>{problemText || <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>未入力</span>}</div>
                                    </div>

                                    {/* 改善提案 (編集可) */}
                                    <div>
                                        <div style={{ ...sectionLabel, color: '#f97316', justifyContent: 'space-between' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>改善提案</span>
                                            {canEditProposal && !editingProposal && (
                                                <button style={editIconBtn} onClick={() => { setProposalDraft(selectedProposal.proposal ?? proposalText ?? ''); setEditingProposal(true); }}>
                                                    <Edit2 size={12} />編集
                                                </button>
                                            )}
                                        </div>
                                        {editingProposal ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <textarea
                                                    value={proposalDraft}
                                                    onChange={e => setProposalDraft(e.target.value)}
                                                    placeholder="改善提案を入力"
                                                    style={{ ...editAreaStyle, border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.04)' }}
                                                />
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => { setEditingProposal(false); setProposalDraft(selectedProposal.proposal ?? ''); }}
                                                        style={{ ...editIconBtn, padding: '8px 14px' }}>
                                                        <X size={14} />キャンセル
                                                    </button>
                                                    <button onClick={handleSaveProposal} disabled={savingField === 'proposal'}
                                                        style={{ ...editIconBtn, padding: '8px 14px', color: '#f97316', borderColor: 'rgba(249,115,22,0.5)', background: 'rgba(249,115,22,0.12)' }}>
                                                        <Check size={14} />{savingField === 'proposal' ? '保存中…' : '保存'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ ...blockStyle, border: '1px solid rgba(249,115,22,0.2)', background: 'rgba(249,115,22,0.04)' }}>
                                                {proposalText || <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>未入力</span>}
                                            </div>
                                        )}
                                    </div>

                                    {/* 決定事項 (manager/master のみ編集可、未設定時は閲覧ユーザーには非表示) */}
                                    {(decisionText || canEditDecision) && (
                                        <div>
                                            <div style={{ ...sectionLabel, color: '#34d399', justifyContent: 'space-between' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <Gavel size={13} />決定事項
                                                </span>
                                                {canEditDecision && !editingDecision && (
                                                    <button style={editIconBtn} onClick={() => { setDecisionDraft(selectedProposal.decision ?? ''); setEditingDecision(true); }}>
                                                        <Edit2 size={12} />{decisionText ? '編集' : '記録する'}
                                                    </button>
                                                )}
                                            </div>
                                            {editingDecision ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <textarea
                                                        value={decisionDraft}
                                                        onChange={e => setDecisionDraft(e.target.value)}
                                                        placeholder="決定事項を記録 (合議の結論)"
                                                        style={{ ...editAreaStyle, border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.04)' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button onClick={() => { setEditingDecision(false); setDecisionDraft(selectedProposal.decision ?? ''); }}
                                                            style={{ ...editIconBtn, padding: '8px 14px' }}>
                                                            <X size={14} />キャンセル
                                                        </button>
                                                        <button onClick={handleSaveDecision} disabled={savingField === 'decision'}
                                                            style={{ ...editIconBtn, padding: '8px 14px', color: '#34d399', borderColor: 'rgba(52,211,153,0.5)', background: 'rgba(52,211,153,0.12)' }}>
                                                            <Check size={14} />{savingField === 'decision' ? '保存中…' : '保存'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ ...blockStyle, border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.05)' }}>
                                                    {decisionText || <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>未記録</span>}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 公開先グループ (可視性) */}
                                    {(() => {
                                        const vg = selectedProposal.visible_groups;
                                        const isAllVisible = !vg || (Array.isArray(vg) && vg.length === 0);
                                        const forcedAll = !!decisionText; // 決定事項ありは常に全員公開
                                        return (
                                            <div>
                                                <div style={{ ...sectionLabel, color: '#60a5fa', justifyContent: 'space-between' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                        公開先グループ
                                                    </span>
                                                    {canEditProposal && !editingVisibility && (
                                                        <button style={editIconBtn} onClick={() => {
                                                            setVisibilityDraft(Array.isArray(vg) ? [...vg] : []);
                                                            setEditingVisibility(true);
                                                        }}>
                                                            <Edit2 size={12} />編集
                                                        </button>
                                                    )}
                                                </div>
                                                {editingVisibility ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {groupCategories.length === 0 ? (
                                                            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', fontSize: '0.82rem' }}>
                                                                区分マスタが未登録のため全員公開となります。
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                                {groupCategories.map(c => {
                                                                    const on = visibilityDraft.includes(c);
                                                                    return (
                                                                        <button
                                                                            key={c}
                                                                            type="button"
                                                                            onClick={() => setVisibilityDraft(prev => on ? prev.filter(g => g !== c) : [...prev, c])}
                                                                            style={{
                                                                                padding: '6px 12px',
                                                                                borderRadius: 16,
                                                                                fontSize: '0.8rem',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.15s',
                                                                                ...groupChipStyle(c, on),
                                                                            }}
                                                                        >
                                                                            {on ? '✓ ' : ''}{c}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                                                            未選択=全員公開 / 決定事項が記録されている提議は常に全員公開
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                            <button onClick={() => { setEditingVisibility(false); setVisibilityDraft(Array.isArray(vg) ? [...vg] : []); }}
                                                                style={{ ...editIconBtn, padding: '8px 14px' }}>
                                                                <X size={14} />キャンセル
                                                            </button>
                                                            <button onClick={handleSaveVisibility} disabled={savingField === 'visibility'}
                                                                style={{ ...editIconBtn, padding: '8px 14px', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.5)', background: 'rgba(96,165,250,0.12)' }}>
                                                                <Check size={14} />{savingField === 'visibility' ? '保存中…' : '保存'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ ...blockStyle, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.05)', padding: '10px 14px' }}>
                                                        {forcedAll && !isAllVisible && (
                                                            <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginBottom: 6 }}>
                                                                ⚠ 決定事項ありのため設定に関わらず全員公開
                                                            </div>
                                                        )}
                                                        {isAllVisible || forcedAll ? (
                                                            <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>全員公開</span>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                                {(vg as string[]).map(g => (
                                                                    <span key={g} style={{
                                                                        padding: '3px 10px', borderRadius: 14,
                                                                        background: 'rgba(96,165,250,0.18)', border: '1px solid rgba(96,165,250,0.35)',
                                                                        color: '#bfdbfe', fontSize: '0.78rem', fontWeight: 600,
                                                                    }}>{g}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', gap: '40px', marginBottom: '48px', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem' }}>起案者</span>
                                    <UserIdentity name={selectedProposal.author} size={28} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Calendar size={20} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem' }}>起案日</span>
                                    <span style={{ color: 'var(--text)' }}>
                                        {selectedProposal.proposed_at ? new Date(selectedProposal.proposed_at).toLocaleDateString() : '未設定'}
                                    </span>
                                </div>
                            </div>
                            {selectedProposal.updated_by && (() => {
                                const updater = usersMaster.find(u => u.id === selectedProposal.updated_by);
                                const updatedAt = selectedProposal.updated_at ? new Date(selectedProposal.updated_at) : null;
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.75rem' }}>最終更新</span>
                                            <UserIdentity name={updater?.name ?? ''} size={28} />
                                            {updatedAt && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                                    {updatedAt.toLocaleDateString()} {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* 合議スレッド */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '28px', marginBottom: '32px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <MessageSquare size={16} style={{ color: 'var(--text-dim)' }} />
                                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>合議</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{comments.length} 件</span>
                            </div>

                            {commentsLoading ? (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>読み込み中…</div>
                            ) : comments.length === 0 ? (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>まだ議論の記録はありません。</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {comments.map(c => {
                                        const isOwn = c.author_id === user?.id;
                                        const canDelete = isOwn || user?.role === 'manager' || user?.role === 'master';
                                        const when = new Date(c.created_at);
                                        return (
                                            <div key={c.id} style={{
                                                padding: '14px 16px', borderRadius: '14px',
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                    <UserIdentity name={c.author_name ?? ''} size={22} />
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                                            {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {canDelete && (
                                                            <button onClick={() => handleDeleteComment(c.id)}
                                                                title="削除"
                                                                style={{
                                                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                                                    color: 'var(--text-dim)', padding: '2px', display: 'inline-flex',
                                                                }}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                                                    {c.body}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {canAddComment && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                                    <textarea
                                        value={commentDraft}
                                        onChange={e => setCommentDraft(e.target.value)}
                                        placeholder="議論内容を追記 (Ctrl+Enter で送信)"
                                        onKeyDown={e => {
                                            if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return;
                                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddComment();
                                            }
                                        }}
                                        style={{
                                            width: '100%', minHeight: '72px', padding: '12px 14px',
                                            borderRadius: '14px', background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text)',
                                            fontSize: '0.92rem', lineHeight: 1.6, resize: 'vertical',
                                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={handleAddComment} disabled={commentBusy || !commentDraft.trim()}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 16px', borderRadius: '12px',
                                                background: commentDraft.trim() ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                                                border: '1px solid ' + (commentDraft.trim() ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.1)'),
                                                color: commentDraft.trim() ? '#c7d2fe' : 'var(--text-dim)',
                                                cursor: commentDraft.trim() && !commentBusy ? 'pointer' : 'not-allowed',
                                                fontSize: '0.85rem',
                                            }}>
                                            <Send size={13} />{commentBusy ? '送信中…' : '追記する'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {user?.role !== 'viewer' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>ステータスを更新</span>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    {(['未着手', '対応中', '完了', '保留'] as const).map(s => {
                                        const isActive = selectedProposal.status === s;
                                        const statusColors = {
                                            '未着手': { rgb: '248,113,113', hex: '#f87171' },
                                            '対応中': { rgb: '251,191,36',  hex: '#fbbf24' },
                                            '完了':   { rgb: '52,211,153',  hex: '#34d399' },
                                            '保留':   { rgb: '148,163,184', hex: '#cbd5e1' },
                                        }[s];
                                        return (
                                            <button key={s}
                                                className={`status-option-btn status-${s}${isActive ? ' is-active' : ''}`}
                                                onClick={() => handleStatusUpdate(selectedProposal.id, s)}
                                                style={{
                                                    flex: 1, padding: '14px', borderRadius: '16px',
                                                    background: isActive
                                                        ? `rgba(${statusColors.rgb},0.18)`
                                                        : 'rgba(255,255,255,0.05)',
                                                    border: '1px solid ' + (isActive
                                                        ? `rgba(${statusColors.rgb},0.7)`
                                                        : 'rgba(255,255,255,0.1)'),
                                                    color: isActive ? statusColors.hex : '#fff',
                                                    fontWeight: isActive ? 700 : 400,
                                                    cursor: 'pointer',
                                                    transition: 'background 0.22s cubic-bezier(0.16,1,0.3,1), border-color 0.22s cubic-bezier(0.16,1,0.3,1), color 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s cubic-bezier(0.16,1,0.3,1), transform 0.22s cubic-bezier(0.16,1,0.3,1)',
                                                    boxShadow: isActive
                                                        ? `0 0 0 1px rgba(${statusColors.rgb},0.55), 0 8px 24px -10px rgba(${statusColors.rgb},0.55)`
                                                        : 'none',
                                                }}>{s}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {canEditProposal && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '20px' }}>
                                <button
                                    onClick={handleDeleteProposal}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                                        padding: '10px 16px', borderRadius: '12px',
                                        background: 'rgba(248,113,113,0.08)',
                                        border: '1px solid rgba(248,113,113,0.35)',
                                        color: '#f87171',
                                        fontSize: '0.85rem', cursor: 'pointer',
                                        transition: 'background 0.18s, border-color 0.18s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.16)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.6)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.35)'; }}
                                >
                                    <Trash2 size={14} />この提議を削除
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="modal-overlay active" onClick={() => setShowCreateModal(false)} style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}>
                    <div className="modal-content glass-elevated" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '640px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
                        padding: '40px', borderRadius: '32px',
                        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                            <ModalCloseButton onClick={() => setShowCreateModal(false)} />
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>新規チケット追加</h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* 種別 */}
                            <div>
                                <label style={labelStyle}>種別 <span style={{ color: '#f87171' }}>*</span></label>
                                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                                    {masterCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {/* 改善要望概要 */}
                            <div>
                                <label style={labelStyle}>改善要望概要 <span style={{ color: '#f87171' }}>*</span></label>
                                <input
                                    type="text" value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="要望・課題を簡潔に入力"
                                    style={inputStyle}
                                />
                            </div>

                            {/* 問題点 */}
                            <div>
                                <label style={labelStyle}>問題点</label>
                                <textarea
                                    value={form.problem}
                                    onChange={e => setForm(f => ({ ...f, problem: e.target.value }))}
                                    placeholder="現状の問題・背景を入力"
                                    rows={3}
                                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
                                />
                            </div>

                            {/* 改善提案 */}
                            <div>
                                <label style={labelStyle}>改善提案 <span style={{ color: '#f97316', fontSize: '0.7rem' }}>(スプレッドシートの改善提案に対応)</span></label>
                                <textarea
                                    value={form.proposal}
                                    onChange={e => setForm(f => ({ ...f, proposal: e.target.value }))}
                                    placeholder="具体的な改善案・対策を入力"
                                    rows={3}
                                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
                                />
                            </div>

                            {/* 起案者 / 日付 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>起案者</label>
                                    <input type="text" value={form.author}
                                        onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                                        style={inputStyle} placeholder="氏名" />
                                </div>
                                <div>
                                    <label style={labelStyle}>起案日</label>
                                    <input type="date" value={form.proposed_at}
                                        onChange={e => setForm(f => ({ ...f, proposed_at: e.target.value }))}
                                        style={inputStyle} />
                                </div>
                            </div>

                            {/* 優先度 / ステータス */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>優先度</label>
                                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))} style={inputStyle}>
                                        {(['高', '中', '低'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>ステータス</label>
                                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} style={inputStyle}>
                                        {(['未着手', '対応中', '完了', '保留'] as const).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* 公開先グループ (未選択 = 全員公開) */}
                            <div>
                                <label style={labelStyle}>
                                    公開先グループ
                                    <span style={{ color: 'var(--muted)', fontSize: '0.72rem', marginLeft: 8, fontWeight: 400 }}>
                                        (未選択=全員公開 / 決定事項は常に全員公開)
                                    </span>
                                </label>
                                {groupCategories.length === 0 ? (
                                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', fontSize: '0.82rem' }}>
                                        区分マスタが未登録のため全員公開となります。
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {groupCategories.map(c => {
                                            const on = form.visible_groups.includes(c);
                                            return (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setForm(f => ({
                                                        ...f,
                                                        visible_groups: on
                                                            ? f.visible_groups.filter(g => g !== c)
                                                            : [...f.visible_groups, c],
                                                    }))}
                                                    style={{
                                                        padding: '7px 14px',
                                                        borderRadius: 18,
                                                        fontSize: '0.82rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        ...groupChipStyle(c, on),
                                                    }}
                                                >
                                                    {on ? '✓ ' : ''}{c}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {form.visible_groups.length === 0 && groupCategories.length > 0 && (
                                    <div style={{ marginTop: 6, fontSize: '0.74rem', color: 'var(--muted)' }}>
                                        現在: 全員公開
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                            <button className="btn-modal-cancel" onClick={() => setShowCreateModal(false)} style={{
                                flex: 1, padding: '14px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.95rem',
                                transition: 'all 0.2s',
                            }}>キャンセル</button>
                            <button className="btn-modal-submit" onClick={handleCreate} disabled={!form.title.trim() || creating} style={{
                                flex: 2, padding: '14px', borderRadius: '16px',
                                background: form.title.trim() ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.3)',
                                border: '1px solid rgba(99,102,241,0.8)',
                                color: '#fff', fontWeight: 700, cursor: form.title.trim() ? 'pointer' : 'not-allowed',
                                fontSize: '0.95rem', transition: 'all 0.2s',
                            }}>{creating ? '追加中...' : '追加する'}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .badge-tab {
                    padding: 8px 18px; border-radius: 20px;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15);
                    color: rgba(255,255,255,0.6); font-size: 0.825rem; cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.16,1,0.3,1); backdrop-filter: blur(8px); white-space: nowrap;
                }
                .badge-tab:not(.is-active):hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(147,197,253,0.35) !important; color: #fff !important; }
                .badge-tab.is-active:hover { filter: brightness(1.12); }
                .badge-tab.active { background: rgba(99,102,241,0.5); color: #fff; border-color: rgba(99,102,241,0.8); font-weight: 700; box-shadow: 0 4px 15px rgba(99,102,241,0.3); }
                .proposal-card:hover { transform: translateX(8px); }
                .decided-card:hover { background: rgba(52,211,153,0.1) !important; border-color: rgba(52,211,153,0.45) !important; transform: translateX(-2px); }
                .btn-ghost-glass:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.3) !important; color: #fff !important; transform: translateY(-1px); }
                .btn-indigo-solid:hover { background: rgba(99,102,241,1) !important; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.55) !important; }
                .btn-indigo-solid:active { transform: translateY(0) scale(0.98); }
                .btn-retry-danger:hover { background: rgba(239,68,68,0.45) !important; border-color: rgba(239,68,68,0.85) !important; color: #fff !important; }
                .status-option-btn:not(.is-active):hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(255,255,255,0.28) !important; transform: translateY(-1px); }
                .status-option-btn.is-active:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 8px 20px color-mix(in oklab, var(--primary) 35%, transparent); }
                .btn-modal-cancel:hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(255,255,255,0.2) !important; color: var(--text) !important; }
                .btn-modal-submit:not(:disabled):hover { background: rgba(99,102,241,0.92) !important; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.5); }
                .btn-modal-submit:not(:disabled):active { transform: translateY(0) scale(0.98); }
                .animate-in { animation: slideIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
                @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                select option { background: #1e293b; color: #f1f5f9; }
            `}</style>
        </div>
    );
};
