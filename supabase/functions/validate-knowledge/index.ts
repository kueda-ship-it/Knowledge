// ナレッジ起票内容に 5W1H（いつ / どこで / 誰が / 何を / なぜ / どのように）が
// 書かれているかを Gemini 2.5 Flash で判定する Edge Function。
// クライアント側のルール判定 (src/utils/knowledge5w1h.ts) を通った入力に対して、
// 「原因が書かれていない」「対応者が分からない」といった内容の実質を見る。
//
// 返すのは不足している観点だけ。判断に迷うものは不足扱いにしない (誤検知で起票を止めない)。

// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASPECTS = ["when", "where", "who", "what", "why", "how"] as const;
type Aspect = typeof ASPECTS[number];

interface KnowledgeInput {
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

export interface Issue {
  aspect: Aspect;
  reason: string;
}

function buildPrompt(k: KnowledgeInput): string {
  const field = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s || "(未入力)";
  };
  return `あなたは社内ナレッジベースの起票内容をチェックする審査 AI です。
昇降機・宅配ロッカー等の設備障害対応の記録が、後から読んだ人に再現できる内容になっているかを判定します。

# 審査対象の起票内容
- 題名: ${field(k.title)}
- 物件名: ${field(k.property)}
- 号機: ${field(k.machine)}
- 依頼番号: ${field(k.req_num)}
- 区分: ${field(k.category)}
- 種別: ${field(k.recordType)}
- 起票者 (システムが自動記録): ${field(k.author)}
- 事象:
${field(k.phenomenon)}
- 対処:
${field(k.countermeasure)}

# 判定する 6 観点
- when  (いつ): 発生日・発生時刻・時間帯のいずれかが読み取れるか。「9/25 14:20頃」「昨日夕方」等で可
- where (どこで): 物件名と号機が入っているか。本文の設置場所・階・扉番号は補強材料
- who   (誰が): 誰から申告・連絡があったか、または誰が対応したかが読み取れるか。
  起票者名はシステムが自動記録するので、本文が「自身で現地対応」と分かる書き方であれば充足とみなす
- what  (何を): 発生した事象・確認された状態が具体的に書かれているか。機器名や症状が特定できるか
- why   (なぜ): 原因、または原因未特定の場合の推定・切り分け経緯・背景が書かれているか。
  「原因不明」だけは不足。「基板の焼損を確認、過電流によるものと推定」のように根拠があれば充足
- how   (どのように): 実施した対処と結果が書かれているか。未完了なら次の予定・待ち事項があれば充足

# 判定ルール (重要)
1. **明らかに書かれていない観点だけ**を不足として返す。読み取れる可能性があるものは充足とみなす
2. 表現の上手さ・誤字・文章量は評価しない。情報が有るか無いかだけを見る
3. 専門用語・略語・社内用語（FC、FE、列基板、荷有り表示 等）は正しい記載として扱う
4. 不足が無ければ issues を空配列で返す
5. reason は日本語 1 文 (40 文字以内)。何が書かれていないかを具体的に述べる。
   「記載してください」等の指示ではなく、事実として何が欠けているかを書く

# 出力フォーマット (純粋な JSON のみ。コードブロックで包まない)
{
  "issues": [
    { "aspect": "why", "reason": "原因も推定も書かれていません" }
  ]
}`;
}

export function sanitizeIssues(raw: unknown): Issue[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as Record<string, unknown>).issues;
  if (!Array.isArray(list)) return [];
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const aspect = String((item as Record<string, unknown>).aspect ?? "").trim() as Aspect;
    if (!ASPECTS.includes(aspect) || seen.has(aspect)) continue;
    seen.add(aspect);
    const reason = String((item as Record<string, unknown>).reason ?? "").trim().slice(0, 120);
    out.push({ aspect, reason });
  }
  return out;
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

  let body: { knowledge?: KnowledgeInput };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const knowledge = body.knowledge;
  if (!knowledge || typeof knowledge !== "object") {
    return new Response(JSON.stringify({ error: "knowledge required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const geminiBody = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(knowledge) }] }],
    generationConfig: {
      temperature: 0,
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

  let issues: Issue[] | null = null;
  try {
    issues = sanitizeIssues(JSON.parse(text));
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        issues = sanitizeIssues(JSON.parse(m[0]));
      } catch { /* fallthrough */ }
    }
  }

  // パースできなかった場合は 422。クライアントはフェイルオープンでルール判定のみに倒す
  if (!issues) {
    return new Response(JSON.stringify({ error: "validate failed", detail: text.slice(0, 300) }), {
      status: 422,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ issues }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
