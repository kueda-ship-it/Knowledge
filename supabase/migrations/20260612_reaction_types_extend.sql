-- リアクション種別を SNS 風に拡張: like / wrong に加えて helpful (助かった) /
-- insight (なるほど) / awesome (すごい) を許可する。既存行はそのまま有効。

-- 1) type の CHECK 制約を付け替え
ALTER TABLE public.knowledge_reactions
  DROP CONSTRAINT IF EXISTS knowledge_reactions_type_check;
ALTER TABLE public.knowledge_reactions
  ADD CONSTRAINT knowledge_reactions_type_check
  CHECK (type IN ('like', 'wrong', 'helpful', 'insight', 'awesome'));

-- 2) 1ユーザー1ナレッジ1リアクション (排他トグル) を DB でも保証。
--    アプリは排他トグル実装済みのため違反行は無い想定だが、念のため古い方を削除してから付与。
DELETE FROM public.knowledge_reactions a
  USING public.knowledge_reactions b
  WHERE a.knowledge_id = b.knowledge_id
    AND a.user_id = b.user_id
    AND a.created_at < b.created_at;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_reactions_one_per_user'
  ) THEN
    ALTER TABLE public.knowledge_reactions
      ADD CONSTRAINT knowledge_reactions_one_per_user UNIQUE (knowledge_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_reactions_knowledge_idx
  ON public.knowledge_reactions (knowledge_id);
