-- 등산 정상 인증 취소(2026-10-17 어드민 › 등산 › 정상 인증) — 더하기만: hiking_summits 에 칸 하나.
-- 운영자가 인증을 취소하면 그 줄을 '인증 없는 기록'(verified = false)으로 내리고 이 칸에 { at, reason, by } 를 적는다. 되살리면 restored* 를 더한다.
-- 되돌릴 때: alter table hiking_summits drop column admin_void;
alter table hiking_summits add column if not exists admin_void jsonb;
