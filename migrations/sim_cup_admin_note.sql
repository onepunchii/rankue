-- 월대회 운영 기록(2026-10-16 어드민 › 당구 › 월대회) — 더하기만: hiq_sim_cup_games 에 칸 하나.
-- 운영자가 기한을 늘리거나 결과를 정하거나 바꾼 일 [{ at, by, action, reason, text }] — 대진표에 '운영자가 정함'으로 보인다.
-- 되돌릴 때: alter table hiq_sim_cup_games drop column admin_note;
alter table hiq_sim_cup_games add column if not exists admin_note jsonb;
