import { describe, it, expect } from 'vitest';
import { checkByRule, isPlaceholder, QualityInput } from './knowledge5w1h';

const base: QualityInput = {
    title: 'フルタイムロッカー 全扉開かず（F7 ヒューズ切れ）',
    property: 'ヒルズ栗平',
    machine: '7798',
    req_num: '12607280302',
    category: 'Engineer',
    recordType: 'trouble',
    phenomenon: '9/25 14:20 管理員より「1番機の全扉が開かない」と連絡。現地にて F7 ヒューズ切れを確認。列基板に焦げがあり、過電流によるものと推定。',
    countermeasure: 'ヒューズと列基板を交換し、全扉の開閉動作を確認して復旧。予備品の補充を手配済み。',
    author: '上田 晃平',
};

const aspectsOf = (input: QualityInput) => checkByRule(input).map(i => i.aspect);

describe('isPlaceholder', () => {
    it('空・不明・特になしは中身なしと判定する', () => {
        for (const v of ['', '   ', '不明', '不明です', 'なし', '特に無し', '未確認', '同上', 'TBD', 'n/a']) {
            expect(isPlaceholder(v), v).toBe(true);
        }
    });

    it('同一文字の繰り返しだけは中身なしと判定する', () => {
        for (const v of ['あああ', '111', 'ーーーー', 'aaaa']) {
            expect(isPlaceholder(v), v).toBe(true);
        }
    });

    it('実内容があれば中身ありと判定する', () => {
        expect(isPlaceholder('F7 ヒューズ切れを確認')).toBe(false);
        expect(isPlaceholder('原因不明だが基板を交換して復旧')).toBe(false);
    });
});

describe('checkByRule', () => {
    it('5W1H が揃った起票は通す', () => {
        expect(checkByRule(base)).toEqual([]);
    });

    it('全欄が空なら 6 観点すべてを不足として返す', () => {
        const issues = checkByRule({});
        expect(issues.map(i => i.aspect)).toEqual(['when', 'where', 'who', 'what', 'why', 'how']);
        expect(issues.every(i => i.source === 'rule')).toBe(true);
    });

    it('日時の記載が無ければ when を検出する', () => {
        const input = { ...base, phenomenon: base.phenomenon!.replace('9/25 14:20 ', '') };
        expect(aspectsOf(input)).toEqual(['when']);
    });

    it('日時は「昨日夕方」のような相対表現でも充足とみなす', () => {
        const input = { ...base, phenomenon: base.phenomenon!.replace('9/25 14:20 ', '昨日夕方 ') };
        expect(aspectsOf(input)).toEqual([]);
    });

    it('物件名・号機が空なら where を検出する', () => {
        expect(aspectsOf({ ...base, property: '' })).toEqual(['where']);
        expect(aspectsOf({ ...base, machine: '' })).toEqual(['where']);
    });

    it('申告者・対応者が読み取れなければ who を検出する', () => {
        const input = {
            ...base,
            title: 'ロッカー 全扉開かず',
            phenomenon: '9/25 14:20 1番機の全扉が開かない状態。F7 ヒューズ切れを確認。列基板の焦げによる過電流と推定。',
            countermeasure: 'ヒューズと列基板を交換し、全扉の開閉動作を確認して復旧。',
        };
        expect(aspectsOf(input)).toEqual(['who']);
    });

    it('原因・推定・経緯が無ければ why を検出する', () => {
        const input = {
            ...base,
            title: 'ロッカー 全扉開かず',
            phenomenon: '9/25 14:20 管理員より 1番機の全扉が開かないと申告あり。現地にて全扉の閉状態を確認した。',
            countermeasure: '列基板を交換し、全扉の開閉動作を確認して復旧。',
        };
        expect(aspectsOf(input)).toEqual(['why']);
    });

    it('事象・対処が「不明」だけなら what と how を検出する', () => {
        const issues = aspectsOf({ ...base, phenomenon: '不明', countermeasure: 'なし' });
        expect(issues).toContain('what');
        expect(issues).toContain('how');
    });

    it('事象が極端に短ければ what を検出する', () => {
        const issues = aspectsOf({ ...base, phenomenon: '9/25 扉が開かず' });
        expect(issues).toContain('what');
    });
});
