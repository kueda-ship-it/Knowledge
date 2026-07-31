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
- phenomenon: ← 「現地症状」「備考欄（現地症状）」。発生した事象・確認された状態の要約
- countermeasure: ← 「処置内容」「備考欄（処置内容）」。実施した対処に加え、今後の対応条件 (部品承認待ち・交換条件など) も含める
- machine: ← 「型-号機」「号機」欄の号機番号の**数字のみ** (型式プレフィックスは含めない。例: 「H - 7798」→ "7798"、「FRC-420073」→ "420073")
- property: ← 「物件名」欄 (例: ヒルズ栗平)。無ければ会社名・設置場所
- req_num: ← 「依頼番号」欄の半角数字11桁 (例: 12607280302)。11桁以外なら省略
- category: 次の選択肢に一致する場合のみ: ${categories}
- incidents: 次の選択肢に一致するもののみ配列で: ${incidents}
- tags: 症状・部品名などのキーワードを 3〜5 個 (例: ヒューズ切れ, 列基板, 荷有り表示)
- status: 対応が完了していれば "solved"、一次対応止まり・部品交換待ち・再発可能性ありなら "unsolved"

# 既入力値 (参考。矛盾しない統合結果を返すこと)
${currentJson}

# 出力ルール
1. 純粋な JSON のみを返す。コードブロックで包まない
2. 読み取れないフィールドは省略する (空文字を入れない)
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

  return {
    title,
    machine,
    property: d.property ? String(d.property) : undefined,
    req_num: typeof d.req_num === "string" && /^\d{11}$/.test(d.req_num) ? d.req_num : undefined,
    category: category && (categories.length === 0 || categories.includes(category)) ? category : undefined,
    phenomenon: d.phenomenon ? String(d.phenomenon) : undefined,
    countermeasure: d.countermeasure ? String(d.countermeasure) : undefined,
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
