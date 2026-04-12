import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle, AlertCircle, X } from 'lucide-react';
import { ChatMessage, KnowledgeItem } from '../types';

interface AIChatPopoverProps {
    chatMessages: ChatMessage[];
    isChatSearching: boolean;
    onChatSend: (text: string) => void;
    onChatResultClick: (item: KnowledgeItem) => void;
}

export const AIChatPopover: React.FC<AIChatPopoverProps> = ({
    chatMessages,
    isChatSearching,
    onChatSend,
    onChatResultClick
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

    return (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="primary-btn"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '56px', height: '56px', borderRadius: '50%',
                    padding: 0,
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isOpen ? 'rotate(15deg) scale(0.95)' : 'rotate(0) scale(1)'
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
                                    background: msg.type === 'user' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(255,255,255,0.1)',
                                    backdropFilter: 'blur(8px)',
                                    color: 'white',
                                    padding: '10px 14px',
                                    borderRadius: msg.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    fontSize: '0.9rem',
                                    maxWidth: '90%',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: msg.type === 'user' ? '0 4px 10px rgba(59,130,246,0.3)' : '0 2px 5px rgba(0,0,0,0.2)'
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
                            </div>
                        ))}
                        {isChatSearching && (
                            <div className="glass-subtle" style={{ alignSelf: 'flex-start', display: 'flex', gap: '4px', padding: '10px', borderRadius: '16px' }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', animation: `bounce 1s infinite ${i*0.2}s` }} />
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
                                    if (e.key === 'Enter') handleChatSubmit();
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
