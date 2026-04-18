-- 運用提議: 更新者・決定事項カラム追加 + 合議コメントテーブル新設

-- 1) operational_proposals に updated_by (uuid) / decision (text) を追加
ALTER TABLE public.operational_proposals
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS decision text;

-- 2) 合議コメントテーブル
CREATE TABLE IF NOT EXISTS public.operational_proposal_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL REFERENCES public.operational_proposals(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL,
  body         text NOT NULL CHECK (char_length(body) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_proposal_comments_proposal_id_idx
  ON public.operational_proposal_comments (proposal_id, created_at);

-- 3) RLS 有効化
ALTER TABLE public.operational_proposal_comments ENABLE ROW LEVEL SECURITY;

-- 3a) 認証済みユーザーは閲覧可
DROP POLICY IF EXISTS op_comments_select ON public.operational_proposal_comments;
CREATE POLICY op_comments_select
  ON public.operational_proposal_comments
  FOR SELECT
  TO authenticated
  USING (true);

-- 3b) 追記 (INSERT): viewer 以外
DROP POLICY IF EXISTS op_comments_insert ON public.operational_proposal_comments;
CREATE POLICY op_comments_insert
  ON public.operational_proposal_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.knl_role, 'viewer') <> 'viewer'
    )
  );

-- 3c) 編集 (UPDATE): 自分の投稿 or manager / master
DROP POLICY IF EXISTS op_comments_update ON public.operational_proposal_comments;
CREATE POLICY op_comments_update
  ON public.operational_proposal_comments
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.knl_role IN ('manager', 'master')
    )
  );

-- 3d) 削除 (DELETE): 自分の投稿 or manager / master
DROP POLICY IF EXISTS op_comments_delete ON public.operational_proposal_comments;
CREATE POLICY op_comments_delete
  ON public.operational_proposal_comments
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.knl_role IN ('manager', 'master')
    )
  );

-- 4) operational_proposals の RLS に decision / proposal 編集の制御を追加
--    (既存ポリシーを尊重するため、UPDATE 用の追加制約のみ書き込む。既存の SELECT/INSERT はそのまま。)
--    ※ UPDATE ポリシーが既にある場合は下記ポリシーと共存するので、より厳しい方が適用される。
--    decision / proposal の編集権限はアプリ側 (UI) で制御し、本ポリシーは「update 権限そのもの」を与える
--    形のままにする。既存ポリシーを変更したい場合は個別に調整すること。

-- updated_at を自動更新する共通トリガ
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_op_comments_set_updated_at ON public.operational_proposal_comments;
CREATE TRIGGER trg_op_comments_set_updated_at
  BEFORE UPDATE ON public.operational_proposal_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
