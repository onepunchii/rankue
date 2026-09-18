-- 샷 행에 친 사람의 이닝 번호(2026-09-18). 방을 나갔다 다시 들어오면 이닝별 점수판이 비어 있던 것을
-- 서버 기록으로 다시 그리기 위해서다. 그 전 행은 null — 화면이 샷 순서로 추정한다(client inningLog.rebuildInningLog).
-- **코드 배포보다 먼저** 적용한다: 스키마에 칸이 생기면 샷 조회(select *)·기록(insert)이 이 칸을 찾는다.
-- 되돌릴 때: alter table hiq_sim_match_shots drop column inning;
alter table hiq_sim_match_shots add column if not exists inning integer;
