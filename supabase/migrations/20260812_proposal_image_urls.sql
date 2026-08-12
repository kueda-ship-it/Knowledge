-- 運用提議に画像添付を持たせる。原本 OneDrive は挟まず、Supabase Storage
-- (bucket: knowledge-thumbs / prefix: proposals/) の公開 URL を配列で保持する。
alter table public.operational_proposals
  add column if not exists image_urls text[];
