-- Knowledge のログイン ID（この DB の auth.users.id）を共有 profiles.id にそろえる
-- 共有 profiles（bvhf・FDW）の id を書き換えるのをやめる。
-- 経緯: 2026-10-16 黒川さんが入れなかった。knl_claim_profile が共有 profiles の主キーを Knowledge 側の新しい uid に
--       書き換えようとして check_submissions の外部キーに拒否された。通っていれば共有側（Contact-Team-Manager 等）で
--       本人のプロフィールが消えていた。bvhf の profiles は約 80 本の外部キーから参照されている。
-- 方針:
--   1. 事前作成: 共有側の Azure ユーザーを、同じ id・同じ Azure の provider_id で Knowledge の auth に写しておく
--      （Azure のアプリ登録は共通で provider_id が一致する。初回ログインでそのまま共有 id のユーザーになる）
--   2. 付け替え: それでも新しい uid でログインした人は、Knowledge 側の auth ユーザーの id を共有 id に付け替え、
--      画面側で Microsoft にサインインし直させる
--   3. knl_claim_profile は共有 profiles の id を書き換えない（メール一致・id 違いは KN001 で止める）
-- Vault: Projects/Knowledge-DB/Sessions/2026-10-16_黒川さんがログインできない（profiles ID の書き換えが FK で拒否）.md

create schema if not exists knl_private;
revoke all on schema knl_private from public, anon, authenticated;

-- 共有側（bvhf）の auth を読むための外部テーブル。knl_private は API に出さない
create foreign table if not exists knl_private.shared_auth_users (
  id                 uuid,
  email              text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  banned_until       timestamptz,
  deleted_at         timestamptz
) server old_kueda options (schema_name 'auth', table_name 'users');

create foreign table if not exists knl_private.shared_auth_identities (
  user_id       uuid,
  provider      text,
  provider_id   text,
  identity_data jsonb
) server old_kueda options (schema_name 'auth', table_name 'identities');

revoke all on knl_private.shared_auth_users, knl_private.shared_auth_identities from public, anon, authenticated;

-- 1. 事前作成。Knowledge 側に id・メール・Azure の provider_id のどれかが既にある人は触らない（付け替えは 2. の役目）
--    FDW は 1 回ずつまとめて読む（行ごとに読むと statement_timeout になる。2026-09-12 のミス）
create or replace function knl_private.knl_provision_auth_users()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  with src as materialized (
    select u.id, lower(u.email) as email, u.email_confirmed_at, u.raw_user_meta_data,
           i.provider_id, i.identity_data
      from knl_private.shared_auth_users u
      join knl_private.shared_auth_identities i on i.user_id = u.id and i.provider = 'azure'
     where u.deleted_at is null
       and (u.banned_until is null or u.banned_until < now())
       and coalesce(u.email, '') <> ''
  ), targets as (
    select s.* from src s
     where exists (select 1 from public.profiles p where p.id = s.id)
       and not exists (select 1 from src d where d.email = s.email and d.id <> s.id)
       and not exists (select 1 from auth.users k where k.id = s.id or lower(k.email) = s.email)
       and not exists (select 1 from auth.identities k where k.provider = 'azure' and k.provider_id = s.provider_id)
  ), new_users as (
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous
    )
    select distinct on (t.id)
      '00000000-0000-0000-0000-000000000000', t.id, 'authenticated', 'authenticated', t.email,
      coalesce(t.email_confirmed_at, now()),
      '{"provider": "azure", "providers": ["azure"]}'::jsonb, coalesce(t.raw_user_meta_data, '{}'::jsonb), now(), now(),
      '', '', '', '', '', '', '', '',
      false, false
      from targets t
     order by t.id
    returning id
  )
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select distinct on (t.provider_id) t.provider_id, t.id, t.identity_data, 'azure', now(), now()
    from targets t
   where t.id in (select id from new_users)
   order by t.provider_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Knowledge の auth ユーザーの id を付け替える（identities は付け直し、セッションは捨てる）
create or replace function knl_private.knl_move_auth_user(p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identities jsonb;
  v_rows int;
begin
  if p_old = p_new then
    return;
  end if;
  if exists (select 1 from auth.users where id = p_new) then
    raise exception 'auth user % already exists', p_new using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) - 'email'), '[]'::jsonb) into v_identities
    from auth.identities i where i.user_id = p_old;

  delete from auth.sessions        where user_id = p_old;
  delete from auth.refresh_tokens  where user_id = p_old::text;
  delete from auth.one_time_tokens where user_id = p_old;
  delete from auth.identities      where user_id = p_old;

  update auth.users set id = p_new, updated_at = now() where id = p_old;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'auth user % not found', p_old using errcode = 'P0002';
  end if;

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select (r ->> 'id')::uuid, r ->> 'provider_id', p_new, r -> 'identity_data', r ->> 'provider',
         (r ->> 'last_sign_in_at')::timestamptz, (r ->> 'created_at')::timestamptz, now()
    from jsonb_array_elements(v_identities) r;
end;
$$;

revoke all on function knl_private.knl_provision_auth_users()      from public, anon, authenticated;
revoke all on function knl_private.knl_move_auth_user(uuid, uuid)  from public, anon, authenticated;

-- 2. 付け替え（ログイン中の本人だけ）。戻り値: ok = そろっている / none = 共有側に本人の行なし / realigned = 付け替えた
--    realigned のあと、今のセッションは使えないので画面側でサインインし直す
--    Azure 以外（メール＋パスワード）のアカウントは自動で付け替えない
create or replace function public.knl_realign_auth_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_target uuid;
  v_count  int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    return 'ok';
  end if;

  select count(*), min(id::text)::uuid into v_count, v_target
    from public.profiles where v_email is not null and lower(email) = v_email;

  if v_count = 0 then
    return 'none';
  elsif v_count > 1 then
    raise exception 'multiple profiles share email %', v_email using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.identities where user_id = v_uid and provider = 'azure')
     or exists (select 1 from auth.identities where user_id = v_uid and provider <> 'azure') then
    raise exception 'Knowledge のアカウントと社員マスタの ID がそろっていません（Microsoft 以外のサインイン）。Admin に連絡してください。'
      using errcode = 'KN001';
  end if;
  if exists (select 1 from auth.users where id = v_target) then
    raise exception 'Knowledge のアカウントと社員マスタの ID がそろっていません（同じ ID の別アカウントあり）。Admin に連絡してください。'
      using errcode = 'KN001';
  end if;

  perform knl_private.knl_move_auth_user(v_uid, v_target);
  return 'realigned';
end;
$$;

revoke all on function public.knl_realign_auth_id() from public, anon;
grant execute on function public.knl_realign_auth_id() to authenticated;

-- 3. claim は共有 profiles の id を書き換えない。新規作成（共有側に本人の行が無い人）だけを受け持つ
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
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    select count(*) into v_count
      from public.profiles where v_email is not null and lower(email) = v_email;

    if v_count = 0 then
      insert into public.profiles (id, email, display_name, avatar_url, knl_role)
      values (v_uid, v_email,
              coalesce(v_meta ->> 'full_name', split_part(v_email, '@', 1), '新規ユーザー'),
              v_meta ->> 'avatar_url', 'viewer');
    elsif v_count = 1 then
      raise exception 'Knowledge のアカウントと社員マスタの ID がそろっていません。Admin に連絡してください。'
        using errcode = 'KN001';
    else
      raise exception 'multiple profiles share email %', v_email using errcode = 'P0001';
    end if;
  end if;

  return query select * from public.profiles where id = v_uid;
end;
$$;

revoke all on function public.knl_claim_profile() from public, anon;
grant execute on function public.knl_claim_profile() to authenticated;

-- 事前作成を 1 時間ごとに回す（社員マスタ側で増えた人を Knowledge に写す）
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('knl-provision-auth-users', '17 * * * *', $$select knl_private.knl_provision_auth_users()$$);

-- 適用直後に 1 回
select knl_private.knl_provision_auth_users();

-- ロールバック
-- select cron.unschedule('knl-provision-auth-users');
-- drop function if exists public.knl_realign_auth_id();
-- drop function if exists knl_private.knl_move_auth_user(uuid, uuid);
-- drop function if exists knl_private.knl_provision_auth_users();
-- drop foreign table if exists knl_private.shared_auth_identities, knl_private.shared_auth_users;
-- drop schema if exists knl_private;
-- knl_claim_profile は 20260912_knl_profiles_rpc.sql の定義に戻す
-- 事前作成したユーザーは、まだ一度もログインしていない（last_sign_in_at is null）azure のみのユーザーとして識別できる
