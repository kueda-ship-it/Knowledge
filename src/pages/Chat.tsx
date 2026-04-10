import React, { useState, useRef, useEffect } from 'react';
import { KnowledgeItem } from '../types';
import { ArrowLeft, Send, CheckCircle, AlertCircle, Search, MessageSquare } from 'lucide-react';

interface ChatProps {
    data: KnowledgeItem[];
    onBack: () => void;
    onItemClick?: (item: KnowledgeItem) => void;
}

interface Message {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    results?: KnowledgeItem[];
    noResults?: boolean;
}

function searchKnowledge(query: string, data: KnowledgeItem[]): KnowledgeItem[] {
    const keywords = query
        .toLowerCase()
        .split(/[\s　、。・]+/)
        .filter(k => k.length >= 1);

    if (keywords.length === 0) return [];

    const scored = data.map(item => {
        let score = 0;
        const fields = [
            { text: item.title || '', weight: 4 },
            { text: item.machine || '', weight: 3 },
            { text: (item.incidents || []).join(' '), weight: 3 },
            { text: (item.tags || []).join(' '), weight: 2 },
            { text: item.category || '', weight: 2 },
            { text: item.content || '', weight: 1 },
        ];
        keywords.forEach(kw => {
            fields.forEach(({ text, weight }) => {
                if (text.toLowerCase().includes(kw)) score += weight;
            });
        });
        return { item, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.item);
}

export const Chat: React.FC<ChatProps> = ({ data, onBack, onItemClick }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'init',
            type: 'assistant',
            text: `ナレッジベースに ${data.length} 件のデータが読み込まれています。キーワードや症状を入力してください。`,
        },
    ]);
    const [input, setInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        const query = input.trim();
        if (!query || isSearching) return;

        const userMsg: Message = {
            id: `u-${Date.now()}`,
            type: 'user',
            text: query,
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsSearching(true);

        setTimeout(() => {
            const results = searchKnowledge(query, data);
            const assistantMsg: Message = {
                id: `a-${Date.now()}`,
                type: 'assistant',
                text: results.length > 0
                    ? `「${query}」に関連するナレッジが ${results.length} 件見つかりました。`
                    : `「${query}」に一致するナレッジは見つかりませんでした。別のキーワードで試してみてください。`,
                results: results.length > 0 ? results : undefined,
                noResults: results.length === 0,
            };
            setMessages(prev => [...prev, assistantMsg]);
            setIsSearching(false);
        }, 400);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 60px)',
            background: 'var(--bg)',
            position: 'relative',
        }}>
            {/* Subtle dot-grid background */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
                backgroundImage: 'radial-gradient(circle, var(--text) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
            }} />

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--header-bg)',
                zIndex: 1,
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--muted)', padding: '4px', borderRadius: '4px',
                        display: 'flex', alignItems: 'center',
                        transition: 'color 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
                    onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
                >
                    <ArrowLeft size={20} />
                </button>
                <MessageSquare size={18} color="#3b82f6" />
                <span style={{ fontWeight: '600', color: 'var(--text)', fontSize: '0.95rem' }}>
                    ナレッジ検索チャット
                </span>
                <span style={{
                    marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)',
                    background: 'var(--border)', padding: '2px 8px', borderRadius: '12px',
                }}>
                    {data.length} 件
                </span>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        display: 'flex',
                        justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                        animation: 'fadeSlideIn 0.25s ease',
                    }}>
                        {msg.type === 'user' ? (
                            <div style={{
                                background: '#3b82f6', color: 'white',
                                padding: '10px 16px', borderRadius: '18px 18px 4px 18px',
                                maxWidth: '60%', fontSize: '0.9rem', lineHeight: '1.5',
                                boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                            }}>
                                {msg.text}
                            </div>
                        ) : (
                            <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Assistant text bubble */}
                                <div style={{
                                    background: 'var(--card-bg)', color: 'var(--text)',
                                    padding: '10px 16px', borderRadius: '18px 18px 18px 4px',
                                    fontSize: '0.9rem', lineHeight: '1.5',
                                    border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                    {msg.noResults
                                        ? <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                        : <Search size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                                    }
                                    {msg.text}
                                </div>

                                {/* Result cards */}
                                {msg.results?.map((item, i) => (
                                    <div
                                        key={item.id}
                                        onClick={() => onItemClick?.(item)}
                                        style={{
                                            background: 'var(--card-bg)',
                                            border: '1px solid var(--border)',
                                            borderLeft: `3px solid ${item.status === 'solved' ? '#10b981' : '#ef4444'}`,
                                            borderRadius: '8px',
                                            padding: '12px 14px',
                                            cursor: onItemClick ? 'pointer' : 'default',
                                            transition: 'all 0.15s',
                                            animationDelay: `${i * 60}ms`,
                                            animation: 'fadeSlideIn 0.25s ease both',
                                        }}
                                        onMouseOver={e => {
                                            if (onItemClick) {
                                                (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6';
                                                (e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)';
                                            }
                                        }}
                                        onMouseOut={e => {
                                            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                                            (e.currentTarget as HTMLDivElement).style.transform = 'none';
                                            (e.currentTarget as HTMLDivElement).style.borderLeftColor = item.status === 'solved' ? '#10b981' : '#ef4444';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            {item.status === 'solved'
                                                ? <CheckCircle size={13} color="#10b981" />
                                                : <AlertCircle size={13} color="#ef4444" />
                                            }
                                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)' }}>
                                                {item.title}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            {item.machine && <span>🔧 {item.machine}</span>}
                                            {item.category && <span>📁 {item.category}</span>}
                                            {item.incidents?.length > 0 && <span>⚡ {item.incidents[0]}{item.incidents.length > 1 ? ` +${item.incidents.length - 1}` : ''}</span>}
                                        </div>
                                        {item.content && (
                                            <div style={{
                                                marginTop: '6px', fontSize: '0.8rem', color: 'var(--muted)',
                                                overflow: 'hidden', display: '-webkit-box',
                                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                            }}>
                                                {item.content}
                                            </div>
                                        )}
                                        {item.tags?.length > 0 && (
                                            <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {item.tags.slice(0, 4).map((tag, ti) => (
                                                    <span key={ti} style={{
                                                        fontSize: '0.7rem', color: '#3b82f6',
                                                        background: 'rgba(59,130,246,0.1)',
                                                        padding: '1px 6px', borderRadius: '10px',
                                                    }}>#{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* Searching indicator */}
                {isSearching && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            padding: '10px 16px', borderRadius: '18px 18px 18px 4px',
                            display: 'flex', gap: '5px', alignItems: 'center',
                        }}>
                            {[0, 1, 2].map(i => (
                                <span key={i} style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: '#3b82f6', display: 'inline-block',
                                    animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--header-bg)',
                zIndex: 1,
            }}>
                <div style={{
                    display: 'flex', gap: '8px', alignItems: 'center',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: '12px',
                    padding: '4px 4px 4px 14px',
                    transition: 'border-color 0.2s',
                }}
                    onFocusCapture={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                    onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--input-border)')}
                >
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="キーワードや症状を入力… (Enter で送信)"
                        style={{
                            flex: 1, background: 'none', border: 'none', outline: 'none',
                            color: 'var(--text)', fontSize: '0.9rem', padding: '6px 0',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isSearching}
                        style={{
                            background: input.trim() && !isSearching ? '#3b82f6' : 'var(--border)',
                            border: 'none', borderRadius: '8px',
                            width: '36px', height: '36px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: input.trim() && !isSearching ? 'pointer' : 'default',
                            transition: 'background 0.2s, transform 0.1s',
                            flexShrink: 0,
                        }}
                        onMouseOver={e => { if (input.trim()) (e.currentTarget as HTMLButtonElement).style.background = '#2563eb'; }}
                        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = input.trim() && !isSearching ? '#3b82f6' : 'var(--border)'; }}
                    >
                        <Send size={15} color={input.trim() && !isSearching ? 'white' : 'var(--muted)'} />
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes bounce {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                    40%           { transform: scale(1);   opacity: 1; }
                }
            `}</style>
        </div>
    );
};
