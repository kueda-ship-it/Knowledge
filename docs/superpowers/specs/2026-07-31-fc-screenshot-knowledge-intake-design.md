# FC スクリーンショット → ナレッジ自動取り込み 設計書

- 日付: 2026-07-31
- ステータス: approved（設計承認済み、実装前）
- 対象リポジトリ: Knowledge (Knowledge-DB)

## 背景 / 目的

FC（フルタイムシステム社内 Web、例: `chk_irai.php` の障害対応要請/報告書・対応結果画面)の
スクリーンショットを貼り付けるだけで、Knowledge DB にナレッジ（題名 / 事象 / 対処 / 添付画像）を
蓄積できるようにする。現状は画面を見ながら手で転記しており、登録の手間が障壁になっている。

## スコープ（ユーザー確認済みの決定）

1. **入口は両方**: (a) ナレッジ新規作成フォーム（Editor）への貼り付け、(b) AI チャットへの画像添付
2. **Editor 貼り付け時は即自動で AI 読み取り**（ボタン押下不要）
3. **複数枚スクショはまとめて 1 ナレッジ**として統合読み取り（2 枚目以降は既入力値とマージ）

## 全体アーキテクチャ

```
[Editor 貼り付け/D&D]
   ├─ OneDrive アップロード（既存 useOneDriveUpload）→ attachments に追加
   └─ extract-knowledge Edge Function（新設、Gemini 2.5 Flash vision)
        → KnowledgeDraft JSON → 空欄フィールドにのみ反映

[AI チャット画像添付]
   └─ gemini-chat Edge Function（既存を拡張: images 対応）
        → create_knowledge アクション（既存の確認ボタン UI）
        → 確定時に画像を OneDrive へアップロードし attachments に含めて保存
```

DB スキーマ変更: **なし**（knowledge.attachments / 各フィールドは既存のまま）。

## コンポーネント別設計

### 1. Edge Function `extract-knowledge`（新設）

`supabase/functions/extract-knowledge/index.ts`。gemini-chat と同じ構成
（Deno serve / CORS / GEMINI_API_KEY 共用 / JSON 出力 + サニタイズ）。

**リクエスト**:

```ts
{
  images: Array<{ mimeType: string; data: string }>; // base64（プレフィックスなし）
  current: Partial<KnowledgeDraft>;   // 現在のフォーム入力値（マージ判断は LLM ではなくクライアント側で行うが、統合読み取りの文脈として渡す）
  masters: { categories: string[]; incidents: string[] }; // 既存マスタから選ばせる
}
```

**レスポンス**: `{ draft: KnowledgeDraft }`。`draft.title` が空なら 422 相当のエラー JSON。
サニタイズは gemini-chat の `sanitizeAction` と同パターン（許可フィールドのみ、enum 検証）。

**プロンプト要点**（FC 報告画面向けフィールドマッピング）:

| ナレッジ側 | 抽出元 |
|---|---|
| title | 現地障害内容 + 対象・原因の要約（例:「フルタイムロッカー 全扉開かず（F7 ヒューズ切れ・列基板焦げ）」） |
| phenomenon（事象） | 備考欄（現地症状）の要約 |
| countermeasure（対処） | 備考欄（処置内容）の要約。今後の対応条件（例: IF1 承認不可時はヒューズ交換要）も含める |
| machine | 「フルタイムロッカー」等を画面から推定 |
| category / incidents | masters の選択肢に一致するもののみ。判断不能なら省略 |
| tags | 症状・部品名など 3〜5 個（例: ヒューズ切れ, 列基板, 荷有り表示） |
| status | 対応完了が読み取れれば solved、一次対応止まり・部品交換待ちなら unsolved |
| recordType | 常に 'trouble' |

制約: 画像は最大 5 枚。読み取れない場合は draft を空にせず読める範囲で返す。

### 2. Editor（`src/components/Editor.tsx`）

- フォーム領域に `onPaste`（クリップボード画像）と `onDrop`（画像ファイル）を追加。
  既存の添付ファイル選択からの画像追加でも同じ抽出フローに乗せる。
- 貼り付け時の処理（並行実行）:
  1. 既存 `uploadFile` で OneDrive へ → `attachments` に追加（既存 UI で表示・削除可能）
  2. 画像をクライアント側で縮小（長辺 1600px / JPEG 品質 0.85）して base64 化し、
     セッション中の貼り付け画像リスト（state）に蓄積。**毎回、全画像 + 現在の入力値**を
     `extract-knowledge` へ送信（統合読み取り）
- **マージルール（クライアント側で適用)**: 返ってきた draft は**空欄のフィールドにのみ**反映。
  手入力済み・前回反映済みの値は上書きしない。
  例外: `status` はユーザーが手で切り替えていない場合のみ AI 判定を反映
  （`statusTouched` フラグで管理）。`tags` / `incidents` は空のときのみセット。
- UI 状態: 読み取り中はフォーム上部にバナー「AI がスクリーンショットを読み取り中…」
  （スピナー付き）。完了時にバナーを 2 秒間「読み取り完了 — 内容を確認してください」に。
  失敗時は `alert`（添付アップロード自体は成功のまま維持）。
- 呼び出しは **30 秒タイムアウト**（`Promise.race`、既存 `chatWithGemini` と同パターン）。
- 読み取り中でもフォーム編集・保存はブロックしない。保存後に返ってきた抽出結果は破棄する。

### 3. gemini-chat 拡張 + AI チャット UI

- `supabase/functions/gemini-chat/index.ts`: `ChatRequest` に
  `images?: Array<{ mimeType: string; data: string }>` を追加。最後の user メッセージの
  `parts` に `inline_data` として付与。システムプロンプトに
  「画像（FC 障害報告画面等）が添付された場合は内容を読み取り、ナレッジ登録意図なら
  create_knowledge の draft を抽出フィールドで埋めて返す」を追記。
- `AIChatPopover.tsx`: 入力欄横に画像添付ボタン（Lucide `ImagePlus`）+ 入力欄への
  ペースト対応。添付済み画像はサムネイルチップ（削除可）で表示。
  `onChatSend(text, images?)` にシグネチャ拡張（text 空でも画像があれば送信可）。
- `App.tsx handleChatSend` / `apiClient.chatWithGemini`: images をそのまま Edge Function へ
  中継。`create_knowledge` アクション確定時、その送信に使った画像（縮小前の元 File を
  メッセージ id に紐付けて保持）を OneDrive にアップロードし、`attachments` に含めて保存。
  OneDrive 未認証などでアップロード失敗した場合はナレッジ本体のみ保存し、
  「画像の添付に失敗しました」と通知。

### 4. エラーハンドリング / 制約まとめ

- 書き込み系は既存規約どおりタイムアウト付き。抽出（読み取り）失敗はナレッジ登録を
  ブロックしない（添付だけ残って手入力で続行できる）。
- 画像は縮小後 1 枚あたり概ね 500KB 以下を想定。5 枚超の貼り付けは古い順に抽出対象から
  外す（添付としては保持）。
- Edge Function は認証ヘッダ（既存 supabase.functions.invoke 経由）以外の新規権限不要。

## テスト方針

- `extract-knowledge`: サニタイズ関数を純関数として切り出し、不正 JSON / enum 外の値 /
  title 欠落のケースをユニットテスト（既存テスト構成 `src/utils/cache.test.ts` と同じ vitest）。
- Editor マージルール: `mergeDraft(current, draft, statusTouched)` を純関数として切り出して
  ユニットテスト（空欄のみ埋める / status 例外 / tags・incidents の扱い）。
- E2E 相当は手動確認: 実際の FC スクショ（1 枚 / 複数枚 / 手入力後の追い貼り）で
  フォーム反映と添付を確認。チャット側は画像のみ送信 → create_knowledge 確認 → 保存まで。

## 実装順序（目安）

1. `extract-knowledge` Edge Function + サニタイズのユニットテスト
2. 画像縮小・base64 ユーティリティ + `mergeDraft` + テスト
3. Editor への貼り付け/D&D + 自動抽出 + バナー UI
4. gemini-chat の images 対応 + AIChatPopover の添付 UI + 確定時添付保存
5. 手動 E2E → デプロイ（Edge Function は `supabase functions deploy`）
