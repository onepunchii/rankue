-- 월대회(2026-10-12 오너 "추천대로") — 규칙은 shared/simCup.ts. 그 달의 성적으로 다음 달 1일에 연다.
-- 더하기만 한다: 새 표 셋 + 대전 표에 null 을 허용하는 칸 하나(기본값 없음 → 표를 다시 쓰지 않는다).

-- 대회: status = running · finished · skipped(출전자가 3명이 안 돼 열지 않음 — 줄은 남겨 다시 열지 않는다)
CREATE TABLE IF NOT EXISTS hiq_sim_cups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    month text NOT NULL,
    game_type text NOT NULL,
    status text NOT NULL,
    size integer DEFAULT 0 NOT NULL,
    starts_at timestamp NOT NULL,
    finished_at timestamp,
    rules jsonb,
    created_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT hiq_sim_cups_month_game_type_unique UNIQUE (month, game_type)
);

-- 출전자: 확정 때의 시드 · 레이팅 · 그 달 성적. 끝나면 순위 · 메달(1~5) · 기권 여부
CREATE TABLE IF NOT EXISTS hiq_sim_cup_entries (
    cup_id uuid NOT NULL REFERENCES hiq_sim_cups(id),
    member_id uuid NOT NULL REFERENCES hiq_members(id),
    seed integer NOT NULL,
    rating integer NOT NULL,
    matches integer NOT NULL,
    points integer NOT NULL,
    place integer,
    medal integer,
    forfeit boolean,
    CONSTRAINT hiq_sim_cup_entries_cup_id_member_id_pk PRIMARY KEY (cup_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_sim_cup_entries_member ON hiq_sim_cup_entries (member_id);

-- 대진 칸: (kind, round, slot). outcome = played · walkover · seed · bye · void
CREATE TABLE IF NOT EXISTS hiq_sim_cup_games (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    cup_id uuid NOT NULL REFERENCES hiq_sim_cups(id),
    kind text NOT NULL,
    round integer NOT NULL,
    slot integer NOT NULL,
    p1_id uuid,
    p2_id uuid,
    deadline_at timestamp NOT NULL,
    p1_ready_at timestamp,
    p2_ready_at timestamp,
    match_id uuid,
    winner_id uuid,
    outcome text,
    decided_at timestamp,
    reminded_at timestamp,
    CONSTRAINT hiq_sim_cup_games_cup_id_kind_round_slot_unique UNIQUE (cup_id, kind, round, slot)
);

-- 대회 판 표시: 이 대전이 치르는 대진 칸. 평소 대전은 null.
ALTER TABLE hiq_sim_matches ADD COLUMN IF NOT EXISTS cup_game_id uuid;
