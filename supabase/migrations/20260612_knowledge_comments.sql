-- ナレッジへのコメント (SNS 化)。operational_proposal_comments と同じ流儀。
-- knowledge.id は text 型のため FK も text。

CREATE TABLE IF NOT EXISTS public.knowledge_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id text NOT NULL REFERENCES public.knowledge(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL,
  body         text NOT NULL CHECK (char_length(body) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_comments_knowledge_id_idx
  ON public.knowledge_comments (knowledge_id, created_at);

ALTER TABLE public.knowledge_comments ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは閲覧可
DROP POLICY IF EXISTS knowledge_comments_select ON public.knowledge_comments;
CREATE POLICY knowledge_comments_select
  ON public.knowledge_comments
  FOR SELECT
  TO authenticated
  USING (true);

-- 追記 (INSERT): viewer 以外
DROP POLICY IF EXISTS knowledge_comments_insert ON public.knowledge_comments;
CREATE POLICY knowledge_comments_insert
  ON public.knowledge_comments
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

-- 編集 (UPDATE): 自分の投稿 or manager / master
DROP POLICY IF EXISTS knowledge_comments_update ON public.knowledge_comments;
CREATE POLICY knowledge_comments_update
  ON public.knowledge_comments
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

-- 削除 (DELETE): 自分の投稿 or manager / master
DROP POLICY IF EXISTS knowledge_comments_delete ON public.knowledge_comments;
CREATE POLICY knowledge_comments_delete
  ON public.knowledge_comments
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

-- updated_at 自動更新 (set_updated_at は提議コメントの migration で作成済みだが念のため再定義)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_comments_set_updated_at ON public.knowledge_comments;
CREATE TRIGGER trg_knowledge_comments_set_updated_at
  BEFORE UPDATE ON public.knowledge_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime publication への追加 (入れ忘れると購読しても通知が来ない)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'knowledge_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_comments;
  END IF;
END $$;
