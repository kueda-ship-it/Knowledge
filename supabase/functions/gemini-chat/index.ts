// Gemini 2.5 Flash を Supabase Edge Function 経由で呼び出すプロキシ。
// フロントからナレッジ一覧 + 運用提議一覧 + 質問を受け取り、
// Gemini に投げて { message, knowledgeIds, proposalIds } を返す。

// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KnowledgeSlim {
  id: string;
  title: string;
  machine?: string;
  category?: string;
  tags?: string[];
  incidents?: string[];
  phenomenon?: string;
  countermeasure?: string;
  content?: string;
  status?: string;
  updatedAt?: string;
}

interface ProposalSlim {
  id: string;
  title: string;
  problem?: string;
  proposal?: string;
  category?: string;
  status?: string;
  priority?: string;
  proposed_at?: string;
}

interface ChatRequest {
  query: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  knowledge: KnowledgeSlim[];
  proposals: ProposalSlim[];
}

interface ChatResult {
  message: string;
  knowledgeIds: string[];
  proposalIds: string[];
}

function buildSystemPrompt(knowledge: KnowledgeSlim[], proposals: ProposalSlim[]): string {
  const kBlock = knowledge.length
    ? knowledge.map(k => {
        const tags = (k.tags ?? []).join(",");
        const incidents = (k.incidents ?? []).join(",");
        return `- id:${k.id} | title:${k.title} | machine:${k.machine ?? "-"} | category:${k.category ?? "-"} | status:${k.status ?? "-"} | tags:${tags} | incidents:${incidents} | phenomenon:${k.phenomenon ?? ""} | countermeasure:${k.countermeasure ?? ""}`;
      }).join("\n")
    : "(ナレッジなし)";

  const pBlock = proposals.length
    ? proposals.map(p =>
        `- id:${p.id} | title:${p.title} | category:${p.category ?? "-"} | status:${p.status ?? "-"} | priority:${p.priority ?? "-"} | proposed_at:${p.proposed_at ?? "-"} | problem:${p.problem ?? ""} | proposal:${p.proposal ?? ""}`
      ).join("\n")
    : "(運用提議なし)";

  const today = new Date().toISOString().slice(0, 10);
  return `あなたは社内ナレッジベース + 運用提議データベースのアシスタントです。
ユーザーの質問に対して、提供されたデータだけを根拠に回答してください。

# 今日の日付: ${today}

# ナレッジ (障害対応・作業手順などの蓄積)
${kBlock}

# 運用提議 (改善要望・業務ルール変更の提案。status=完了 のものは "決議されたもの" と扱ってよい)
${pBlock}

# 返答ルール
1. 回答は簡潔に。箇条書きを適宜使う
2. 「障害対応で見ておくべきナレッジは？」のような質問では、症状や対象機器に一致する unsolved / solved 両方のナレッジを返す。status=unsolved は優先度高。
3. 「提議で決まったのは？」→ status=完了 の proposal を返す
4. 「対応中の提議は？」→ status=対応中
5. 引用したナレッジ・提議の id を knowledgeIds / proposalIds に必ず入れる。返答テキストには id を書かない (UI 側でカード表示する)
6. データにない質問には憶測で答えない。正直に「該当情報なし」と返す
7. マークダウンのコードブロックで包まない。純粋な JSON だけを返す

# 出力フォーマット (JSON のみ)
{
  "message": "ユーザーへの回答テキスト",
  "knowledgeIds": ["id1", "id2"],
  "proposalIds": ["id3"]
}`;
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

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { query, history = [], knowledge = [], proposals = [] } = body;
  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "query required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const systemPrompt = buildSystemPrompt(knowledge, proposals);
  const contents = [
    ...history.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: query }] },
  ];

  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.2,
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
  let parsed: ChatResult = { message: "", knowledgeIds: [], proposalIds: [] };
  try {
    const p = JSON.parse(text);
    parsed = {
      message: String(p.message ?? "").trim(),
      knowledgeIds: Array.isArray(p.knowledgeIds) ? p.knowledgeIds.map(String) : [],
      proposalIds: Array.isArray(p.proposalIds) ? p.proposalIds.map(String) : [],
    };
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const p = JSON.parse(m[0]);
        parsed = {
          message: String(p.message ?? "").trim(),
          knowledgeIds: Array.isArray(p.knowledgeIds) ? p.knowledgeIds.map(String) : [],
          proposalIds: Array.isArray(p.proposalIds) ? p.proposalIds.map(String) : [],
        };
      } catch {
        parsed.message = text.slice(0, 500);
      }
    } else {
      parsed.message = text.slice(0, 500);
    }
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
