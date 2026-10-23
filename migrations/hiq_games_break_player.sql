-- 실전 점수판 초구(2026-10-23 오너: "초구 정하기") — 누가 먼저 치나(자리 1~4). null 이면 1(호스트 — 예전 경기 그대로).
-- 차례 순서 · 이닝 · 공 색이 이 자리에서 시작한다(shared/scoreboardOrder). 점수 저장(PATCH /game/:id/score)이 함께 적는다.
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다 — 스키마(shared/schema.ts)가 이 칸을 읽으므로, 칸이 없는 DB 에 새 코드를 올리면 경기 행 조회가 전부 실패한다.
-- 되돌릴 때: alter table hiq_games drop column break_player;

alter table hiq_games add column if not exists break_player integer;
