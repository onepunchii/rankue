-- 상대 조준 보여 주기(2026-09-16): 치는 쪽이 겨누는 방향을 기다리는 쪽 화면에 큐대로 그린다.
-- 몇 초짜리 현재 상태라 컬럼 두 개로 둔다(이모지와 같은 이유).
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS aim_phi double precision;
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS aim_at timestamp;
