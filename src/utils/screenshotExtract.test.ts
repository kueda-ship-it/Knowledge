import { describe, expect, it } from 'vitest';
import { mergeDraft, ExtractedKnowledgeDraft } from './screenshotExtract';

const FULL_DRAFT: ExtractedKnowledgeDraft = {
    title: 'フルタイムロッカー 全扉開かず（F7 ヒューズ切れ）',
    machine: 'フルタイムロッカー',
    property: 'FTS東京',
    req_num: '12345678901',
    category: 'Engineer（障害）',
    phenomenon: '電源落とされていたので入れ直して動作確認。F7 ヒューズ切れ。',
    countermeasure: '列基板交換で荷有り表示が消えることを確認。',
    tags: ['ヒューズ切れ', '列基板'],
    incidents: ['ロッカー停止'],
    status: 'unsolved',
};

describe('mergeDraft', () => {
    it('空フォームには全フィールドを反映する', () => {
        const out = mergeDraft({}, FULL_DRAFT, false);
        expect(out.title).toBe(FULL_DRAFT.title);
        expect(out.machine).toBe('フルタイムロッカー');
        expect(out.property).toBe('FTS東京');
        expect(out.req_num).toBe('12345678901');
        expect(out.phenomenon).toContain('F7 ヒューズ切れ');
        expect(out.tags).toEqual(['ヒューズ切れ', '列基板']);
        expect(out.incidents).toEqual(['ロッカー停止']);
        expect(out.status).toBe('unsolved');
    });

    it('手入力済みフィールドは上書きしない', () => {
        const out = mergeDraft(
            { title: '手入力タイトル', phenomenon: '手入力の事象' },
            FULL_DRAFT,
            false,
        );
        expect(out.title).toBeUndefined();
        expect(out.phenomenon).toBeUndefined();
        expect(out.countermeasure).toBe(FULL_DRAFT.countermeasure);
    });

    it('空白のみのフィールドは空扱いで埋める', () => {
        const out = mergeDraft({ title: '   ' }, FULL_DRAFT, false);
        expect(out.title).toBe(FULL_DRAFT.title);
    });

    it('tags / incidents は既に値があればセットしない', () => {
        const out = mergeDraft({ tags: ['既存'], incidents: ['既存詳細'] }, FULL_DRAFT, false);
        expect(out.tags).toBeUndefined();
        expect(out.incidents).toBeUndefined();
    });

    it('status は statusTouched=true なら反映しない', () => {
        const out = mergeDraft({ status: 'solved' }, FULL_DRAFT, true);
        expect(out.status).toBeUndefined();
    });

    it('status は statusTouched=false なら現在値があっても AI 判定を反映する', () => {
        const out = mergeDraft({ status: 'solved' }, FULL_DRAFT, false);
        expect(out.status).toBe('unsolved');
    });

    it('draft 側が空のフィールドは何も返さない', () => {
        const out = mergeDraft({}, { title: 'T' }, true);
        expect(Object.keys(out)).toEqual(['title']);
    });
});
