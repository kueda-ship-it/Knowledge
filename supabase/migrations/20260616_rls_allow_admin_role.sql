-- knl_role が 'master' → 'admin' に正規化されたが、既存 RLS は manager/master のみ許可で
-- admin が DB レベルの昇格権限を失っていた。本番の現行ポリシー定義を踏襲したまま 'admin' を追加する。
-- (op_proposals_select は profile_categories ベースの現行構造を維持。INSERT 系・problems は
--  「viewer 以外」判定なので admin はそのまま通り、変更不要。)

-- knowledge_comments: UPDATE / DELETE
drop policy if exists knowledge_comments_update on public.knowledge_comments;
create policy knowledge_comments_update on public.knowledge_comments
  for update to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.knl_role = any (array['manager','master','admin'])));

drop policy if exists knowledge_comments_delete on public.knowledge_comments;
create policy knowledge_comments_delete on public.knowledge_comments
  for delete to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.knl_role = any (array['manager','master','admin'])));

-- operational_proposal_comments: UPDATE / DELETE
drop policy if exists op_comments_update on public.operational_proposal_comments;
create policy op_comments_update on public.operational_proposal_comments
  for update to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.knl_role = any (array['manager','master','admin'])));

drop policy if exists op_comments_delete on public.operational_proposal_comments;
create policy op_comments_delete on public.operational_proposal_comments
  for delete to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.knl_role = any (array['manager','master','admin'])));

-- operational_proposals: SELECT (可視性。現行の profile_categories ベース構造を維持して admin を追加)
drop policy if exists op_proposals_select on public.operational_proposals;
create policy op_proposals_select on public.operational_proposals
  for select to authenticated
  using (
    visible_groups is null
    or array_length(visible_groups, 1) is null
    or decision is not null
    or exists (select 1 from public.profile_categories pc
                 where pc.user_id = auth.uid() and pc.category = any (operational_proposals.visible_groups))
    or exists (select 1 from public.profiles p
                 where p.id = auth.uid() and coalesce(p.knl_role,'viewer') = any (array['manager','master','admin']))
  );
