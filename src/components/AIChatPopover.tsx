import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle, AlertCircle, X, ClipboardList, Zap, Check, XCircle } from 'lucide-react';
import { ChatMessage, KnowledgeItem, ChatProposalRef } from '../types';

interface AIChatPopoverProps {
    chatMessages: ChatMessage[];
    isChatSearching: boolean;
    onChatSend: (text: string) => void;
    onChatResultClick: (item: KnowledgeItem) => void;
    onProposalClick?: (p: ChatProposalRef) => void;
    onActionConfirm?: (messageId: string) => void;
    onActionCancel?: (messageId: string) => void;
}

export const AIChatPopover: React.FC<AIChatPopoverProps> = ({
    chatMessages,
    isChatSearching,
    onChatSend,
    onChatResultClick,
    onProposalClick,
    onActionConfirm,
    onActionCancel,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const chatBottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isChatSearching, isOpen]);

    useEffect(() => {
        // If external messages change, but popover is closed, we could optionally show a dot indicator
        // Not required now, but good to have
    }, [chatMessages]);

    const handleChatSubmit = () => {
        if (!chatInput.trim() || isChatSearching) return;
        onChatSend(chatInput.trim());
        setChatInput('');
    };

    const handleConfirmAction = (msgId: string) => {
        // 親側に実行を委譲。すべて画面遷移を伴うのでポップオーバーは閉じる
        // (create_* はモーダルが開くので、ポップオーバーが手前に残ると邪魔)。
        onActionConfirm?.(msgId);
        setIsOpen(false);
    };

    const renderActionCard = (msg: ChatMessage) => {
        if (!msg.action) return null;
        const state = msg.actionState ?? 'pending';
        const isNavigate = msg.action.type === 'navigate';

        // アクション種別に応じた色・ラベル
        const meta = (() => {
            switch (msg.action!.type) {
                case 'create_proposal':
                    return { label: '運用提議を作成', color: '#a855f7', icon: <ClipboardList size={14} /> };
                case 'create_knowledge':
                    return { label: 'ナレッジを登録', color: '#10b981', icon: <CheckCircle size={14} /> };
                case 'navigate':
                    return { label: '画面を開く', color: 'var(--primary)', icon: <Zap size={14} /> };
            }
        })();

        const confirmText = msg.action.confirmText
            ?? (isNavigate ? '画面を開きますか？' : 'この内容で実行しますか？');

        // 状態別の表示
        if (state === 'cancelled') {
            return (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <XCircle size={12} /> キャンセルしました
                </div>
            );
        }
        if (state === 'done') {
            return (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={12} /> {isNavigate ? '画面を開きました' : '実行しました'}
                </div>
            );
        }
        if (state === 'failed') {
            return (
                <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={12} /> 失敗: {msg.actionError ?? '不明なエラー'}
                </div>
            );
        }

        // pending / confirmed (実行中)
        const busy = state === 'confirmed';

        // create 系のドラフト・サマリー
        const renderSummary = () => {
            if (msg.action!.type === 'create_proposal') {
                const d = msg.action!.draft;
                return (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                        <div><strong>件名:</strong> {d.title}</div>
                        {d.problem && <div><strong>問題点:</strong> {d.problem}</div>}
                        {d.proposal && <div><strong>提案:</strong> {d.proposal}</div>}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {d.category && <span>区分: {d.category}</span>}
                            {d.priority && <span>優先度: {d.priority}</span>}
                            {d.status && <span>状態: {d.status}</span>}
                        </div>
                    </div>
                );
            }
            if (msg.action!.type === 'create_knowledge') {
                const d = msg.action!.draft;
                return (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                        <div><strong>件名:</strong> {d.title}</div>
                        {d.machine && <div><strong>対象:</strong> {d.machine}</div>}
                        {d.phenomenon && <div><strong>事象:</strong> {d.phenomenon}</div>}
                        {d.countermeasure && <div><strong>対処:</strong> {d.countermeasure}</div>}
                    </div>
                );
            }
            // navigate
            const params = msg.action!.params;
            const parts: string[] = [`画面: ${msg.action!.view}`];
            if (params?.search) parts.push(`検索: ${params.search}`);
            if (params?.knowledgeFilter) parts.push(`絞込: ${params.knowledgeFilter}`);
            if (params?.proposalStatus) parts.push(`状態: ${params.proposalStatus}`);
            if (params?.proposalCategory) parts.push(`区分: ${params.proposalCategory}`);
            return <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{parts.join(' / ')}</div>;
        };

        return (
            <div
                className="glass-subtle"
                style={{
                    marginTop: '8px',
                    padding: '12px',
                    borderRadius: '12px',
                    borderLeft: `3px solid ${meta.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: meta.color, fontSize: '0.85rem' }}>
                    {meta.icon} {meta.label}
                </div>
                {renderSummary()}
                <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{confirmText}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleConfirmAction(msg.id)}
                        disabled={busy}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: meta.color,
                            color: 'white',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            opacity: busy ? 0.6 : 1,
                        }}
                    >
                        <Check size={14} /> {busy ? '実行中...' : (isNavigate ? '開く' : '実行')}
                    </button>
                    {!isNavigate && (
                        <button
                            onClick={() => onActionCancel?.(msg.id)}
                            disabled={busy}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                                background: 'transparent',
                                color: 'var(--text)',
                                fontSize: '0.85rem',
                                cursor: busy ? 'not-allowed' : 'pointer',
                            }}
                        >
                            キャンセル
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="primary-btn"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '56px', height: '56px', borderRadius: '50%',
                    padding: 0,
                    boxShadow: '0 4px 12px color-mix(in oklab, var(--primary) 45%, transparent)',
                    cursor: 'pointer',
                }}
                title={isOpen ? "閉じる" : "AIナレッジ検索を開く"}
            >
                {isOpen ? <X size={24} color="white" /> : <MessageSquare size={24} color="white" />}
            </button>

            {isOpen && (
                <div className="glass-elevated" style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 20px)',
                    right: 0,
                    width: '360px',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transformOrigin: 'bottom right',
                    animation: 'chatPop 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <div className="glass-primary" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px 16px 0 0' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MessageSquare size={20} /> AIナレッジアシスタント
                        </span>
                        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="chat-messages-container" style={{ 
                        height: '400px',
                        overflowY: 'auto', 
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        background: 'rgba(0,0,0,0.02)'
                    }}>
                        {chatMessages.length === 0 && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center', padding: '30px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                <MessageSquare size={32} opacity={0.5} />
                                なんでもご相談ください。症状やキーワードから過去のインシデントを探します。
                            </div>
                        )}
                        {chatMessages.map(msg => (
                            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{
                                    alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                                    background: msg.type === 'user' ? 'color-mix(in oklab, var(--primary) 82%, transparent)' : 'rgba(255,255,255,0.1)',
                                    backdropFilter: 'blur(8px)',
                                    color: 'white',
                                    padding: '10px 14px',
                                    borderRadius: msg.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    fontSize: '0.9rem',
                                    maxWidth: '90%',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: msg.type === 'user' ? '0 4px 10px color-mix(in oklab, var(--primary) 32%, transparent)' : '0 2px 5px rgba(0,0,0,0.2)'
                                }}>
                                    {msg.text}
                                </div>
                                
                                {msg.results && msg.results.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                                        {msg.results.map(item => (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    setIsOpen(false);
                                                    onChatResultClick(item);
                                                }}
                                                className="knowledge-card-mini glass-subtle"
                                                style={{
                                                    fontSize: '0.85rem',
                                                    padding: '10px 12px',
                                                    borderLeft: `4px solid ${item.status === 'solved' ? '#10b981' : '#ef4444'}`,
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text)' }}>
                                                    {item.status === 'solved' ? <CheckCircle size={14} color="#10b981" /> : <AlertCircle size={14} color="#ef4444" />}
                                                    <span className="truncate">{item.title}</span>
                                                </div>
                                                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{item.machine}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {msg.action && renderActionCard(msg)}

                                {msg.proposalResults && msg.proposalResults.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                                        {msg.proposalResults.map(p => {
                                            const statusColor =
                                                p.status === '完了' ? '#10b981'
                                                : p.status === '対応中' ? 'var(--primary)'
                                                : p.status === '保留' ? '#f59e0b'
                                                : '#9ca3af';
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setIsOpen(false);
                                                        onProposalClick?.(p);
                                                    }}
                                                    className="knowledge-card-mini glass-subtle"
                                                    style={{
                                                        fontSize: '0.85rem',
                                                        padding: '10px 12px',
                                                        borderLeft: `4px solid ${statusColor}`,
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text)' }}>
                                                        <ClipboardList size={14} color={statusColor} />
                                                        <span className="truncate">{p.title}</span>
                                                    </div>
                                                    <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                                                        {[p.category, p.status, p.priority && `優先度:${p.priority}`].filter(Boolean).join(' / ')}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isChatSearching && (
                            <div className="glass-subtle" style={{ alignSelf: 'flex-start', display: 'flex', gap: '4px', padding: '10px', borderRadius: '16px' }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', animation: `bounce 1s infinite ${i*0.2}s` }} />
                                ))}
                            </div>
                        )}
                        <div ref={chatBottomRef} />
                    </div>

                    <div className="glass-subtle" style={{ padding: '16px', borderTop: '1px solid var(--glass-border)', borderRadius: '0 0 16px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                                type="text"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => {
                                    // IME 変換中 (Enterで確定) は送信しない
                                    if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return;
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleChatSubmit();
                                    }
                                }}
                                placeholder="メッセージを入力..."
                                style={{
                                    flex: 1, padding: '12px 16px', borderRadius: '24px', 
                                    border: '1px solid var(--input-border)', fontSize: '0.9rem',
                                    background: 'var(--input-bg)', color: 'var(--text)',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                                }}
                            />
                            <button 
                                onClick={handleChatSubmit}
                                disabled={!chatInput.trim() || isChatSearching}
                                className="primary-btn"
                                style={{ 
                                    width: '44px', height: '44px', borderRadius: '50%', padding: '0', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: (!chatInput.trim() || isChatSearching) ? 0.6 : 1
                                }}
                            >
                                <Send size={18} style={{ marginLeft: '2px' }}/>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                .knowledge-card-mini:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                @keyframes bounce {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                }
            `}</style>
        </div>
    );
};
