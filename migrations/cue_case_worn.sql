-- 큐 케이스 상대 · 공(2026-10-24 오너: "당구는 1단계부터") — 온라인 대전에 입은 상대 · 공.
-- null = 가장 최근에 받은 것, 'none' = 기본(메이플 상대 · 빨간 점 공). 받은 것만 고를 수 있다(서버가 확인).
-- 더하기만 한다 — 있는 줄 · 열은 그대로.
alter table hiq_cue_case_prefs add column if not exists hero_shaft text;
alter table hiq_cue_case_prefs add column if not exists hero_ball text;
