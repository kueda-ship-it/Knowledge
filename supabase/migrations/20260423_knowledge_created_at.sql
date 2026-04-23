-- knowledge 一覧を「作成順」で並べるため created_at を追加。
-- 既存行は updated_at で暫定バックフィル（既存並びと一致）。
alter table public.knowledge
  add column if not exists created_at timestamptz not null default now();

update public.knowledge
  set created_at = updated_at
  where created_at is distinct from updated_at
    and updated_at is not null;
