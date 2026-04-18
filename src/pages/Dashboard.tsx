import React, { useState, useMemo } from 'react';
import { KnowledgeItem } from '../types';
import { Server, AlertTriangle, Hash, Combine, BarChart3, PieChart as PieChartIcon, LayoutGrid, XCircle } from 'lucide-react';
import { BackButton } from '../components/common/BackButton';

interface DashboardProps {
    data: KnowledgeItem[];
    onBack: () => void;
}

type TimeRange = 'all' | 'year' | 'month' | 'week' | 'day';
type ChartType = 'bar' | 'pie';

export const Dashboard: React.FC<DashboardProps> = ({ data, onBack }) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('all');
    const [chartType, setChartType] = useState<ChartType>('bar');

    // Selection Filters (Cross-filtering)
    const [selMachine, setSelMachine] = useState<string | null>(null);
    const [selIncident, setSelIncident] = useState<string | null>(null);
    const [selTag, setSelTag] = useState<string | null>(null);
    const [selCategory, setSelCategory] = useState<string | null>(null);

    const filteredData = useMemo(() => {
        const now = new Date();
        return data.filter(item => {
            // Time filter
            if (timeRange !== 'all') {
                const updatedDate = new Date(item.updatedAt);
                const diffMs = now.getTime() - updatedDate.getTime();
                if (timeRange === 'day' && diffMs > 24 * 60 * 60 * 1000) return false;
                if (timeRange === 'week' && diffMs > 7 * 24 * 60 * 60 * 1000) return false;
                if (timeRange === 'month' && diffMs > 30 * 24 * 60 * 60 * 1000) return false;
                if (timeRange === 'year' && diffMs > 365 * 24 * 60 * 60 * 1000) return false;
            }

            // Cross-filers
            if (selMachine && item.machine !== selMachine) return false;
            if (selIncident && (!item.incidents || !item.incidents.includes(selIncident))) return false;
            if (selTag && (!item.tags || !item.tags.includes(selTag))) return false;
            if (selCategory && item.category !== selCategory) return false;

            return true;
        });
    }, [data, timeRange, selMachine, selIncident, selTag, selCategory]);

    const stats = useMemo(() => {
        const machineCounts: Record<string, number> = {};
        const incidentCounts: Record<string, number> = {};
        const tagCounts: Record<string, number> = {};
        const categoryCounts: Record<string, number> = {};
        const combinationCounts: Record<string, number> = {};

        filteredData.forEach(item => {
            if (item.machine) machineCounts[item.machine] = (machineCounts[item.machine] || 0) + 1;
            if (item.category) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;

            if (item.incidents) {
                item.incidents.forEach(inc => {
                    incidentCounts[inc] = (incidentCounts[inc] || 0) + 1;
                    if (item.tags) {
                        item.tags.forEach(tag => {
                            const combo = `${inc} + ${tag}`;
                            combinationCounts[combo] = (combinationCounts[combo] || 0) + 1;
                        });
                    }
                });
            }
            if (item.tags) {
                item.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });
        return { machineCounts, incidentCounts, tagCounts, categoryCounts, combinationCounts };
    }, [filteredData]);

    const colors = [
        '#3b82f6', // Blue
        '#ef4444', // Red
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#8b5cf6', // Purple
        '#ec4899', // Pink
        '#06b6d4', // Teal
        '#f97316', // Orange
        '#6366f1', // Indigo
        '#84cc16', // Lime
        '#22d3ee', // Cyan
        '#f43f5e'  // Rose
    ];

    const renderPieChart = (counts: Record<string, number>, onSelect?: (key: string) => void) => {
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const total = sorted.reduce((sum, [_, val]) => sum + val, 0);
        if (total === 0) return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>データなし</div>;

        let accumulatedAngle = -90; // Start from top

        const slices = sorted.map(([key, val], i) => {
            const angle = (val / total) * 360;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + angle;
            accumulatedAngle = endAngle;

            // Coordinates for SVG path
            const x1 = 100 + 80 * Math.cos((Math.PI * startAngle) / 180);
            const y1 = 100 + 80 * Math.sin((Math.PI * startAngle) / 180);
            const x2 = 100 + 80 * Math.cos((Math.PI * endAngle) / 180);
            const y2 = 100 + 80 * Math.sin((Math.PI * endAngle) / 180);
            const largeArcFlag = angle > 180 ? 1 : 0;

            const pathData = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

            return { key, val, pathData, color: colors[i % colors.length] };
        });

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', transform: 'rotate(0deg)' }}>
                        {slices.map((s) => (
                            <path
                                key={s.key}
                                d={s.pathData}
                                fill={s.color}
                                className="chart-slice"
                                onClick={() => onSelect?.(s.key)}
                                style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'all 0.3s' }}
                            >
                                <title>{`${s.key}: ${s.val}件 (${Math.round((s.val / total) * 100)}%)`}</title>
                            </path>
                        ))}
                        {/* Donut hole */}
                        <circle cx="100" cy="100" r="50" fill="var(--bg)" />
                    </svg>
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        textAlign: 'center', pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 'bold' }}>合計</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{total}</div>
                    </div>
                </div>

                <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {slices.map((s) => (
                        <div key={s.key}
                            onClick={() => onSelect?.(s.key)}
                            title={`${s.key}: ${s.val}件`}
                            className={onSelect ? 'chart-legend-item cursor-hint-tile' : 'chart-legend-item'}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: onSelect ? 'pointer' : 'default', padding: '4px', borderRadius: '4px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color }}></div>
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.key}</span>
                            <span style={{ fontWeight: 'bold', minWidth: '35px', textAlign: 'right' }}>{Math.round((s.val / total) * 100)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderBarList = (counts: Record<string, number>, color: string, onSelect?: (key: string) => void) => {
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const max = sorted.length > 0 ? sorted[0][1] : 1;
        if (sorted.length === 0) return <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>データなし</div>;

        return sorted.slice(0, 10).map(([key, val]) => (
            <div key={key}
                className={onSelect ? 'cursor-hint-tile' : undefined}
                style={{ marginBottom: '12px', padding: '4px 6px', cursor: onSelect ? 'pointer' : 'default' }}
                onClick={() => onSelect?.(key)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text)' }}>{key}</span>
                    <span style={{ color: 'var(--muted)' }}>{val}件</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${(val / max) * 100}%`, height: '100%', background: color,
                        borderRadius: '4px', transition: 'width 0.5s ease'
                    }}></div>
                </div>
            </div>
        ));
    };

    const activeFilters = [
        { label: '号機', value: selMachine, clear: () => setSelMachine(null) },
        { label: '内容', value: selIncident, clear: () => setSelIncident(null) },
        { label: 'タグ', value: selTag, clear: () => setSelTag(null) },
        { label: 'カテゴリ', value: selCategory, clear: () => setSelCategory(null) },
    ].filter(f => f.value);

    return (
        <div className="view active" style={{ overflowY: 'auto', flex: 1 }}>
            <div className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <BackButton onClick={onBack} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text)' }}>集計ダッシュボード</h2>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: 'var(--border)', padding: '4px', borderRadius: '8px' }}>
                            {(['all', 'year', 'month', 'week', 'day'] as TimeRange[]).map((r) => (
                                <button key={r} onClick={() => setTimeRange(r)}
                                    className={`cursor-hint-pill${timeRange === r ? ' is-active' : ''}`}
                                    style={{
                                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                        fontSize: '0.85rem', fontWeight: '500',
                                        background: timeRange === r ? 'var(--card-bg)' : 'transparent',
                                        color: timeRange === r ? 'var(--primary)' : 'var(--muted)',
                                        boxShadow: timeRange === r ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    }}
                                >
                                    {r === 'all' ? '全て' : r === 'year' ? '年間' : r === 'month' ? '月間' : r === 'week' ? '週間' : '本日'}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => setChartType('bar')} className="secondary-btn" style={{
                                padding: '8px', background: chartType === 'bar' ? 'var(--primary)' : 'var(--card-bg)', color: chartType === 'bar' ? 'white' : 'var(--muted)'
                            }}>
                                <BarChart3 size={18} />
                            </button>
                            <button onClick={() => setChartType('pie')} className="secondary-btn" style={{
                                padding: '8px', background: chartType === 'pie' ? 'var(--primary)' : 'var(--card-bg)', color: chartType === 'pie' ? 'white' : 'var(--muted)'
                            }}>
                                <PieChartIcon size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {activeFilters.length > 0 && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', padding: '10px', background: 'var(--bg)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 'bold' }}>絞り込み中:</span>
                        {activeFilters.map(f => (
                            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: 'var(--primary)', color: 'white', borderRadius: '20px', fontSize: '0.8rem' }}>
                                <span>{f.label}: {f.value}</span>
                                <XCircle size={14} style={{ cursor: 'pointer' }} onClick={f.clear} />
                            </div>
                        ))}
                        <button onClick={() => { setSelMachine(null); setSelIncident(null); setSelTag(null); setSelCategory(null); }}
                            className="cursor-hint"
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                            全てクリア
                        </button>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                            <LayoutGrid size={20} color="#f59e0b" /> カテゴリ別
                        </h3>
                        {chartType === 'bar' ? renderBarList(stats.categoryCounts, '#f59e0b', setSelCategory) : renderPieChart(stats.categoryCounts, setSelCategory)}
                    </div>

                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                            <Server size={20} color="#3b82f6" /> 号機別
                        </h3>
                        {chartType === 'bar' ? renderBarList(stats.machineCounts, '#3b82f6', setSelMachine) : renderPieChart(stats.machineCounts, setSelMachine)}
                    </div>

                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                            <AlertTriangle size={20} color="#ef4444" /> 内容別
                        </h3>
                        {chartType === 'bar' ? renderBarList(stats.incidentCounts, '#ef4444', setSelIncident) : renderPieChart(stats.incidentCounts, setSelIncident)}
                    </div>

                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                            <Hash size={20} color="#8b5cf6" /> タグ別
                        </h3>
                        {chartType === 'bar' ? renderBarList(stats.tagCounts, '#8b5cf6', setSelTag) : renderPieChart(stats.tagCounts, setSelTag)}
                    </div>

                    <div className="dash-panel" style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                            <Combine size={20} color="#10b981" /> 組み合わせ詳細 (内容 × タグ)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: chartType === 'bar' ? '1fr 1fr' : '1fr', gap: '30px' }}>
                            {chartType === 'bar' ? renderBarList(stats.combinationCounts, '#10b981') : renderPieChart(stats.combinationCounts)}
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .dash-panel div:hover {
                    opacity: 0.95;
                }
                .chart-legend-item:hover {
                    background-color: var(--border);
                    transform: translateX(2px);
                }
                .chart-slice:hover {
                    opacity: 0.8;
                    transform: scale(1.02);
                    transform-origin: center;
                }
            `}</style>
        </div>
    );
};

