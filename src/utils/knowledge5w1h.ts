// ナレッジ起票時の 5W1H 充足判定。
// 「いつ / どこで / 誰が / 何を / なぜ / どのように」が本文から読み取れない起票を止める。
// 専用入力欄は増やさない方針なので、判定は本文テキスト (事象 / 対処) を対象に行う。
//
// 2 段構え:
//   1. checkByRule — 空欄・プレースホルダ・日時表現の有無など機械的に確定する欠落。即時・無料
//   2. checkByAi   — 「原因が書かれていない」「対応者が分からない」など内容の実質を Gemini が判定
// AI が落ちてもルールを通っていれば起票させる (フェイルオープン)。AI 障害で業務を止めない。

export type Aspect = 'when' | 'where' | 'who' | 'what' | 'why' | 'how';

export const ASPECT_ORDER: Aspect[] = ['when', 'where', 'who', 'what', 'why', 'how'];

// ダイアログから該当欄へ誘導するための input/textarea の id
export type AspectField = 'phenomenon' | 'countermeasure' | 'property' | 'machine';

interface AspectMeta {
    w: string;      // いつ
    label: string;  // 発生日時
    hint: string;   // 不足時に出す書き方のヒント
    field: AspectField;
}

export const ASPECT_META: Record<Aspect, AspectMeta> = {
    when: {
        w: 'いつ',
        label: '発生日時',
        hint: '事象の冒頭に発生日時を入れてください（例:「9/25 14:20頃」「9/25 夕方」）',
        field: 'phenomenon',
    },
    where: {
        w: 'どこで',
        label: '物件・号機',
        hint: '物件名と号機を入力してください（本文に設置場所・階・扉番号まで書くとより確実です）',
        field: 'property',
    },
    who: {
        w: '誰が',
        label: '申告者・対応者',
        hint: '誰から連絡があったか / 誰が対応したかを書いてください（例:「管理員より連絡」「自身が現地対応」）',
        field: 'phenomenon',
    },
    what: {
        w: '何を',
        label: '事象',
        hint: '発生した事象・確認した状態を具体的に書いてください（機器名 + どうなったか）',
        field: 'phenomenon',
    },
    why: {
        w: 'なぜ',
        label: '原因・推定・経緯',
        hint: '原因（未特定なら推定・切り分けの経緯）を書いてください（例:「F7 ヒューズ切れ。列基板の焦げによる過電流と推定」）',
        field: 'phenomenon',
    },
    how: {
        w: 'どのように',
        label: '対処',
        hint: '実施した対処と結果を書いてください（未完了なら次に何を待っているかまで）',
        field: 'countermeasure',
    },
};

export interface AspectIssue {
    aspect: Aspect;
    reason: string;
    source: 'rule' | 'ai';
}

export interface QualityInput {
    title?: string;
    property?: string;
    machine?: string;
    req_num?: string;
    category?: string;
    recordType?: string;
    phenomenon?: string;
    countermeasure?: string;
    author?: string;
}

// --- テキスト正規化 -------------------------------------------------

// 全角英数を半角にし、空白を畳む
function normalize(s: string): string {
    return s
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[　\s]+/g, ' ')
        .trim();
}

// 記号・句読点を除いた実質の文字数
function substanceLength(s: string): number {
    return s.replace(/[\s　。、，．,.:：;；!！?？\-ー―・/／()（）[\]「」『』]/g, '').length;
}

// 「不明」「なし」「あああ」のような中身の無い入力
const PLACEHOLDER_RE = /^(不明|不明です|わからない|分からない|未確認|未調査|なし|無し|特になし|特に無し|同上|同じ|以上|未定|確認中|調査中|後日記載|後で記載|記載なし|test|テスト|tbd|n\/?a)$/i;

export function isPlaceholder(raw: string | undefined | null): boolean {
    const s = normalize(String(raw ?? ''))
        .replace(/[。、．，,.:：;；!！?？\s]+$/g, '')
        .trim();
    if (!s) return true;
    if (PLACEHOLDER_RE.test(s)) return true;
    // 「あああ」「111」「ーーー」のような同一文字の繰り返しだけ
    if (/^(.)\1*$/.test(s.replace(/\s/g, ''))) return true;
    return false;
}

// --- 「いつ」の検出 -------------------------------------------------

const DATE_PATTERNS: RegExp[] = [
    /\d{1,2}\s*[/／]\s*\d{1,2}/,                  // 9/25
    /\d{1,2}\s*月\s*\d{1,2}\s*日/,                // 9月25日
    /\d{4}\s*[-年]\s*\d{1,2}\s*[-月]\s*\d{1,2}/,  // 2026-09-25 / 2026年9月25日
    /\d{1,2}\s*[:：]\s*\d{2}/,                    // 14:20
    /\d{1,2}\s*時(\s*\d{1,2}\s*分)?/,             // 14時 / 14時20分
    /(午前|午後|AM|PM)\s*\d{1,2}/i,               // 午前9
    /(本日|当日|昨日|前日|翌日|今朝|今夜|深夜|早朝|夕方|週末|先週|今週|月初|月末)/,
    /(月|火|水|木|金|土|日)曜/,
    /(令和|平成)\s*\d{1,2}\s*年/,
];

function hasWhen(text: string): boolean {
    const t = normalize(text);
    return DATE_PATTERNS.some(re => re.test(t));
}

// --- 「なぜ」の検出 (ルールは明らかな欠落だけ拾う緩め設定) -----------

const WHY_PATTERNS: RegExp[] = [
    /原因|要因|起因|誘因/,
    /推定|推測|想定|考えられ|思われ|可能性|疑い|切り分け/,
    /経緯|背景|発端|きっかけ/,
    /により|によって|のため|ためと|せいで|起きた|生じた|発生した/,
    /劣化|断線|短絡|ショート|摩耗|寿命|固着|緩み|腐食|漏水|結露|浸水|過負荷|過電流|誤操作|誤設定|設定ミス|操作ミス|人為|経年|接触不良|異物|詰まり|電源喪失|瞬停|落雷|停電|故障|不良|破損/,
];

function hasWhy(text: string): boolean {
    const t = normalize(text);
    return WHY_PATTERNS.some(re => re.test(t));
}

// --- 「誰が」の検出 -------------------------------------------------

const WHO_PATTERNS: RegExp[] = [
    /管理員|管理人|管理会社|オーナー|お客様|入居者|居住者|利用者|住民|警備|消防|メーカー|業者|協力会社|サービス員|エンジニア|作業者|担当者|当社|弊社|自身|本人|同行|立会|立ち会い|受電|連絡|申告|通報|依頼者|コールセンター|フルタイム/,
    /(氏|さん|様)(より|から)/,
    /\bFE\b|\bFC\b/,
];

function hasWho(text: string): boolean {
    const t = normalize(text);
    return WHO_PATTERNS.some(re => re.test(t));
}

// --- ルール判定 -----------------------------------------------------

// 事象・対処に求める実質文字数。これを下回る入力は内容として成立していない
const MIN_PHENOMENON = 15;
const MIN_COUNTERMEASURE = 10;

export function checkByRule(input: QualityInput): AspectIssue[] {
    const phenomenon = String(input.phenomenon ?? '');
    const countermeasure = String(input.countermeasure ?? '');
    const body = `${input.title ?? ''}\n${phenomenon}\n${countermeasure}`;
    const issues: AspectIssue[] = [];

    // 何を — 事象欄
    if (isPlaceholder(phenomenon)) {
        issues.push({ aspect: 'what', reason: '事象が未記入、または「不明」等の中身の無い記載です', source: 'rule' });
    } else if (substanceLength(phenomenon) < MIN_PHENOMENON) {
        issues.push({ aspect: 'what', reason: `事象が ${substanceLength(phenomenon)} 文字しかありません（${MIN_PHENOMENON} 文字以上で具体的に）`, source: 'rule' });
    }

    // どのように — 対処欄
    if (isPlaceholder(countermeasure)) {
        issues.push({ aspect: 'how', reason: '対処が未記入、または「不明」等の中身の無い記載です', source: 'rule' });
    } else if (substanceLength(countermeasure) < MIN_COUNTERMEASURE) {
        issues.push({ aspect: 'how', reason: `対処が ${substanceLength(countermeasure)} 文字しかありません（${MIN_COUNTERMEASURE} 文字以上で具体的に）`, source: 'rule' });
    }

    // どこで — 物件・号機
    if (isPlaceholder(input.property) || isPlaceholder(input.machine)) {
        issues.push({ aspect: 'where', reason: '物件名・号機が未入力です', source: 'rule' });
    }

    // いつ — 本文に日時表現が無い
    if (!hasWhen(body)) {
        issues.push({ aspect: 'when', reason: '本文に発生日時の記載が見つかりません', source: 'rule' });
    }

    // 誰が — 申告者・対応者に相当する語が無い
    if (!hasWho(body)) {
        issues.push({ aspect: 'who', reason: '申告者・対応者が誰か読み取れません', source: 'rule' });
    }

    // なぜ — 原因・推定・経緯に相当する記載が無い
    if (!hasWhy(body)) {
        issues.push({ aspect: 'why', reason: '原因・推定・経緯の記載が見つかりません', source: 'rule' });
    }

    return sortIssues(issues);
}

// 表示順を 5W1H の並びに固定し、同じ観点の重複を落とす
export function sortIssues(issues: AspectIssue[]): AspectIssue[] {
    return ASPECT_ORDER
        .map(a => issues.find(i => i.aspect === a))
        .filter((i): i is AspectIssue => !!i);
}

// --- AI 判定 --------------------------------------------------------

const AI_TIMEOUT_MS = 15000;

// validate-knowledge Edge Function を 15 秒タイムアウト付きで呼ぶ。
// supabase.functions.invoke は auth ロックでハングする既知の地雷があるため fetch で直接叩く。
export async function checkByAi(input: QualityInput): Promise<AspectIssue[]> {
    const url = (import.meta as any).env.VITE_SUPABASE_URL as string;
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;
    if (!url || !anonKey) throw new Error('SUPABASE_ENV_MISSING');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${url}/functions/v1/validate-knowledge`, {
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ knowledge: input }),
            signal: controller.signal,
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('VALIDATE_TIMEOUT');
        throw e;
    } finally {
        clearTimeout(timer);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`VALIDATE_HTTP_${res.status}`);

    const raw = (data as any)?.issues;
    if (!Array.isArray(raw)) throw new Error('VALIDATE_BAD_RESPONSE');

    const issues: AspectIssue[] = [];
    for (const r of raw) {
        const aspect = String(r?.aspect ?? '') as Aspect;
        if (!ASPECT_ORDER.includes(aspect)) continue;
        const reason = String(r?.reason ?? '').trim() || `${ASPECT_META[aspect].w}（${ASPECT_META[aspect].label}）が読み取れません`;
        issues.push({ aspect, reason, source: 'ai' });
    }
    return sortIssues(issues);
}
