-- "한 판 더"(2026-09-15): 끝난 대전에서 양쪽이 누르면 같은 설정으로 새 대전을 연다.
-- rematch_by 는 {"<회원 id>": "<ISO>"}, rematch_id 는 만들어진 새 대전.
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS rematch_by jsonb;
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS rematch_id uuid;
