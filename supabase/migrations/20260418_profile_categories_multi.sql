-- ユーザーは複数グループに所属できるようにする。
-- 既存 PK (user_id) を複合 PK (user_id, category) に置き換え。
ALTER TABLE public.profile_categories DROP CONSTRAINT profile_categories_pkey;
ALTER TABLE public.profile_categories
    ALTER COLUMN category SET NOT NULL,
    ADD PRIMARY KEY (user_id, category);

-- user_id 単独での検索用インデックス (RLS EXISTS クエリで使われる)
CREATE INDEX IF NOT EXISTS profile_categories_user_id_idx
    ON public.profile_categories (user_id);
