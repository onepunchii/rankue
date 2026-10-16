-- 낚시 랭킹 점검(2026-10-17 어드민 › 낚시 › 랭킹 점검 — "400cm · 999마리 · 300kg 까지 통과한다"). 더하기만: 칸 하나.
-- 운영자가 랭킹에서만 뺀 조과 { at, reason, by } — 일지 · 수족관에는 그대로 남는다(잘못 적은 값은 위반이 아니다. 가리기는 신고의 일이다).
-- 되돌릴 때: alter table fishing_catches drop column if exists rank_void;
alter table fishing_catches add column if not exists rank_void jsonb;
