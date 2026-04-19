-- 既存本番DBにはあるが、マイグレーションが未コミットだったマスタテーブルを追跡下に置く。
-- 本番はすでに存在するため IF NOT EXISTS で冪等化し、新規環境でも再現できるようにする。

-- 区分マスタ (公開先グループや運用提議の可視性で使用)
CREATE TABLE IF NOT EXISTS public.master_categories (
    name text PRIMARY KEY
);

ALTER TABLE public.master_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access master_categories" ON public.master_categories;
CREATE POLICY "Authenticated users can access master_categories"
    ON public.master_categories FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 障害種別マスタ (ナレッジの incident セレクトで使用)
CREATE TABLE IF NOT EXISTS public.master_incidents (
    name text PRIMARY KEY
);

ALTER TABLE public.master_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access master_incidents" ON public.master_incidents;
CREATE POLICY "Authenticated users can access master_incidents"
    ON public.master_incidents FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
