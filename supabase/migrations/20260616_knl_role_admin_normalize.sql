-- ナレッジの最上位ロールを旧称 'master' → 共通語彙 'admin' に正規化。
--
-- 方針: 後方互換のため、ロール判定は manager/master/admin の3値を許容（追加のみ・権限剥奪なし）。
--       CHECK 制約に 'admin' を追加し、既存データ master → admin に移行する。
--       'master' も当面は許可・判定対象に残す（移行期の保険）。
--
-- 注意: op_proposals_select は過去に2つの migration で定義されている
--       (20260418_profile_categories_local.sql と 20260418_proposal_visibility_and_profile_category.sql)。
--       本 migration では後勝ち（proposal_visibility 版 = p.category ベース）を踏襲して再作成する。
--       本番の現行定義と差異がないか、適用前に確認すること。

-- 1) CHECK 制約: 'admin' を許可（制約名が異なる環境でも拾えるよう動的に張り替え）
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%knl_role%'
  limit 1;
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_knl_role_check
  check (knl_role = any (array['viewer','user','manager','admin','master']::text[]));

-- 2) RLS ポリシーの role 判定に 'admin' を追加（manager/master/admin）

-- 2a) operational_proposal_comments: UPDATE / DELETE
drop policy if exists op_comments_update on public.operational_proposal_comments;
create policy op_comments_update
  on public.operational_proposal_comments
  for update to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.knl_role in ('manager','master','admin')
    )
  );

drop policy if exists op_comments_delete on public.operational_proposal_comments;
create policy op_comments_delete
  on public.operational_proposal_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.knl_role in ('manager','master','admin')
    )
  );

-- 2b) knowledge_comments: UPDATE / DELETE
drop policy if exists knowledge_comments_update on public.knowledge_comments;
create policy knowledge_comments_update
  on public.knowledge_comments
  for update to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.knl_role in ('manager','master','admin')
    )
  );

drop policy if exists knowledge_comments_delete on public.knowledge_comments;
create policy knowledge_comments_delete
  on public.knowledge_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.knl_role in ('manager','master','admin')
    )
  );

-- 2c) operational_proposals: SELECT（可視性。後勝ち = proposal_visibility 版を踏襲）
drop policy if exists op_proposals_select on public.operational_proposals;
create policy op_proposals_select
  on public.operational_proposals
  for select to authenticated
  using (
    visible_groups is null
    or array_length(visible_groups, 1) is null
    or decision is not null
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.category = any(visible_groups)
          or coalesce(p.knl_role, 'viewer') in ('manager','master','admin')
        )
    )
  );

-- 3) 既存データを master → admin に移行
update public.profiles set knl_role = 'admin' where knl_role = 'master';
