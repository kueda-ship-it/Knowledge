import { KnowledgeItem } from '../types';

export interface TagStat {
    tag: string;     // 表示用 (元の表記、最頻のものを採用)
    count: number;
    key: string;     // 正規化キー (重複検出用)
}

// ひらがな → カタカナ
const hiraToKata = (s: string): string =>
    s.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));

// 表記ゆれ吸収用の正規化キー。
// - NFKC で全角/半角を統一
// - 小文字化
// - ひらがな↔カタカナはカタカナに寄せる
// - 空白 / 中黒 / ハイフン類を除去 (TS / T-S / T S を同一視)
export const normalizeTagKey = (s: string): string => {
    if (!s) return '';
    const nfkc = s.normalize('NFKC').toLowerCase();
    const kata = hiraToKata(nfkc);
    return kata.replace(/[\s　\-_・・]/g, '');
};

// 全アイテムから { 表記 → 件数 } を集計し、頻度順に並べた TagStat[] を返す。
// 同一正規化キーの中では、最頻の表記を表示用 tag として採用。
export const aggregateTags = (items: KnowledgeItem[]): TagStat[] => {
    const buckets = new Map<string, Map<string, number>>(); // key → (display → count)
    for (const item of items) {
        const tags = item.tags || [];
        for (const raw of tags) {
            const t = (raw || '').trim();
            if (!t) continue;
            const key = normalizeTagKey(t);
            if (!key) continue;
            let inner = buckets.get(key);
            if (!inner) {
                inner = new Map();
                buckets.set(key, inner);
            }
            inner.set(t, (inner.get(t) || 0) + 1);
        }
    }

    const stats: TagStat[] = [];
    for (const [key, inner] of buckets) {
        let total = 0;
        let bestDisplay = '';
        let bestCount = -1;
        for (const [display, c] of inner) {
            total += c;
            if (c > bestCount) {
                bestCount = c;
                bestDisplay = display;
            }
        }
        stats.push({ tag: bestDisplay, count: total, key });
    }
    stats.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return stats;
};

// 入力中のクエリにマッチする候補を返す。
// - 空クエリのときは「未使用タグの中から頻度上位」を返す
// - クエリ正規化キーで前方一致 > 部分一致 の順、同点は頻度降順
// - 既に入力済みのタグ (excluded) は除外
export const findTagSuggestions = (
    query: string,
    all: TagStat[],
    excluded: string[],
    limit = 8
): TagStat[] => {
    const excludedKeys = new Set(excluded.map(normalizeTagKey).filter(Boolean));
    const pool = all.filter(s => !excludedKeys.has(s.key));

    const q = normalizeTagKey(query);
    if (!q) return pool.slice(0, limit);

    const prefix: TagStat[] = [];
    const partial: TagStat[] = [];
    for (const s of pool) {
        if (s.key.startsWith(q)) prefix.push(s);
        else if (s.key.includes(q)) partial.push(s);
    }
    return [...prefix, ...partial].slice(0, limit);
};

// `#a #b #c` 形式の文字列をパースする (Editor の保存ロジックと揃える)
export const parseTagInput = (input: string): string[] =>
    input
        .split(/[#＃♯]/)
        .map(t => t.trim())
        .filter(Boolean);

// 入力欄末尾のカーソル位置で「現在編集中のタグ片」を取り出す。
// 例: "#js #err"  → { activeFragment: "err", baseLength: 5 }
//     "#js "      → { activeFragment: "",    baseLength: 5 }
export const getActiveTagFragment = (input: string): { activeFragment: string; baseLength: number } => {
    const m = input.match(/[#＃♯]([^#＃♯]*)$/);
    if (!m) return { activeFragment: '', baseLength: input.length };
    return {
        activeFragment: m[1].trim(),
        baseLength: input.length - m[1].length,
    };
};

// 候補を選択したときに input 文字列を組み立て直す。末尾の編集中タグを置換し、
// 後続入力のために `#` を 1 つ追加する。
export const applyTagSuggestion = (input: string, suggestion: string): string => {
    const m = input.match(/([#＃♯])([^#＃♯]*)$/);
    if (!m) {
        const sep = input && !/\s$/.test(input) ? ' ' : '';
        return `${input}${sep}#${suggestion} #`;
    }
    const head = input.slice(0, input.length - m[0].length);
    return `${head}${m[1]}${suggestion} #`;
};
