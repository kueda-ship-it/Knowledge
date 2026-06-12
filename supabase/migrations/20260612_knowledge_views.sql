-- ナレッジの閲覧記録。重複カウント防止のため (knowledge_id, user_id, 日) でユニーク。
-- F5 連打で水増しできる単純カウンタではなく「何人に届いたか」を誠実に数える。
-- Realtime publication には入れない (閲覧イベントは高頻度・低価値で WAL 解析負荷だけ増える)。

CREATE TABLE IF NOT EXISTS public.knowledge_views (
  knowledge_id text NOT NULL REFERENCES public.knowledge(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  viewed_on    date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::date),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (knowledge_id, user_id, viewed_on)
);

ALTER TABLE public.knowledge_views ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは閲覧可 (集計表示用)
DROP POLICY IF EXISTS knowledge_views_select ON public.knowledge_views;
CREATE POLICY knowledge_views_select
  ON public.knowledge_views
  FOR SELECT
  TO authenticated
  USING (true);

-- 記録 (INSERT): 自分の閲覧のみ。UPDATE/DELETE ポリシーは作らない (改ざん不可)
DROP POLICY IF EXISTS knowledge_views_insert ON public.knowledge_views;
CREATE POLICY knowledge_views_insert
  ON public.knowledge_views
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 集計ビュー (security_invoker で基表の RLS に従う)
CREATE OR REPLACE VIEW public.knowledge_view_counts
WITH (security_invoker = true) AS
  SELECT
    knowledge_id,
    count(*)::int AS total_views,
    count(DISTINCT user_id)::int AS unique_viewers
  FROM public.knowledge_views
  GROUP BY knowledge_id;
