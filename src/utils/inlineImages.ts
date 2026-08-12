// 本文中の画像は markdown 互換の ![](url) で埋め込む。
// テキストと同じカラムに保存するので、貼った位置がそのまま表示位置になる。
const INLINE_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;

// /g 付き正規表現の test は lastIndex を持ち越して結果が交互に変わるので判定用は別に持つ
export const hasInlineImage = (text: string): boolean => /!\[[^\]]*\]\(https?:\/\//.test(text);

// 一覧のプレビューなど 1 行表示用に画像記法を落とす
export function stripInlineImages(text: string): string {
    return text.replace(INLINE_IMAGE_RE, ' ').replace(/[\s　]+/g, ' ').trim();
}

export type BodyPart = { type: 'text'; value: string } | { type: 'image'; url: string };

export function splitInlineImages(text: string): BodyPart[] {
    const parts: BodyPart[] = [];
    let last = 0;
    for (const m of text.matchAll(INLINE_IMAGE_RE)) {
        const at = m.index ?? 0;
        if (at > last) parts.push({ type: 'text', value: text.slice(last, at) });
        parts.push({ type: 'image', url: m[1] });
        last = at + m[0].length;
    }
    if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
    return parts;
}

// カーソル位置に画像記法を差し込む。前後に改行が無ければ足して段落を割らないようにする。
export function insertImageMarkup(value: string, pos: number, urls: string[]): { text: string; caret: number } {
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const snippet =
        (before && !before.endsWith('\n') ? '\n' : '') +
        urls.map(u => `![](${u})`).join('\n') +
        (after && !after.startsWith('\n') ? '\n' : '');
    return { text: before + snippet + after, caret: (before + snippet).length };
}
