# Knowledge (Knowledge-DB) — Claude への指示

このリポジトリで Claude（Local Claude Code / Cowork / 他環境）が作業するときの規約。
ユーザー: k_ueda（dragonball.gokou-rose@au.com / 業務: k_ueda@fts.co.jp）

⚠️ **Vault 内では本プロジェクトは `Projects/Knowledge-DB/` という名前**（repo 名と異なる）。

## 1. 最初にやること（セッション開始時、必ず）

「Claude 外部脳 Vault」を参照する。**Cowork 等のリモート環境では clone が必要**。

```bash
if [ ! -d "Obsidian Vault" ]; then
  git clone https://github.com/kueda-ship-it/obsidian-vault.git "Obsidian Vault"
else
  (cd "Obsidian Vault" && git pull)
fi
```

clone 後、必ず:

- `Obsidian Vault/CLAUDE.md` — 全体振る舞いルール
- `Obsidian Vault/00_Meta/嗜好まとめ.md` — UI / コーディング嗜好
- `Obsidian Vault/Projects/Knowledge-DB/README.md` — 本プロジェクト
- `Obsidian Vault/Projects/Knowledge-DB/Mistakes/` — **既知の地雷（必読、3 件 high あり）**
- `Obsidian Vault/30_Knowledge/2026-05-18_過去ミスから抽出した最優先ルール.md` — TOP 4

## 2. このプロジェクトの Vault 投入先

| 種類 | パス |
|------|------|
| ミスログ | `Obsidian Vault/Projects/Knowledge-DB/Mistakes/YYYY-MM-DD_<topic>.md` |
| ADR | `Obsidian Vault/Projects/Knowledge-DB/Decisions/YYYY-MM-DD_<topic>.md` |
| ノウハウ | `Obsidian Vault/Projects/Knowledge-DB/Knowledge/<topic>.md` |
| セッション | `Obsidian Vault/Projects/Knowledge-DB/Sessions/YYYY-MM-DD_<topic>.md` |
| 日次ログ（横断） | `Obsidian Vault/50_Daily/YYYY/MM/YYYY-MM-DD.md` |

書き込み後は必ず Vault repo に commit + push:
```bash
(cd "Obsidian Vault" && git add -A && git commit -m "<種別>: <topic>" && git push)
```

## 3. 既知の地雷（Knowledge-DB 固有）

**3 件、うち 2 件は severity high。同じ轍を踏まないこと**:

- 🔴 **UI 修正指示の解釈ミス（3 回再発）**: 「行幅を戻して」と言われ別要素を触る等。
  → **着手前に「対象 / 属性 / 期待値」を 1 行で復唱**
- 🔴 **バッジの水平中心揃え失敗（3 回再発）**: いいね / だめだねバッジで baseline ずれ。
  → 最初から `inline-flex + height:28px + line-height:1 + icon 12px` 適用
- 🟡 **Realtime reconnect ループに仮説提示のみ**: Supabase 不調時は必ず
  `mcp__supabase__get_advisors` と `get_logs` を実行してから返答

## 4. プロジェクト横断の最優先 TOP 4 ルール

1. 🔴 **「ダメ」を 2 回連続で受けたらコード読むまでデプロイ禁止**
2. 🟡 **UI 修正指示は「対象 / 属性 / 期待値」を 1 行復唱してから着手**
3. 🟡 **バッジは `inline-flex + height:28px + icon 12px` をデフォ適用**
4. 🟡 **「Ctrl+Shift+R / unregister」を完了報告に書かない**

## 5. Magic Phrases（強制トリガー）

| フレーズ | 動作 |
|---------|------|
| 「失敗として記録」「ミスに残」 | `Projects/Knowledge-DB/Mistakes/` に作成 + push |
| 「ADR にして」「決定を残」 | `Projects/Knowledge-DB/Decisions/` に作成 + push |
| 「今日のまとめ」「デイリー更新」 | `50_Daily/YYYY/MM/YYYY-MM-DD.md` 更新 + push |
| 「知識に昇格」「Knowledge に」 | `Knowledge/<topic>.md` 作成/更新 + push |
| 「Vault に同期」「push して」 | Vault の commit + push を強制実行 |
| 「過去のミス」「Vault 検索」 | Vault 内を Glob/Grep で検索して要約 |

## 6. このプロジェクトの基本スタック

- React + Vite + TypeScript
- Supabase（DB / Auth / Realtime / **Profiles 統合**）
- Lucide-React Icons
- 添付: MS OneDrive
- デザイン: **Glassmorphism**（半透明 + backdrop-filter）

## 7. その他の規約

- ソートは **作成日降順** で固定、更新で並び替えない
- 一覧カードは `display: grid` + `gridTemplateColumns` で列固定、識別系=左 / 属性系=中央
- 書き込み系は **必ずタイムアウト付き**（通常 15 秒）。supabase-js で詰まるパスは **`rawRest` (PostgREST 直叩き)** を使う
- 応答は簡潔、コードコメントは原則書かない（非自明な WHY のみ）

---

正本は `Obsidian Vault/CLAUDE.md` および `00_Meta/嗜好まとめ.md`。
