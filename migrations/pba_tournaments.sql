-- PBA 대회(2026-09-24, /tournaments 대회 허브·시즌·대회 페이지). shared/schema.ts 의 pbaTournaments 와 같은 모양.
-- 채우는 쪽: server/services/pbaTournaments.ts (일일 크론 = 현재·다음 시즌, 백필 = server/scripts/backfill-pba-tournaments.ts 전 시즌).
-- id 가 tour_code 가 아닌 이유: 팀리그 코드가 옛 시즌 투어 코드와 겹치고(2025-26 팀리그 85~90 = 2021-22 투어 85~90),
-- 코드가 아직 없는 예정 대회도 일정에 먼저 올라온다 → "T{투어코드}" 또는 "S{일정 SEQ}".
create table if not exists pba_tournaments (
    id text primary key,
    -- 제약 이름은 Drizzle 기본값(unique().on(tourCode))과 같게 — drizzle-kit 이 다른 제약으로 보지 않게
    tour_code integer constraint pba_tournaments_tour_code_unique unique,
    season integer not null,
    league text not null,
    title text not null,
    title_en text,
    start_date date not null,
    end_date date not null,
    place text,
    total_prize bigint,
    winner_prize bigint,
    winner_name text,
    winner_mem_code text,
    participants integer,
    official_seq text,
    updated_at timestamptz not null default now()
);
create index if not exists pba_tournaments_season_idx on pba_tournaments (season);
