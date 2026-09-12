-- S2b: 2026-09-12 本番（oolfzmxmxtrzyurepfwf）に MCP で適用済み: migration "knl_profiles_fdw_revoke_dml"
-- FDW 外部テーブル profiles は共有 Supabase に postgres（BYPASSRLS）で接続し、RLS を掛けられない。
-- anon / authenticated に DML が付いていたため、Knowledge の anon キーだけで共有 profiles の全行・全列を書き換えられた。
-- 書き込みは knl_claim_profile / knl_update_masters（SECURITY DEFINER・権限チェック付き）経由のみにする。
-- Knowledge の profiles 読み取りはすべてログイン後のため anon の SELECT も外す。
-- 決定: Obsidian Vault 20_Decisions/2026-09-11_profiles権限列の自己書き換え防止

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;

-- ロールバック
-- grant insert, update, delete, truncate on public.profiles to anon, authenticated;
-- grant select on public.profiles to anon;
