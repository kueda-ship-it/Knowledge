-- 問題点チェックリストの項目ごとに担当者を割り当てられるようにする。
-- assignee_id = profiles.id (未割当 = NULL)。既存 RLS の UPDATE ポリシーで更新可。

ALTER TABLE public.operational_proposal_problems
  ADD COLUMN IF NOT EXISTS assignee_id uuid;
