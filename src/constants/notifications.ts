import { Edit3, MessageSquare, Eye } from 'lucide-react';
import { AppNotification, ReactionType } from '../types';
import { REACTION_META } from './reactions';

// トーストの重さ。状態色トークン (--{tone} / --{tone}-soft / --{tone}-border) に対応する。
// 反応・閲覧=success、編集・コメント=info、「違うよ！」の指摘=warning (見直しが要る)。
export type NotificationTone = 'success' | 'info' | 'warning' | 'danger';

// 通知 type → 表示メタ (Header 通知パネルとトーストで共用)。
// text は sender_name に続く述部。viewed_milestone のみ sender_name に
// "延べ10人" 等の表示用文字列が入る前提で文全体を変える。
export function describeNotification(note: AppNotification): {
    Icon: typeof Edit3;
    color: string;
    tone: NotificationTone;
    text: string;
} {
    if (note.type === 'edited') {
        return { Icon: Edit3, color: '#10b981', tone: 'info', text: `${note.sender_name} が ナレッジを編集しました` };
    }
    if (note.type === 'comment') {
        return { Icon: MessageSquare, color: '#38bdf8', tone: 'info', text: `${note.sender_name} が コメントしました` };
    }
    if (note.type === 'viewed_milestone') {
        // sender_name には "延べ10回" 等の表示用文字列が入る
        return { Icon: Eye, color: '#a78bfa', tone: 'success', text: `あなたのナレッジが ${note.sender_name} 読まれました` };
    }
    const meta = REACTION_META[note.type as ReactionType] ?? REACTION_META.like;
    const tone: NotificationTone = note.type === 'wrong' ? 'warning' : 'success';
    return { Icon: meta.Icon, color: `rgb(${meta.rgb})`, tone, text: `${note.sender_name} が ${meta.noteText}` };
}
