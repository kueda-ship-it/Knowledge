-- 運用提議に担当者を追加。
-- assignee_id = profiles.id (未割当 = NULL)、assigned_at = 割当日時 (督促の起点)。
-- 既存 RLS の UPDATE ポリシーで更新できるため、ポリシー追加は不要。

ALTER TABLE public.operational_proposals
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS operational_proposals_assignee_idx
  ON public.operational_proposals (assignee_id);
