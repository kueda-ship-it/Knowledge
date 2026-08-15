import { Attachment, KnowledgeItem } from '../types';

// 編集中フォームのスナップショット。未保存判定と下書き保存の両方で使う。
export interface EditorSnapshot {
    formData: Partial<KnowledgeItem>;
    selectedIncidents: string[];
    tagInput: string;
    attachments: Attachment[];
}

export interface StoredDraft extends EditorSnapshot {
    savedAt: string;
}

const KEY_PREFIX = 'knowledge.editorDraft.v1';

// 同じ PC を複数アカウントで使ったときに下書きが混ざらないようにユーザー単位で分ける
export function draftKey(userKey?: string): string {
    return `${KEY_PREFIX}:${userKey || 'anonymous'}`;
}

// 比較対象のフィールドだけを固定順で取り出す。
// formData はスプレッド更新でキー順が変わるため JSON.stringify の直接比較は使えない。
function normalize(s: EditorSnapshot): string {
    const f = s.formData || {};
    const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
    return JSON.stringify([
        text(f.recordType ?? 'trouble'),
        text(f.title),
        text(f.machine),
        text(f.property),
        text(f.req_num),
        text(f.category),
        text(f.phenomenon),
        text(f.countermeasure),
        text(f.content),
        text(f.status ?? 'unsolved'),
        text(f.claimLevel ?? 0),
        s.selectedIncidents ?? [],
        text(s.tagInput),
        (s.attachments ?? []).map(a => a.url),
    ]);
}

// 「閉じたら失われる変更があるか」。ベースライン (item 読み込み直後 or 空フォーム) との差分で見る。
export function isDirty(current: EditorSnapshot, baseline: EditorSnapshot): boolean {
    return normalize(current) !== normalize(baseline);
}

// 下書きとして残す価値があるか (空フォームを保存しても復元バナーが出るだけで邪魔)
export function hasContent(s: EditorSnapshot): boolean {
    const f = s.formData || {};
    const filled = [f.title, f.machine, f.property, f.req_num, f.category, f.phenomenon, f.countermeasure, f.content]
        .some(v => typeof v === 'string' && v.trim() !== '');
    return filled
        || (s.selectedIncidents ?? []).length > 0
        || (s.tagInput ?? '').trim() !== ''
        || (s.attachments ?? []).length > 0;
}

// 以下 3 つは localStorage が使えない環境 (プライベートモード / 容量超過) でも
// 編集自体は続行できるよう、失敗しても例外を投げない。
export function saveDraft(s: EditorSnapshot, userKey?: string, now = new Date()): boolean {
    try {
        const stored: StoredDraft = { ...s, savedAt: now.toISOString() };
        localStorage.setItem(draftKey(userKey), JSON.stringify(stored));
        return true;
    } catch {
        return false;
    }
}

export function loadDraft(userKey?: string): StoredDraft | null {
    try {
        const raw = localStorage.getItem(draftKey(userKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.formData) return null;
        const draft: StoredDraft = {
            formData: parsed.formData ?? {},
            selectedIncidents: Array.isArray(parsed.selectedIncidents) ? parsed.selectedIncidents : [],
            tagInput: typeof parsed.tagInput === 'string' ? parsed.tagInput : '',
            attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
            savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
        };
        return hasContent(draft) ? draft : null;
    } catch {
        return null;
    }
}

export function clearDraft(userKey?: string): void {
    try {
        localStorage.removeItem(draftKey(userKey));
    } catch {
        /* noop */
    }
}
