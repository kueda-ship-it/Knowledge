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
  action?: ChatAction;
}

// アプリ操作アクション。フロント側 src/types/index.ts と必ず同じ shape を保つこと。
type ChatAction =
  | {
      type: "create_proposal";
      confirmText: string;
      draft: {
        title: string;
        problem?: string;
        proposal?: string;
        category?: string;
        priority?: "高" | "中" | "低";
        status?: "未着手" | "対応中" | "完了" | "保留";
      };
    }
  | {
      type: "create_knowledge";
      confirmText: string;
      draft: {
        title: string;
        machine?: string;
        category?: string;
        phenomenon?: string;
        countermeasure?: string;
        tags?: string[];
        incidents?: string[];
        status?: "solved" | "unsolved";
        content?: string;
      };
    }
  | {
      type: "navigate";
      confirmText?: string;
      view: "knowledge" | "dashboard" | "proposals" | "evaluation" | "filelist" | "menu";
      params?: {
        search?: string;
        knowledgeFilter?: "all" | "unsolved" | "solved" | "mine";
        proposalStatus?: "全て" | "未着手" | "対応中" | "完了" | "保留";
        proposalCategory?: string;
        openCreate?: boolean;
      };
    };

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
さらに、アプリ操作の意図を検知したら "action" を 1 つだけ返して操作を補助できます。

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

# アクション機能 (action フィールド)
ユーザーがアプリ操作を意図している場合のみ、action を 1 つだけ含める。検索系・情報取得系では action を出さない (省略)。
- 書き込み (create_proposal / create_knowledge): UI 側で「実行しますか？」のボタンが出る。ユーザーが押すまで保存はされない。**title が具体的に取れる場合のみ** 使う。
- ナビゲーション (navigate): 確認なしで遷移する。低リスク。**title が不明な作成意図** (例: 単に「提議を立てたい」だけ) の場合は、create_* を使わず navigate {openCreate:true} を返して空フォームを開く。

action.type の選び方:
| ユーザー入力例 | action |
|---|---|
| 「夜間バッチが遅いから優先度高で改善提案を出したい」など **具体的な内容がある** 提案 | create_proposal (draft に title / problem / proposal / category / priority を可能な限り埋める) |
| 「○○というエラーが出た事例を記録したい」など **具体的な内容がある** ナレッジ | create_knowledge (draft に title / machine / phenomenon / countermeasure / category を可能な限り埋める) |
| **「提議を登録したい」「提議を立てたい」「改善提案を出したい」**など 内容が不明な作成意図 | navigate {view:'proposals', params:{openCreate:true}} **（★重要：title 不明なら create_proposal は使わず必ずこちら）** |
| **「ナレッジを登録したい」「障害事例を残したい」**など 内容が不明な作成意図 | navigate {view:'knowledge', params:{openCreate:true}} **（★重要：title 不明なら create_knowledge は使わず必ずこちら）** |
| 「ナレッジ画面を開いて」「〇〇の検索結果を見せて」 | navigate {view:'knowledge', params:{search:'〇〇'}} |
| 「未対応のナレッジ」「未解決のものだけ見たい」 | navigate {view:'knowledge', params:{knowledgeFilter:'unsolved'}} |
| 「未対応の提議を見たい」「対応中の提議は？」 | navigate {view:'proposals', params:{proposalStatus:'未着手' or '対応中'}} |
| 「ダッシュボードを見せて」「集計を表示」 | navigate {view:'dashboard'} |
| 「評価の確認画面」 | navigate {view:'evaluation'} |
| 「メインメニューに戻して」 | navigate {view:'menu'} |

★ 内容が不明 vs 具体的の判断基準:
- 「提議を立てたい」「ナレッジを登録したい」のように **何についてか書かれていない** → openCreate (空フォームを開く)
- 「○○について提議を立てたい」のように **対象 / 問題が書かれている** → create_proposal/knowledge で draft を返す
- 迷ったら **openCreate を選ぶ** (LLM が間違って draft を作るより、ユーザー自身が記入する方が安全)

draft 抽出のヒント:
- ユーザーが詳しく書いた内容 (例:「夜間バッチが遅いから優先度高で改善提案を出したい」) からは title="夜間バッチ高速化", problem="夜間バッチが遅い", priority="高" のように要約・補完してよい
- category は必ず以下から選ぶ: "Engineer（障害）" / "Engineer（施工）" / "施工管理" / "設置管理" / "その他"。判断不能なら省略
- confirmText は「〜を新規作成します。よろしいですか？」のような短い1文 (40字以内)
- 既存提議・既存ナレッジと重複している可能性が高い場合は、action を返さず、まず該当 id を proposalIds / knowledgeIds に入れて「既に〜が登録されています」と message で確認する

カテゴリ判断の補助 (運用提議):
- 「障害対応・トラブル」→ Engineer（障害）
- 「施工・現場作業」→ Engineer（施工）
- 「施工管理」→ 施工管理
- 「設置・現調」→ 設置管理

# 出力フォーマット (JSON のみ。action は任意フィールド)
{
  "message": "ユーザーへの回答テキスト",
  "knowledgeIds": ["id1", "id2"],
  "proposalIds": ["id3"],
  "action": { "type": "create_proposal", "confirmText": "〇〇という運用提議を新規作成します。よろしいですか？", "draft": { "title": "...", "problem": "...", "proposal": "...", "category": "Engineer（施工）", "priority": "中" } }
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

  // LLM 出力を ChatResult に整形。action は許可された type のみ通す。
  function sanitizeAction(raw: unknown): ChatAction | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const a = raw as Record<string, unknown>;
    const t = a.type;
    if (t === "create_proposal") {
      const draft = (a.draft ?? {}) as Record<string, unknown>;
      const title = String(draft.title ?? "").trim();
      if (!title) return undefined;
      return {
        type: "create_proposal",
        confirmText: String(a.confirmText ?? `「${title}」を新規作成します。よろしいですか？`),
        draft: {
          title,
          problem: draft.problem ? String(draft.problem) : undefined,
          proposal: draft.proposal ? String(draft.proposal) : undefined,
          category: draft.category ? String(draft.category) : undefined,
          priority: (draft.priority === "高" || draft.priority === "中" || draft.priority === "低") ? draft.priority : undefined,
          status: (draft.status === "未着手" || draft.status === "対応中" || draft.status === "完了" || draft.status === "保留") ? draft.status : undefined,
        },
      };
    }
    if (t === "create_knowledge") {
      const draft = (a.draft ?? {}) as Record<string, unknown>;
      const title = String(draft.title ?? "").trim();
      if (!title) return undefined;
      return {
        type: "create_knowledge",
        confirmText: String(a.confirmText ?? `「${title}」をナレッジに登録します。よろしいですか？`),
        draft: {
          title,
          machine: draft.machine ? String(draft.machine) : undefined,
          category: draft.category ? String(draft.category) : undefined,
          phenomenon: draft.phenomenon ? String(draft.phenomenon) : undefined,
          countermeasure: draft.countermeasure ? String(draft.countermeasure) : undefined,
          tags: Array.isArray(draft.tags) ? draft.tags.map(String) : undefined,
          incidents: Array.isArray(draft.incidents) ? draft.incidents.map(String) : undefined,
          status: (draft.status === "solved" || draft.status === "unsolved") ? draft.status : undefined,
          content: draft.content ? String(draft.content) : undefined,
        },
      };
    }
    if (t === "navigate") {
      const view = a.view as string;
      const allowed = ["knowledge", "dashboard", "proposals", "evaluation", "filelist", "menu"];
      if (!allowed.includes(view)) return undefined;
      const params = (a.params ?? {}) as Record<string, unknown>;
      return {
        type: "navigate",
        view: view as any,
        confirmText: a.confirmText ? String(a.confirmText) : undefined,
        params: {
          search: params.search ? String(params.search) : undefined,
          knowledgeFilter: ["all", "unsolved", "solved", "mine"].includes(params.knowledgeFilter as string) ? params.knowledgeFilter as any : undefined,
          proposalStatus: ["全て", "未着手", "対応中", "完了", "保留"].includes(params.proposalStatus as string) ? params.proposalStatus as any : undefined,
          proposalCategory: params.proposalCategory ? String(params.proposalCategory) : undefined,
          openCreate: params.openCreate === true,
        },
      };
    }
    return undefined;
  }

  function buildResult(p: any): ChatResult {
    return {
      message: String(p?.message ?? "").trim(),
      knowledgeIds: Array.isArray(p?.knowledgeIds) ? p.knowledgeIds.map(String) : [],
      proposalIds: Array.isArray(p?.proposalIds) ? p.proposalIds.map(String) : [],
      action: sanitizeAction(p?.action),
    };
  }

  let parsed: ChatResult = { message: "", knowledgeIds: [], proposalIds: [] };
  try {
    parsed = buildResult(JSON.parse(text));
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = buildResult(JSON.parse(m[0]));
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
