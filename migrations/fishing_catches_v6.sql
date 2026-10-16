-- 낚시 조과 신고 · 가림 · 이의제기(2026-10-17 어드민 › 낚시 › 조과 검수 — "공개 전 필수: 랭킹 썸네일과 자유 입력 어종이 누구에게나 보인다").
-- 산행 사진(hiking_photos_public.sql)과 같은 칸 셋 — 가림은 hidden_at, 올린 사람의 이의제기는 appeal_text · appeal_at. 더하기만.
-- 되돌릴 때: alter table fishing_catches drop column if exists hidden_at, drop column if exists appeal_text, drop column if exists appeal_at;
alter table fishing_catches add column if not exists hidden_at   timestamp;
alter table fishing_catches add column if not exists appeal_text text;
alter table fishing_catches add column if not exists appeal_at   timestamp;
