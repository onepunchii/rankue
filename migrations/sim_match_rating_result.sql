-- 이 판이 끝나며 반영된 레이팅(2026-10-12 — 끝난 화면의 "레이팅 +12" · "등급이 올랐어요").
-- { "delta": <방장 기준 변화>, "after": [<방장>, <게스트>], "matches": [<방장 판 수>, <게스트 판 수>] } — shared/sim/rating.ts RatingResult.
-- 반영하지 않은 판(친선전 · 너무 짧은 판)과 이 칸이 생기기 전에 끝난 판은 null. 전체 다시 계산(recomputeRatings)은 이 값을 고치지 않는다.
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS rating_result jsonb;
