import { KnowledgeItem } from '../types';

/**
 * ナレッジベースから関連するアイテムをスコアリングして抽出する
 */
export function searchKnowledge(query: string, data: KnowledgeItem[]): KnowledgeItem[] {
    const keywords = query
        .toLowerCase()
        .split(/[\s　、。・]+/)
        .filter(k => k.length >= 1);

    if (keywords.length === 0) return [];

    const scored = data.map(item => {
        let score = 0;
        const fields = [
            { text: item.title || '', weight: 10 },        // タイトルの重要度を上げた
            { text: item.machine || '', weight: 5 },
            { text: (item.incidents || []).join(' '), weight: 5 },
            { text: (item.tags || []).join(' '), weight: 3 },
            { text: item.category || '', weight: 3 },
            { text: item.content || '', weight: 2 },
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
