import { describe, it, expect } from 'vitest';
import { hasInlineImage, insertImageMarkup, splitInlineImages, stripInlineImages } from './inlineImages';

const URL_A = 'https://x.supabase.co/storage/v1/object/public/knowledge-thumbs/proposals/a.webp';
const URL_B = 'https://x.supabase.co/storage/v1/object/public/knowledge-thumbs/proposals/b.webp';

describe('hasInlineImage', () => {
    it('画像記法の有無を判定する', () => {
        expect(hasInlineImage(`前\n![](${URL_A})\n後`)).toBe(true);
        expect(hasInlineImage('画像なしの本文')).toBe(false);
    });

    it('/g の lastIndex 持ち越しで結果が交互に変わらない', () => {
        const text = `![](${URL_A})`;
        expect([hasInlineImage(text), hasInlineImage(text), hasInlineImage(text)]).toEqual([true, true, true]);
    });
});

describe('splitInlineImages', () => {
    it('テキストと画像を出現順に分解する', () => {
        expect(splitInlineImages(`前文\n![](${URL_A})\n後文`)).toEqual([
            { type: 'text', value: '前文\n' },
            { type: 'image', url: URL_A },
            { type: 'text', value: '\n後文' },
        ]);
    });

    it('連続した画像も個別に取り出す', () => {
        expect(splitInlineImages(`![](${URL_A})\n![](${URL_B})`)).toEqual([
            { type: 'image', url: URL_A },
            { type: 'text', value: '\n' },
            { type: 'image', url: URL_B },
        ]);
    });

    it('画像が無ければテキスト 1 件', () => {
        expect(splitInlineImages('ただの本文')).toEqual([{ type: 'text', value: 'ただの本文' }]);
    });
});

describe('stripInlineImages', () => {
    it('一覧プレビュー用に画像記法を落として 1 行にする', () => {
        expect(stripInlineImages(`前文\n![](${URL_A})\n後文`)).toBe('前文 後文');
        expect(stripInlineImages(`![](${URL_A})`)).toBe('');
    });
});

describe('insertImageMarkup', () => {
    it('カーソル位置に差し込み、前後に改行を補う', () => {
        const { text, caret } = insertImageMarkup('前文後文', 3, [URL_A]);
        expect(text).toBe(`前文後\n![](${URL_A})\n文`);
        expect(text.slice(0, caret)).toBe(`前文後\n![](${URL_A})\n`);
    });

    it('既に改行がある位置では改行を増やさない', () => {
        const { text } = insertImageMarkup('前文\n\n後文', 3, [URL_A]);
        expect(text).toBe(`前文\n![](${URL_A})\n後文`);
    });

    it('複数枚は改行区切りでまとめて入る', () => {
        const { text } = insertImageMarkup('', 0, [URL_A, URL_B]);
        expect(text).toBe(`![](${URL_A})\n![](${URL_B})`);
    });
});
