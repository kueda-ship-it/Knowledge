-- operational_proposals に 問題点 / 改善提案 をそれぞれ独立カラムとして持つ。
-- 従来は description に "【改善提案】" マーカーで連結していたが、
-- UI で問題点と改善提案を個別に編集するために分離する。
-- 既存行は description に残っており、フロント側で problem/proposal が空なら
-- description をパースしてフォールバック表示する。
alter table public.operational_proposals
  add column if not exists problem text,
  add column if not exists proposal text;
