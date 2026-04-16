import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Clock, AlertCircle, User as UserIcon, Calendar, MessageSquare, Tag, ArrowUpDown, Hash, Plus, ArrowLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import { OperationalProposal, User } from '../types';
import { BackButton } from '../components/common/BackButton';
import { supabase } from '../lib/supabase';

interface ProposalsProps {
    onBack: () => void;
    user?: User;
}

type SortMode = 'date' | 'number';

const TODAY = new Date().toISOString().split('T')[0];

export const OperationalProposals: React.FC<ProposalsProps> = ({ onBack, user }) => {
    const PROPOSALS_CACHE_KEY = 'proposals_data_v1';
    const loadProposalCache = (): OperationalProposal[] => {
        try { const s = localStorage.getItem(PROPOSALS_CACHE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
    };

    const [proposals, setProposals] = useState<OperationalProposal[]>(() => loadProposalCache());
    const [loading, setLoading] = useState(() => loadProposalCache().length === 0);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [usersMaster, setUsersMaster] = useState<User[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('全て');
    const [activeStatus, setActiveStatus] = useState<string>('全て');
    const [selectedProposal, setSelectedProposal] = useState<OperationalProposal | null>(null);
    const [sortMode, setSortMode] = useState<SortMode>('date');

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
    });

    const masterCategories = ['Engineer（障害）', 'Engineer（施工）', '施工管理', '設置管理'];
    const categories = ['全て', ...masterCategories, 'その他'];

    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('proposals-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'operational_proposals' },
                (payload) => {
                    const newItem = payload.new as OperationalProposal;
                    setProposals(prev => prev.some(p => p.id === newItem.id) ? prev : [newItem, ...prev]);
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'operational_proposals' },
                (payload) => {
                    const updated = payload.new as OperationalProposal;
                    setProposals(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
                    setSelectedProposal(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'operational_proposals' },
                (payload) => {
                    const deletedId = (payload.old as { id: string }).id;
                    setProposals(prev => prev.filter(p => p.id !== deletedId));
                    setSelectedProposal(prev => prev?.id === deletedId ? null : prev);
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setFetchError(null);

        const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
            Promise.race([
                promise,
                new Promise<T>((_, reject) =>
                    setTimeout(() => reject(new Error('TIMEOUT')), ms)
                )
            ]);

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        // 最大3回リトライ（5秒 → 8秒 → 12秒）キャッシュがあれば短めで十分
        const hasCache = proposals.length > 0;
        const retryDelays = hasCache ? [5000, 8000, 12000] : [10000, 15000, 20000];
        let lastError: any = null;

        for (let attempt = 0; attempt < retryDelays.length; attempt++) {
            try {
                const data = await withTimeout(apiClient.fetchProposals(), retryDelays[attempt]);
                const result = data || [];
                setProposals(result);
                localStorage.setItem(PROPOSALS_CACHE_KEY, JSON.stringify(result));
                setFetchError(null);
                // masters は別途取得（失敗しても致命的でない）
                apiClient.fetchMasters().then(m => setUsersMaster(m?.users || [])).catch(() => {});
                setLoading(false);
                return;
            } catch (e: any) {
                lastError = e;
                console.warn(`[OperationalProposals] attempt ${attempt + 1} failed:`, e?.message);
                if (attempt < retryDelays.length - 1) {
                    await sleep(1500);
                }
            }
        }

        // 全リトライ失敗
        console.error("[OperationalProposals] All retries failed:", lastError);
        if (proposals.length === 0) {
            // キャッシュなし → エラー表示
            setFetchError('接続に失敗しました。Supabaseが起動中の可能性があります。再試行ボタンを押してください。');
        }
        // キャッシュあり → エラー非表示のままキャッシュデータを表示
        setLoading(false);
    };

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        try {
            await apiClient.updateProposalStatus(id, newStatus);
            setProposals(prev => prev.map(p => p.id === id ? { ...p, status: newStatus as any } : p));
            if (selectedProposal?.id === id) {
                setSelectedProposal(prev => prev ? { ...prev, status: newStatus as any } : null);
            }
        } catch (e) { console.error("Failed to update status:", e); }
    };

    const handleCreate = async () => {
        if (!form.title.trim()) return;
        setCreating(true);
        try {
            await apiClient.createProposal({
                title: form.title.trim(),
                problem: form.problem.trim(),
                proposal: form.proposal.trim(),
                author: form.author.trim() || null,
                proposed_at: form.proposed_at || null,
                priority: form.priority,
                status: form.status,
                category: form.category,
            });
            await fetchData();
            setShowCreateModal(false);
            setForm({ category: 'Engineer（施工）', title: '', problem: '', proposal: '', author: user?.name ?? '', proposed_at: TODAY, priority: '中', status: '未着手' });
        } catch (e) {
            console.error("Failed to create proposal:", e);
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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case '完了': return <CheckCircle size={16} />;
            case '対応中': return <Clock size={16} />;
            default: return <AlertCircle size={16} />;
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case '高': return '#f87171';
            case '中': return '#fbbf24';
            default: return '#60a5fa';
        }
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
        const targetUser = name ? usersMaster.find(u => u.name === name || u.name.includes(name) || name.includes(u.name)) : undefined;
        const displayName = targetUser?.name || name || '—';

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {targetUser?.avatarUrl ? (
                    <img src={targetUser.avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                ) : (
                    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#fff', fontWeight: 700 }}>
                        {displayName.charAt(0)}
                    </div>
                )}
                <span style={{ fontSize: '0.85rem' }}>{displayName}</span>
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

                <div style={{ flex: 1, display: 'flex', gap: '10px', flexWrap: 'nowrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {user?.role !== 'viewer' && (
                        <button
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
                            }}
                        >
                            <Plus size={15} /> 新規追加
                        </button>
                    )}

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.12)', marginRight: '4px', flexShrink: 0 }} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', justifyContent: 'center' }}>
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
                                <button key={cat} className="badge-tab"
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
                                <button key={s} className="badge-tab"
                                    style={{
                                        fontSize: '0.72rem', padding: '4px 12px',
                                        ...(c ? {
                                            color: isActive ? c.color : 'rgba(255,255,255,0.5)',
                                            borderColor: isActive ? c.color : 'rgba(255,255,255,0.1)',
                                            background: isActive ? c.bg : 'rgba(255,255,255,0.05)',
                                            boxShadow: isActive ? `0 4px 15px ${c.glow}` : 'none',
                                            fontWeight: isActive ? 700 : 400,
                                        } : {
                                            color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                                            background: isActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.05)',
                                            borderColor: isActive ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.1)',
                                            boxShadow: isActive ? '0 4px 15px rgba(99,102,241,0.35)' : 'none',
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

            {/* List */}
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
                        <button onClick={fetchData} style={{
                            padding: '8px 18px', borderRadius: '10px', flexShrink: 0,
                            background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.6)',
                            color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
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
                                        display: 'flex', alignItems: 'center', gap: '24px',
                                        border: '1px solid var(--glass-border)', background: 'var(--glass-bg)',
                                        borderRadius: '16px', transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                                        backdropFilter: 'blur(10px)',
                                    }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                                            background: catStyle.bg, color: catStyle.color, border: `1px solid ${catStyle.border}`, whiteSpace: 'nowrap',
                                            boxShadow: `0 0 12px ${catStyle.border}`,
                                        }}>
                                            <Tag size={12} />{getNormalizedCategory(proposal.category)}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '4px' }}>
                                            No.{proposal.source_no || '—'}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '4px 12px', borderRadius: '20px',
                                                fontSize: '0.75rem', fontWeight: 800,
                                                background: proposal.status === '完了' ? 'rgba(16,185,129,0.15)' : proposal.status === '対応中' ? 'rgba(245,158,11,0.15)' : proposal.status === '保留' ? 'rgba(148,163,184,0.15)' : 'rgba(239,68,68,0.15)',
                                                color: proposal.status === '完了' ? '#34d399' : proposal.status === '対応中' ? '#fbbf24' : proposal.status === '保留' ? '#94a3b8' : '#f87171',
                                                border: '1px solid currentColor',
                                                boxShadow: proposal.status === '完了' ? '0 0 12px rgba(52,211,153,0.4)' : proposal.status === '対応中' ? '0 0 12px rgba(251,191,36,0.4)' : proposal.status === '保留' ? '0 0 12px rgba(148,163,184,0.3)' : '0 0 12px rgba(248,113,113,0.4)',
                                                whiteSpace: 'nowrap', flexShrink: 0
                                            }}>
                                                {getStatusIcon(proposal.status)}{proposal.status}
                                            </div>
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{proposal.title}</h3>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {proposal.description}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--text-dim)' }}>
                                        <UserIdentity name={proposal.author} size={18} />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                            <Calendar size={14} />
                                            {proposal.proposed_at ? new Date(proposal.proposed_at).toLocaleDateString() : '未設定'}
                                        </div>
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            background: getPriorityColor(proposal.priority),
                                            boxShadow: `0 0 8px ${getPriorityColor(proposal.priority)}77`,
                                        }} title={`優先度: ${proposal.priority}`} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
                            const proposalText = selectedProposal.proposal || (idx >= 0 ? desc.slice(idx + marker.length).trim() : '');

                            const blockStyle: React.CSSProperties = {
                                background: 'rgba(255,255,255,0.02)', padding: '24px 28px', borderRadius: '20px',
                                border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.8, fontSize: '1rem',
                                whiteSpace: 'pre-wrap', color: 'var(--text)',
                            };
                            const sectionLabel: React.CSSProperties = {
                                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
                                color: 'var(--text-dim)', marginBottom: '8px', display: 'block',
                            };

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                                    <div>
                                        <span style={sectionLabel}>問題点</span>
                                        <div style={blockStyle}>{problemText || <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>未入力</span>}</div>
                                    </div>
                                    <div>
                                        <span style={{ ...sectionLabel, color: '#f97316' }}>改善提案</span>
                                        <div style={{ ...blockStyle, border: '1px solid rgba(249,115,22,0.2)', background: 'rgba(249,115,22,0.04)' }}>
                                            {proposalText || <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>未入力</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', gap: '40px', marginBottom: '48px', color: 'var(--text-dim)' }}>
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
                        </div>

                        {user?.role !== 'viewer' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>ステータスを更新</span>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    {(['未着手', '対応中', '完了', '保留'] as const).map(s => (
                                        <button key={s} onClick={() => handleStatusUpdate(selectedProposal.id, s)}
                                            style={{
                                                flex: 1, padding: '14px', borderRadius: '16px',
                                                background: selectedProposal.status === s ? 'var(--blue)' : 'rgba(255,255,255,0.05)',
                                                border: '1px solid ' + (selectedProposal.status === s ? 'transparent' : 'rgba(255,255,255,0.1)'),
                                                color: '#fff', fontWeight: selectedProposal.status === s ? 700 : 400,
                                                cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                                            }}>{s}</button>
                                    ))}
                                </div>
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
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{
                                flex: 1, padding: '14px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.95rem',
                            }}>キャンセル</button>
                            <button onClick={handleCreate} disabled={!form.title.trim() || creating} style={{
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
                .badge-tab:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #fff; transform: translateY(-1px); }
                .badge-tab.active { background: rgba(99,102,241,0.5); color: #fff; border-color: rgba(99,102,241,0.8); font-weight: 700; box-shadow: 0 4px 15px rgba(99,102,241,0.3); }
                .proposal-card:hover { transform: translateX(8px); border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.08); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
                .animate-in { animation: slideIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
                @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                select option { background: #1e293b; color: #f1f5f9; }
            `}</style>
        </div>
    );
};
