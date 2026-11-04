-- 선구 정하기 — 가위바위보(2026-11-04 오너: "가위바위보 게임 디자인으로 시안" → "응 이렇게 진행하자").
-- 더하기만: hiq_sim_matches 에 칸 하나. 대전이 시작되면 가위바위보 상태를 적고(shared/sim/breakRps), 정해질 때까지 샷 · 시계를 막는다.
-- 되돌릴 때: alter table hiq_sim_matches drop column break_rps;
alter table hiq_sim_matches add column if not exists break_rps jsonb;
