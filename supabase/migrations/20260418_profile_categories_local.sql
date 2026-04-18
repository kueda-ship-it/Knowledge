-- profiles は foreign table (FDW) のため、ローカル列を追加しても remote 側に
-- 該当カラムが無く SELECT 時に 42703 エラーになる。
-- category はローカルの独立テーブルで持ち、profiles とは user_id で紐付ける。

-- 1. category 列に依存する古いポリシーを先に削除してから、foreign table の列を除去
DROP POLICY IF EXISTS op_proposals_select ON public.operational_proposals;
ALTER FOREIGN TABLE public.profiles DROP COLUMN IF EXISTS category;

-- 2. ローカルの profile_categories テーブル
CREATE TABLE IF NOT EXISTS public.profile_categories (
    user_id    uuid PRIMARY KEY,
    category   text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: 認証済みなら全件参照可（fetchMasters 相当）
DROP POLICY IF EXISTS profile_categories_select ON public.profile_categories;
CREATE POLICY profile_categories_select
    ON public.profile_categories FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE: 認証済みならOK（管理画面/設定モーダルから更新）
DROP POLICY IF EXISTS profile_categories_insert ON public.profile_categories;
CREATE POLICY profile_categories_insert
    ON public.profile_categories FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS profile_categories_update ON public.profile_categories;
CREATE POLICY profile_categories_update
    ON public.profile_categories FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS profile_categories_delete ON public.profile_categories;
CREATE POLICY profile_categories_delete
    ON public.profile_categories FOR DELETE
    TO authenticated
    USING (true);

-- 3. operational_proposals の可視性 RLS を profile_categories ベースに書き換え
DROP POLICY IF EXISTS op_proposals_select ON public.operational_proposals;
CREATE POLICY op_proposals_select
    ON public.operational_proposals FOR SELECT
    TO authenticated
    USING (
        visible_groups IS NULL
        OR array_length(visible_groups, 1) IS NULL
        OR decision IS NOT NULL
        OR EXISTS (
            SELECT 1 FROM public.profile_categories pc
            WHERE pc.user_id = auth.uid()
              AND pc.category = ANY(visible_groups)
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.knl_role, 'viewer') IN ('manager', 'master')
        )
    );
