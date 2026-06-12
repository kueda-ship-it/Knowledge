import { Edit3, MessageSquare, Eye } from 'lucide-react';
import { AppNotification, ReactionType } from '../types';
import { REACTION_META } from './reactions';

// 通知 type → 表示メタ (Header 通知パネルとトーストで共用)。
// text は sender_name に続く述部。viewed_milestone のみ sender_name に
// "延べ10人" 等の表示用文字列が入る前提で文全体を変える。
export function describeNotification(note: AppNotification): {
    Icon: typeof Edit3;
    color: string;
    text: string;
} {
    if (note.type === 'edited') {
        return { Icon: Edit3, color: '#10b981', text: `${note.sender_name} が ナレッジを編集しました` };
    }
    if (note.type === 'comment') {
        return { Icon: MessageSquare, color: '#38bdf8', text: `${note.sender_name} が コメントしました` };
    }
    if (note.type === 'viewed_milestone') {
        // sender_name には "延べ10回" 等の表示用文字列が入る
        return { Icon: Eye, color: '#a78bfa', text: `あなたのナレッジが ${note.sender_name} 読まれました` };
    }
    const meta = REACTION_META[note.type as ReactionType] ?? REACTION_META.like;
    return { Icon: meta.Icon, color: `rgb(${meta.rgb})`, text: `${note.sender_name} が ${meta.noteText}` };
}
