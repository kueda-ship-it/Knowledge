-- 運用提議 → Task Pilot 即時同期用の Webhook。
--
-- 提議 / 問題点が変わったら Task Pilot 側の Edge Function `tm-knowledge-sync` を
-- pg_net で叩く。Task Pilot 側はそれを受けてタスク・チェック項目を作り直す。
-- 逆方向（Task Pilot → 提議）は Edge Function が service_role で直接書きに来るので、
-- こちら側に必要なのは「変更を知らせる」ことだけ。
--
-- 適用後、URL と共有シークレットを登録すること（値は本人が入れる）:
--   insert into public.taskpilot_sync_config (key, value) values
--     ('taskpilot_sync_url', 'https://bvhfmwrjrrqrpqvlzkyd.supabase.co/functions/v1/tm-knowledge-sync'),
--     ('sync_secret',        '<TM_SYNC_SECRET と同じ値>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- 同じシークレットを Task Pilot 側 Supabase の Edge Function secret `TM_SYNC_SECRET` と
-- Task Pilot DB の tm_sync_config にも登録する。

create extension if not exists pg_net with schema extensions;

-- 設定テーブル。RLS 有効・ポリシー無し = service_role とトリガ (security definer) だけが読める
create table if not exists public.taskpilot_sync_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.taskpilot_sync_config enable row level security;

create or replace function public.notify_taskpilot_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_rec    jsonb;
begin
  select value into v_url    from public.taskpilot_sync_config where key = 'taskpilot_sync_url';
  select value into v_secret from public.taskpilot_sync_config where key = 'sync_secret';
  if v_url is null or v_secret is null then
    return null;  -- 未設定なら同期オフ（本体の動作には影響させない）
  end if;

  v_rec := to_jsonb(coalesce(NEW, OLD));

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    body    := jsonb_build_object(
                 'mode',   'webhook',
                 'table',  TG_TABLE_NAME,
                 'op',     TG_OP,
                 'record', v_rec
               )
  );
  return null;
exception when others then
  -- 同期の失敗で提議の更新自体を失敗させない
  raise warning 'notify_taskpilot_sync failed: %', sqlerrm;
  return null;
end $$;

drop trigger if exists operational_proposals_taskpilot_sync on public.operational_proposals;
create trigger operational_proposals_taskpilot_sync
  after insert or delete
     or update of assignee_id, status, title, priority, category, source_no, problem, proposal, decision
  on public.operational_proposals
  for each row execute function public.notify_taskpilot_sync();

drop trigger if exists operational_proposal_problems_taskpilot_sync on public.operational_proposal_problems;
create trigger operational_proposal_problems_taskpilot_sync
  after insert or delete
     or update of body, done, assignee_id, sort_order
  on public.operational_proposal_problems
  for each row execute function public.notify_taskpilot_sync();
