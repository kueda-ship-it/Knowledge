import { KnowledgeItem } from '../types';

// extract-knowledge Edge Function が返すドラフト。KnowledgeDraft の抽出専用スーパーセット
// (FC 画面から物件名・依頼番号も読み取れるため)。
export interface ExtractedKnowledgeDraft {
    title?: string;
    machine?: string;
    property?: string;
    req_num?: string;
    category?: string;
    phenomenon?: string;
    countermeasure?: string;
    tags?: string[];
    incidents?: string[];
    status?: 'solved' | 'unsolved';
}

export interface EncodedImage {
    mimeType: string;
    data: string; // base64 (プレフィックスなし)
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

// スクショを長辺 1600px / JPEG に縮小して base64 化する (Gemini への転送量削減)
export async function encodeImageForExtraction(file: File): Promise<EncodedImage> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] };
}

// マージ対象になるフォーム側の現在値
export interface MergeCurrent {
    title?: string;
    machine?: string;
    property?: string;
    req_num?: string;
    category?: string;
    phenomenon?: string;
    countermeasure?: string;
    tags?: string[];
    incidents?: string[];
    status?: 'solved' | 'unsolved';
}

// 抽出結果を「空欄のフィールドにのみ」反映する。手入力済みの値は上書きしない。
// 例外: status はユーザーが手で切り替えていない (statusTouched=false) 場合のみ AI 判定を反映。
export function mergeDraft(
    current: MergeCurrent,
    draft: ExtractedKnowledgeDraft,
    statusTouched: boolean,
): Partial<MergeCurrent> {
    const out: Partial<MergeCurrent> = {};
    const fillIfEmpty = (key: keyof MergeCurrent & keyof ExtractedKnowledgeDraft) => {
        const cur = current[key];
        const val = draft[key];
        if ((cur === undefined || cur === null || String(cur).trim() === '') && typeof val === 'string' && val.trim()) {
            (out as Record<string, unknown>)[key] = val.trim();
        }
    };
    fillIfEmpty('title');
    fillIfEmpty('machine');
    fillIfEmpty('property');
    fillIfEmpty('req_num');
    fillIfEmpty('category');
    fillIfEmpty('phenomenon');
    fillIfEmpty('countermeasure');

    if ((!current.tags || current.tags.length === 0) && draft.tags && draft.tags.length > 0) {
        out.tags = draft.tags;
    }
    if ((!current.incidents || current.incidents.length === 0) && draft.incidents && draft.incidents.length > 0) {
        out.incidents = draft.incidents;
    }
    if (!statusTouched && draft.status) {
        out.status = draft.status;
    }
    return out;
}

// extract-knowledge Edge Function を 30 秒タイムアウト付きで呼ぶ。
// supabase.functions.invoke は auth ロックで送信前にハングする事例があるため
// (本プロジェクト既知の地雷)、rawRest と同じく fetch で直接叩く。
export async function extractKnowledgeFromImages(
    images: EncodedImage[],
    current: MergeCurrent,
    masters: { categories: string[]; incidents: string[] },
): Promise<ExtractedKnowledgeDraft> {
    const url = (import.meta as any).env.VITE_SUPABASE_URL as string;
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
        res = await fetch(`${url}/functions/v1/extract-knowledge`, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ images, current, masters }),
            signal: controller.signal,
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('EXTRACT_TIMEOUT');
        throw e;
    } finally {
        clearTimeout(timer);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error((data as any)?.error ? `抽出エラー: ${(data as any).error}` : `抽出エラー (HTTP ${res.status})`);
    }
    const draft = (data as any)?.draft;
    if (!draft || typeof draft !== 'object') throw new Error('抽出結果が空でした');
    return draft as ExtractedKnowledgeDraft;
}

// Editor の formData / 付随 state から MergeCurrent を組み立てる
export function currentFromForm(
    formData: Partial<KnowledgeItem>,
    selectedIncidents: string[],
    tagInput: string,
): MergeCurrent {
    return {
        title: formData.title,
        machine: formData.machine,
        property: formData.property,
        req_num: formData.req_num,
        category: formData.category,
        phenomenon: formData.phenomenon,
        countermeasure: formData.countermeasure,
        tags: tagInput.split(/[#＃♯]/).map(t => t.trim()).filter(Boolean),
        incidents: selectedIncidents,
        status: formData.status,
    };
}
