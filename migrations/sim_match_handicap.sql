-- 핸디전 방(2026-09-12 오너: "다마수에 따른 경기"). 참가 시 서버가 두 사람의 온라인 에버리지로 목표를 정한다.
-- 이미 있던 방은 방장이 적은 다마수로 치기로 하고 시작했으므로 false 로 둔다(새 방만 기본 true).
alter table hiq_sim_matches add column if not exists handicap boolean not null default true;
update hiq_sim_matches set handicap = false where status in ('waiting', 'playing', 'finished', 'canceled') and handicap is true and created_at < now();
