-- 運用提議の可視性制御 + profiles のカテゴリ同期
-- 方針:
--  1) profiles.category (text) を追加し、master_categories.name と同期する "グループ" として扱う
--  2) operational_proposals.visible_groups (text[]) を追加し、未指定=全員公開、指定あり=該当 category のメンバーのみ閲覧可
--  3) decision (決定事項) IS NOT NULL の提議は visible_groups の設定に関わらず常に全員閲覧可
--  4) ナレッジは従来通り全員閲覧可(本マイグレーションでは knowledge 関連は変更しない)

-- 1) profiles にカテゴリカラム追加 (profiles は foreign table のためインデックスは作成しない)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS category text;

-- 2) operational_proposals に公開先グループを追加 (NULL = 全員公開)
ALTER TABLE public.operational_proposals
  ADD COLUMN IF NOT EXISTS visible_groups text[];

CREATE INDEX IF NOT EXISTS operational_proposals_visible_groups_idx
  ON public.operational_proposals USING gin (visible_groups);

-- 3) 既存の "Enable all for authenticated users" ポリシー (ALL) を解体し、CRUD を分割
ALTER TABLE public.operational_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.operational_proposals;

-- 3a) SELECT: 可視性制御
DROP POLICY IF EXISTS op_proposals_select ON public.operational_proposals;
CREATE POLICY op_proposals_select
  ON public.operational_proposals
  FOR SELECT
  TO authenticated
  USING (
    visible_groups IS NULL
    OR array_length(visible_groups, 1) IS NULL
    OR decision IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.category = ANY(visible_groups)
          OR COALESCE(p.knl_role, 'viewer') IN ('manager', 'master')
        )
    )
  );

-- 3b) INSERT: 認証済みなら可 (既存 "Enable all" と同等の寛容さを維持)
DROP POLICY IF EXISTS op_proposals_insert ON public.operational_proposals;
CREATE POLICY op_proposals_insert
  ON public.operational_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3c) UPDATE: 認証済みなら可
DROP POLICY IF EXISTS op_proposals_update ON public.operational_proposals;
CREATE POLICY op_proposals_update
  ON public.operational_proposals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3d) DELETE: 認証済みなら可
DROP POLICY IF EXISTS op_proposals_delete ON public.operational_proposals;
CREATE POLICY op_proposals_delete
  ON public.operational_proposals
  FOR DELETE
  TO authenticated
  USING (true);
