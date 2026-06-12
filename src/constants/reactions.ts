import { ThumbsUp, AlertTriangle, HeartHandshake, Lightbulb, PartyPopper } from 'lucide-react';
import { KnowledgeItem, ReactionType } from '../types';

// リアクションの表示メタ。一覧ピル / Editor / 通知 / トースト / フィードで共用する単一ソース。
// rgb は "R, G, B" 形式 (rgba(...) 合成用)。noteText は通知文 ("◯◯さんが〜")。
export const REACTION_META: Record<ReactionType, {
    label: string;
    Icon: typeof ThumbsUp;
    rgb: string;
    noteText: string;
}> = {
    like:    { label: 'いいね！',  Icon: ThumbsUp,       rgb: '99, 102, 241',  noteText: 'いいね！しました' },
    helpful: { label: '助かった',  Icon: HeartHandshake, rgb: '52, 211, 153',  noteText: '「助かった！」と反応しました' },
    insight: { label: 'なるほど',  Icon: Lightbulb,      rgb: '251, 191, 36',  noteText: '「なるほど」と反応しました' },
    awesome: { label: 'すごい',    Icon: PartyPopper,    rgb: '236, 72, 153',  noteText: '「すごい！」と反応しました' },
    wrong:   { label: '違うよ！',  Icon: AlertTriangle,  rgb: '239, 68, 68',   noteText: '違うよ！と指摘しました' },
};

// 表示順 (ポジティブ系 → 指摘系)
export const REACTION_TYPES: ReactionType[] = ['like', 'helpful', 'insight', 'awesome', 'wrong'];

// reactionCounts が無い旧キャッシュ行向けのフォールバック (likeCount/wrongCount から復元)
export function reactionCountsOf(item: KnowledgeItem): Partial<Record<ReactionType, number>> {
    return item.reactionCounts ?? { like: item.likeCount ?? 0, wrong: item.wrongCount ?? 0 };
}

export function reactionUsersOf(item: KnowledgeItem): Partial<Record<ReactionType, string[]>> {
    return item.reactionUsers ?? { like: item.likeUsers ?? [], wrong: item.wrongUsers ?? [] };
}

export function totalReactions(counts: Partial<Record<ReactionType, number>>): number {
    return REACTION_TYPES.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
}

// 排他トグル (1人1種) の楽観的更新。Knowledge 一覧と Editor の双方から使う。
// 旧フィールド (likeCount 等、Evaluation が参照) も同期して返す。
export function applyReactionToggle(item: KnowledgeItem, type: ReactionType, userId: string): KnowledgeItem {
    const counts = { ...reactionCountsOf(item) };
    const srcUsers = reactionUsersOf(item);
    const users: Partial<Record<ReactionType, string[]>> = {};
    for (const t of REACTION_TYPES) users[t] = [...(srcUsers[t] ?? [])];

    const removeFrom = (t: ReactionType) => {
        counts[t] = Math.max(0, (counts[t] ?? 0) - 1);
        users[t] = (users[t] ?? []).filter(u => u !== userId);
    };
    const addTo = (t: ReactionType) => {
        counts[t] = (counts[t] ?? 0) + 1;
        users[t] = [...(users[t] ?? []), userId];
    };

    const next = { ...item };
    if (item.myReaction === type) {
        removeFrom(type);
        next.myReaction = null;
    } else {
        if (item.myReaction) removeFrom(item.myReaction);
        addTo(type);
        next.myReaction = type;
    }
    next.reactionCounts = counts;
    next.reactionUsers = users;
    next.likeCount = counts.like ?? 0;
    next.wrongCount = counts.wrong ?? 0;
    next.likeUsers = users.like ?? [];
    next.wrongUsers = users.wrong ?? [];
    return next;
}
