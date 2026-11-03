-- 월대회를 운영자가 여는 대회로(2026-11-03 오너: "우리가 지정된 날짜에 방을 만듬 … 대전자(승인된)가 참석하고 관전도 가능하고 … 일정시간 안들어오면 기권패").
-- 더하기만: hiq_sim_cup_games 에 칸 넷. 대회의 상태(draft · void)는 글자 칸이라 표를 고치지 않는다.
--  scheduled_at  운영자가 정한 경기 시각(없으면 '일정 미정' — 시간으로 가리지 않는다)
--  p1_seen_at · p2_seen_at  대기실에 지금 있는가(입장 뒤 몇 초마다 다시 적는다 — 두 사람이 함께 있을 때만 판이 시작된다)
--  called_at     '입장할 시간이에요' 알림을 보낸 때(한 번만)
-- 되돌릴 때: alter table hiq_sim_cup_games drop column scheduled_at, drop column p1_seen_at, drop column p2_seen_at, drop column called_at;
alter table hiq_sim_cup_games add column if not exists scheduled_at timestamp;
alter table hiq_sim_cup_games add column if not exists p1_seen_at timestamp;
alter table hiq_sim_cup_games add column if not exists p2_seen_at timestamp;
alter table hiq_sim_cup_games add column if not exists called_at timestamp;
