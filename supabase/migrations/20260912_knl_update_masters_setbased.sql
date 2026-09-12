-- knl_update_masters の statement timeout 対策
-- 外部テーブル profiles は 1 行ずつ読むたびに共有 Supabase への遠隔クエリになる（実測: 1 回約 0.19 秒）。
-- 204 人分を 1 行ずつ読んでいたため authenticated の statement_timeout（8 秒）を超え、本番の保存が失敗した。
--   1. 現在値は 1 回の走査でまとめて読む（実測: 202 人・変更なしで 0.36 秒）
--   2. UPDATE の値は変数で渡す。now() を直接書くと postgres_fdw がリモートに押し込めず、
--      「全列 SELECT … FOR UPDATE ＋ ctid 指定の UPDATE」の 2 往復になる（実測: 1 行 0.46 秒 → 変数渡しで 0.09 秒）
-- 画面側は変化のあった行だけを 15 人ずつ送る（1 回あたり最大約 1.8 秒）。
-- 判定ルール（manager 以上のロールの付与・変更は admin/master のみ、email は変更しない）は 20260912_knl_profiles_rpc.sql と同じ。

create or replace function public.knl_update_masters(p_users jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_now      timestamptz := now();
  v_by_id    jsonb;
  v_by_email jsonb;
  v_caller   text;
  v_is_top   boolean;
  u          jsonb;
  cur        jsonb;
  v_id       uuid;
  v_role     text;
  v_name     text;
  v_email    text;
  cur_role   text;
begin
  select coalesce(jsonb_object_agg(id::text, jsonb_build_object('name', display_name, 'role', knl_role)), '{}'::jsonb),
         coalesce(jsonb_object_agg(lower(email), id::text) filter (where coalesce(email, '') <> ''), '{}'::jsonb)
    into v_by_id, v_by_email
    from public.profiles;

  v_caller := v_by_id -> coalesce(v_uid::text, '') ->> 'role';
  if coalesce(v_caller, '') not in ('manager', 'master', 'admin') then
    raise exception 'permission denied: knowledge manager or above required' using errcode = '42501';
  end if;
  v_is_top := v_caller in ('master', 'admin');

  for u in select * from jsonb_array_elements(coalesce(p_users, '[]'::jsonb)) loop
    v_role := u ->> 'role';
    v_name := u ->> 'name';
    if coalesce(v_role, '') not in ('viewer', 'user', 'manager', 'admin', 'master') then
      raise exception 'invalid knl_role: %', v_role using errcode = '22023';
    end if;

    v_id := null;
    if coalesce(u ->> 'id', '') like 'new-%' then
      v_email := lower(trim(u ->> 'email'));
      if coalesce(v_email, '') = '' then
        raise exception 'email is required for new user' using errcode = '22023';
      end if;
      v_id := (v_by_email ->> v_email)::uuid;
      if v_id is null then
        if v_role in ('manager', 'admin', 'master') and not v_is_top then
          raise exception 'permission denied: only admin can grant %', v_role using errcode = '42501';
        end if;
        insert into public.profiles (id, email, display_name, knl_role, updated_at)
        values (gen_random_uuid(), v_email, v_name, v_role, v_now);
        continue;
      end if;
    else
      v_id := (u ->> 'id')::uuid;
    end if;

    cur := v_by_id -> v_id::text;
    if cur is null then
      raise exception 'profile not found: %', v_id using errcode = 'P0002';
    end if;
    cur_role := cur ->> 'role';

    if (cur ->> 'name') is not distinct from v_name and cur_role is not distinct from v_role then
      continue;
    end if;

    if cur_role is distinct from v_role and not v_is_top
       and (v_role in ('manager', 'admin', 'master') or cur_role in ('manager', 'admin', 'master')) then
      raise exception 'permission denied: only admin can change knl_role % -> %', cur_role, v_role using errcode = '42501';
    end if;

    -- email は変更しない（共有 profiles の email は他アプリの突合・threads 更新判定に使われている）
    update public.profiles
       set display_name = v_name, knl_role = v_role, updated_at = v_now
     where id = v_id;
  end loop;
end;
$$;

revoke all on function public.knl_update_masters(jsonb)    from public, anon;
grant execute on function public.knl_update_masters(jsonb) to authenticated;

-- ロールバック: 20260912_knl_profiles_rpc.sql の knl_update_masters をそのまま再実行する
