-- created_at バックフィルの再修正。
-- 当初 updated_at をコピーしていたが、それでは「更新したら作成日が進む」状態。
-- knowledge.id は Date.now() のミリ秒で採番されているので、これを真の作成時刻として採用。
-- 念のため knowledge_history.updated_at の最小値ともLEASTを取る。
update public.knowledge k
set created_at = least(
  k.created_at,
  coalesce(
    (select min(h.updated_at) from public.knowledge_history h where h.knowledge_id = k.id),
    k.created_at
  )
);

update public.knowledge
set created_at = least(
  created_at,
  to_timestamp((id::bigint) / 1000.0)
)
where id ~ '^[0-9]{13}$';
