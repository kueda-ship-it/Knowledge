// FC (フルタイムシステム) の障害対応報告画面などのスクリーンショットから
// ナレッジのドラフト (題名 / 事象 / 対処 など) を抽出する Edge Function。
// gemini-chat と同じく Gemini 2.5 Flash を使い、JSON のみを返す。

// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGES = 5;

interface ExtractRequest {
  images: Array<{ mimeType: string; data: string }>;
  // 現在のフォーム入力値。統合読み取りの文脈として渡す (マージ自体はクライアント側で行う)
  current?: Record<string, unknown>;
  masters?: { categories?: string[]; incidents?: string[] };
}

export interface ExtractedDraft {
  title: string;
  machine?: string;
  property?: string;
  req_num?: string;
  category?: string;
  phenomenon?: string;
  countermeasure?: string;
  tags?: string[];
  incidents?: string[];
  status?: "solved" | "unsolved";
}

function buildPrompt(current: Record<string, unknown>, masters: { categories?: string[]; incidents?: string[] }): string {
  const categories = (masters.categories ?? []).join(" / ") || "(なし)";
  const incidents = (masters.incidents ?? []).join(" / ") || "(なし)";
  const currentJson = JSON.stringify(current ?? {});
  return `あなたは社内ナレッジベースの入力補助 AI です。
添付された画像は、FC (フルタイムシステム社内 Web) の「障害対応要請/報告書」「対応結果」画面などのスクリーンショットです。
画像から障害対応の内容を読み取り、ナレッジ登録用のドラフト JSON を 1 件返してください。
複数枚ある場合は同一案件の続きとして統合してください。
FC では「依頼ヘッダー画面 (物件名・型-号機・依頼番号・現地症状の表)」と「対応結果画面 (備考欄の長文)」が
別のスクリーンショットになっていることが多い。全画像の表ラベルを丁寧に読み、統合すること。

# フィールドマッピング (← の後は FC 画面上のラベル名)
- title: 障害内容 + 対象・原因の短い要約 (例:「フルタイムロッカー 全扉開かず（F7 ヒューズ切れ・列基板焦げ）」)
- phenomenon: ← 「現地症状」「備考欄（現地症状）」。発生した事象・確認された状態の要約。**画像に症状の記載が無ければフィールドごと省略** (後から報告画面のスクショで埋めるため)
- countermeasure: ← 「処置内容」「備考欄（処置内容）」。実施した対処に加え、今後の対応条件 (部品承認待ち・交換条件など) も含める。**画像に処置の記載が無ければフィールドごと省略**。「対応完了」等のステータス表示だけからの推測は禁止
- machine: ← 「型-号機」「号機」欄の号機番号の**数字のみ** (型式プレフィックスは含めない。例: 「H - 7798」→ "7798"、「FRC-420073」→ "420073")
- property: ← 「物件名」欄 (例: ヒルズ栗平)。無ければ会社名・設置場所
- req_num: ← 「依頼番号」欄の半角数字11桁 (例: 12607280302)。**必ず文字列**で返す (数値型で返さない)。
  依頼ヘッダー画面ではブラウザ最上部の [閉じる][更新] ボタン行の右側にも同じ番号が出ているので、
  表の「依頼番号」欄が小さくて読みにくい場合はそちらも照合すること。11桁以外なら省略
- category: 次の選択肢に一致する場合のみ: ${categories}
- incidents: 次の選択肢に一致するもののみ配列で: ${incidents}
- tags: 症状・部品名などのキーワードを 3〜5 個 (例: ヒューズ切れ, 列基板, 荷有り表示)
- status: 対応が完了していれば "solved"、一次対応止まり・部品交換待ち・再発可能性ありなら "unsolved"

# 既入力値 (参考。矛盾しない統合結果を返すこと)
${currentJson}

# 出力ルール
1. 純粋な JSON のみを返す。コードブロックで包まない
2. 読み取れないフィールドは省略する (空文字を入れない)。「画像からは読み取れません」「不明です」のような説明文をフィールド値として入れることは**絶対に禁止**
3. title は必ず入れる。どうしても読み取れない場合のみ "FC障害対応 (要確認)" とする
4. 憶測で情報を作らない。画像に書かれていることだけを使う

# 出力フォーマット
{
  "title": "...",
  "machine": "...",
  "property": "...",
  "req_num": "...",
  "category": "...",
  "phenomenon": "...",
  "countermeasure": "...",
  "tags": ["..."],
  "incidents": ["..."],
  "status": "unsolved"
}`;
}

export function sanitizeDraft(
  raw: unknown,
  masters: { categories?: string[]; incidents?: string[] },
): ExtractedDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const title = String(d.title ?? "").trim();
  if (!title) return null;

  const categories = masters.categories ?? [];
  const incidentMaster = masters.incidents ?? [];
  const category = d.category ? String(d.category) : undefined;
  const incidents = Array.isArray(d.incidents)
    ? d.incidents.map(String).filter(i => incidentMaster.length === 0 || incidentMaster.includes(i))
    : undefined;

  // 号機は数字のみ (LLM が「FRC-420073」形式で返しても "420073" に正規化)
  const machineRaw = d.machine ? String(d.machine).trim() : "";
  const machineMatch = machineRaw.match(/^[A-Za-z]*[-\s]*(\d+)$/);
  const machine = machineMatch ? machineMatch[1] : (machineRaw || undefined);

  // 依頼番号は全桁数字なので JSON モードの Gemini が number で返すことがある。
  // 区切り記号・全角も含めて数字だけに正規化してから 11 桁判定する。
  const reqDigits = (d.req_num === undefined || d.req_num === null ? "" : String(d.req_num))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "");
  const req_num = /^\d{11}$/.test(reqDigits) ? reqDigits : undefined;

  // 事象・対処に「画像からは読み取れない」等のメタ記述が入っていたら捨てる
  // (実際の報告文が画像・スクショに言及することはない)。空欄のまま返せば
  // 後から報告画面のスクショを貼ったときにマージで埋まる。
  const cleanBody = (v: unknown): string | undefined => {
    const s = v ? String(v).trim() : "";
    if (!s) return undefined;
    if (/画像|スクリーンショット|スクショ/.test(s)) return undefined;
    return s;
  };

  return {
    title,
    machine,
    property: d.property ? String(d.property) : undefined,
    req_num,
    category: category && (categories.length === 0 || categories.includes(category)) ? category : undefined,
    phenomenon: cleanBody(d.phenomenon),
    countermeasure: cleanBody(d.countermeasure),
    tags: Array.isArray(d.tags) ? d.tags.map(String).filter(Boolean).slice(0, 8) : undefined,
    incidents: incidents && incidents.length ? incidents : undefined,
    status: d.status === "solved" || d.status === "unsolved" ? d.status : undefined,
  };
}

// @ts-ignore Deno runtime
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // @ts-ignore Deno.env
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: ExtractRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  if (images.length === 0) {
    return new Response(JSON.stringify({ error: "images required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const masters = body.masters ?? {};
  const prompt = buildPrompt(body.current ?? {}, masters);

  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          ...images.map(img => ({
            inline_data: { mime_type: img.mimeType || "image/jpeg", data: img.data },
          })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const r = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return new Response(JSON.stringify({ error: `gemini ${r.status}`, detail: errText.slice(0, 500) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const json = await r.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let draft: ExtractedDraft | null = null;
  try {
    draft = sanitizeDraft(JSON.parse(text), masters);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        draft = sanitizeDraft(JSON.parse(m[0]), masters);
      } catch { /* fallthrough */ }
    }
  }

  if (!draft) {
    return new Response(JSON.stringify({ error: "extract failed", detail: text.slice(0, 300) }), {
      status: 422,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ draft }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
