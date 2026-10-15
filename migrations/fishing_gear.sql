-- 장비(2026-10-15) — 낚싯대 · 릴 · 줄 · 채비 조합. 릴의 줄 교체 기록은 line_log(최근 서른 줄, [{day, note}]). 내 것만 본다.
CREATE TABLE IF NOT EXISTS fishing_gear (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('rod', 'reel', 'line', 'combo')),
    name text NOT NULL,
    brand text,
    spec text,
    note text,
    line_log jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fishing_gear_member ON fishing_gear (member_id, kind);
