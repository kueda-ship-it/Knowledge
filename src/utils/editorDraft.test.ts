import { describe, it, expect, beforeEach } from 'vitest';
import { EditorSnapshot, isDirty, hasContent, saveDraft, loadDraft, clearDraft, draftKey } from './editorDraft';

const empty = (): EditorSnapshot => ({
    formData: {
        title: '', machine: '', property: '', req_num: '',
        category: '', content: '', phenomenon: '', countermeasure: '',
        status: 'unsolved', claimLevel: 0,
    },
    selectedIncidents: [],
    tagInput: '',
    attachments: [],
});

describe('isDirty', () => {
    it('同じ内容なら未変更', () => {
        expect(isDirty(empty(), empty())).toBe(false);
    });

    it('formData のキー順が違っても未変更と判定する', () => {
        const a = empty();
        const b: EditorSnapshot = { ...empty(), formData: { status: 'unsolved', claimLevel: 0, countermeasure: '', phenomenon: '', content: '', category: '', req_num: '', property: '', machine: '', title: '' } };
        expect(isDirty(a, b)).toBe(false);
    });

    it('未指定と空文字を同一視する (item 読み込み直後の誤検知を防ぐ)', () => {
        const baseline: EditorSnapshot = { ...empty(), formData: { title: 'A' } };
        const current: EditorSnapshot = { ...empty(), formData: { title: 'A', machine: '', property: '' } };
        expect(isDirty(current, baseline)).toBe(false);
    });

    it('入力すると変更ありになる', () => {
        const current = empty();
        current.formData.req_num = '12608150027';
        expect(isDirty(current, empty())).toBe(true);
    });

    it('インシデント・タグ・添付の追加も検出する', () => {
        const withIncident = { ...empty(), selectedIncidents: ['ヒューズ切れ'] };
        expect(isDirty(withIncident, empty())).toBe(true);

        const withTag = { ...empty(), tagInput: '#列基板' };
        expect(isDirty(withTag, empty())).toBe(true);

        const withFile = { ...empty(), attachments: [{ id: '1', url: 'https://x/a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1 }] };
        expect(isDirty(withFile, empty())).toBe(true);
    });
});

describe('hasContent', () => {
    it('空フォームは下書き対象外', () => {
        expect(hasContent(empty())).toBe(false);
    });

    it('空白のみの入力は下書き対象外', () => {
        const s = empty();
        s.formData.title = '   ';
        expect(hasContent(s)).toBe(false);
    });

    it('何か入っていれば下書き対象', () => {
        const s = empty();
        s.formData.phenomenon = '全扉開かず';
        expect(hasContent(s)).toBe(true);
    });
});

describe('保存 / 復元', () => {
    beforeEach(() => localStorage.clear());

    it('保存した下書きを復元できる', () => {
        const s = empty();
        s.formData.property = 'グランツオーベル目黒花房山';
        s.formData.req_num = '12608150027';
        s.selectedIncidents = ['ロッカー'];

        expect(saveDraft(s, 'k_ueda@fts.co.jp')).toBe(true);
        const back = loadDraft('k_ueda@fts.co.jp');
        expect(back?.formData.property).toBe('グランツオーベル目黒花房山');
        expect(back?.formData.req_num).toBe('12608150027');
        expect(back?.selectedIncidents).toEqual(['ロッカー']);
        expect(back?.savedAt).toBeTruthy();
    });

    it('ユーザーが違えば復元されない', () => {
        const s = empty();
        s.formData.title = 'A';
        saveDraft(s, 'a@example.com');
        expect(loadDraft('b@example.com')).toBeNull();
    });

    it('中身が空の下書きは復元しない', () => {
        localStorage.setItem(draftKey('u'), JSON.stringify({ formData: {}, selectedIncidents: [], tagInput: '', attachments: [], savedAt: '2026-08-15T00:00:00.000Z' }));
        expect(loadDraft('u')).toBeNull();
    });

    it('壊れた JSON でも例外を投げず null を返す', () => {
        localStorage.setItem(draftKey('u'), '{壊れています');
        expect(loadDraft('u')).toBeNull();
    });

    it('clearDraft で消える', () => {
        const s = empty();
        s.formData.title = 'A';
        saveDraft(s, 'u');
        clearDraft('u');
        expect(loadDraft('u')).toBeNull();
    });
});
