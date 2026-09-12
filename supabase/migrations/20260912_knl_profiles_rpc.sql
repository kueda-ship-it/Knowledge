-- S2a: profiles（FDW 外部テーブル → 共有 Supabase の postgres 接続）への書き込みを RPC に寄せる
-- 外部テーブルには RLS を掛けられず、anon / authenticated に DML が付いていたため、
-- Knowledge の anon キーだけで共有 profiles の全行・全列（dm_role / role / position 等）を書き換えられた。
-- この migration では RPC を足すだけで、既存の動作は変えない。権限の剥奪は S2b（コード差し替えのデプロイ後）。
-- 決定: Obsidian Vault 20_Decisions/2026-09-11_profiles権限列の自己書き換え防止

-- 初回ログイン時のプロフィール確保（AuthContext の claim / insert の置き換え）
create or replace function public.knl_claim_profile()
returns setof public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_meta  jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_match uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    select count(*), min(id::text)::uuid into v_count, v_match
      from public.profiles where v_email is not null and lower(email) = v_email;

    if v_count = 1 then
      -- 事前登録行の claim。ilike ではなく完全一致（'_' がワイルドカードになるのを避ける）
      update public.profiles
         set id = v_uid,
             display_name = coalesce(nullif(display_name, ''), v_meta ->> 'full_name', split_part(v_email, '@', 1)),
             avatar_url   = coalesce(avatar_url, v_meta ->> 'avatar_url'),
             updated_at   = now()
       where id = v_match;
    elsif v_count = 0 then
      insert into public.profiles (id, email, display_name, avatar_url, knl_role)
      values (v_uid, v_email,
              coalesce(v_meta ->> 'full_name', split_part(v_email, '@', 1), '新規ユーザー'),
              v_meta ->> 'avatar_url', 'viewer');
    else
      raise exception 'multiple profiles share email %', v_email using errcode = 'P0001';
    end if;
  end if;

  return query select * from public.profiles where id = v_uid;
end;
$$;

-- ユーザーマスタ保存（client.ts updateMasters の Sync Users の置き換え）
-- p_users: [{ "id": "<uuid | new-xxx>", "email": "...", "name": "...", "role": "viewer|user|manager|admin|master" }]
-- 変化の無い行は書かない。manager 以上のロールを付ける・外すのは admin/master のみ
create or replace function public.knl_update_masters(p_users jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  text;
  v_is_top  boolean;
  u         jsonb;
  v_id      uuid;
  v_role    text;
  v_name    text;
  v_email   text;
  cur_name  text;
  cur_role  text;
begin
  select knl_role into v_caller from public.profiles where id = auth.uid();
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
      select id into v_id from public.profiles where lower(email) = v_email limit 1;
      if v_id is null then
        if v_role in ('manager', 'admin', 'master') and not v_is_top then
          raise exception 'permission denied: only admin can grant %', v_role using errcode = '42501';
        end if;
        insert into public.profiles (id, email, display_name, knl_role, updated_at)
        values (gen_random_uuid(), v_email, v_name, v_role, now());
        continue;
      end if;
    else
      v_id := (u ->> 'id')::uuid;
    end if;

    select display_name, knl_role into cur_name, cur_role from public.profiles where id = v_id;
    if not found then
      raise exception 'profile not found: %', v_id using errcode = 'P0002';
    end if;

    if cur_name is not distinct from v_name and cur_role is not distinct from v_role then
      continue;
    end if;

    if cur_role is distinct from v_role and not v_is_top
       and (v_role in ('manager', 'admin', 'master') or cur_role in ('manager', 'admin', 'master')) then
      raise exception 'permission denied: only admin can change knl_role % -> %', cur_role, v_role using errcode = '42501';
    end if;

    -- email は変更しない（共有 profiles の email は他アプリの突合・threads 更新判定に使われている）
    update public.profiles
       set display_name = v_name, knl_role = v_role, updated_at = now()
     where id = v_id;
  end loop;
end;
$$;

-- public スキーマの既定 ACL で anon にも EXECUTE が付くため明示的に外す
revoke all on function public.knl_claim_profile()          from public, anon;
revoke all on function public.knl_update_masters(jsonb)    from public, anon;
grant execute on function public.knl_claim_profile()       to authenticated;
grant execute on function public.knl_update_masters(jsonb) to authenticated;

-- ロールバック
-- drop function if exists public.knl_update_masters(jsonb);
-- drop function if exists public.knl_claim_profile();
