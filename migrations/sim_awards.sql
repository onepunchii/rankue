-- 장식장(2026-10-12 오너: "장식장에 보관이 되도록 매월초가 되면 …"). 달이 끝나면 그 달의 것을 한 번 준다 — 규칙은 shared/simShelf.ts.
-- 더하기만 한다(있는 표 · 줄은 건드리지 않는다).

-- 받은 것: month_rank = 이달의 랭킹 1~3등 메달(rank) · month_tier = 그 달이 끝날 때의 등급 배지(tier).
-- detail = { "points", "matches", "wins", "rating" } — 받을 때의 근거. 한 번 준 것은 고치지 않는다.
CREATE TABLE IF NOT EXISTS hiq_sim_awards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL REFERENCES hiq_members(id),
    month text NOT NULL,
    kind text NOT NULL,
    game_type text NOT NULL,
    rank integer,
    tier text,
    detail jsonb,
    created_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT hiq_sim_awards_member_id_month_kind_game_type_unique UNIQUE (member_id, month, kind, game_type)
);
CREATE INDEX IF NOT EXISTS idx_sim_awards_member ON hiq_sim_awards (member_id);

-- 마감한 달: 한 줄이 있으면 그 달은 다시 마감하지 않는다(받은 사람이 없는 달도 줄은 남는다).
CREATE TABLE IF NOT EXISTS hiq_sim_month_closes (
    month text PRIMARY KEY NOT NULL,
    closed_at timestamp DEFAULT now() NOT NULL,
    summary jsonb
);
