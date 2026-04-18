import React, { useState, useMemo } from 'react';
import { KnowledgeItem, Attachment } from '../types';
import { Paperclip, FileText, Image, ExternalLink, Search } from 'lucide-react';
import { BackButton } from '../components/common/BackButton';

interface FileListProps {
    data: KnowledgeItem[];
    onBack: () => void;
}

interface FileEntry {
    attachment: Attachment;
    knowledge: KnowledgeItem;
}

export const FileList: React.FC<FileListProps> = ({ data, onBack }) => {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'other'>('all');

    const allFiles: FileEntry[] = useMemo(() => {
        const entries: FileEntry[] = [];
        for (const item of data) {
            for (const att of item.attachments ?? []) {
                entries.push({ attachment: att, knowledge: item });
            }
        }
        return entries.sort((a, b) => b.attachment.name.localeCompare(a.attachment.name));
    }, [data]);

    const filtered = useMemo(() => {
        return allFiles.filter(({ attachment, knowledge }) => {
            const matchSearch = !search ||
                attachment.name.toLowerCase().includes(search.toLowerCase()) ||
                knowledge.title.toLowerCase().includes(search.toLowerCase());
            const matchType = typeFilter === 'all' ||
                (typeFilter === 'image' && attachment.type.startsWith('image/')) ||
                (typeFilter === 'other' && !attachment.type.startsWith('image/'));
            return matchSearch && matchType;
        });
    }, [allFiles, search, typeFilter]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <BackButton onClick={onBack} />
                <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Paperclip size={20} /> 添付ファイル一覧
                </h2>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>({allFiles.length}件)</span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="ファイル名・ナレッジ名で検索"
                        style={{ width: '100%', padding: '8px 8px 8px 28px', border: '1px solid var(--input-border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'image', 'other'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            style={{
                                padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border)', cursor: 'pointer',
                                fontSize: '0.85rem',
                                background: typeFilter === t ? 'var(--primary)' : 'var(--card-bg)',
                                color: typeFilter === t ? 'white' : 'var(--muted)',
                                borderColor: typeFilter === t ? 'var(--primary)' : 'var(--border)',
                            }}
                        >
                            {t === 'all' ? '全て' : t === 'image' ? '画像' : 'その他'}
                        </button>
                    ))}
                </div>
            </div>

            {/* File list */}
            {filtered.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '40px' }}>
                    {allFiles.length === 0 ? '添付ファイルはありません' : '条件に一致するファイルがありません'}
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(({ attachment, knowledge }) => (
                        <div
                            key={`${knowledge.id}-${attachment.id}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 14px', background: 'var(--card-bg)',
                                border: '1px solid var(--border)', borderRadius: '8px',
                            }}
                        >
                            {attachment.type.startsWith('image/')
                                ? <Image size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                                : <FileText size={18} color="#64748b" style={{ flexShrink: 0 }} />
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.95rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {attachment.name}
                                </a>
                                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                                    {knowledge.title} · {formatSize(attachment.size)}
                                </span>
                            </div>
                            <ExternalLink size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
