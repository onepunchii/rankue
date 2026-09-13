-- 골프 랭킹(2026-09-13 오너: PGA·LPGA·KPGA·KLPGA 를 당구 세계랭킹처럼, 공개 전체). 정본은 shared/golfTours.ts · shared/schema.ts
create table if not exists golf_rankings (
    id uuid primary key default gen_random_uuid(),
    tour text not null,
    edition text not null,
    edition_date timestamp not null,
    rank integer not null,
    player_id text not null,
    player_name text not null,
    name_ko text,
    country text not null,
    points double precision not null,
    points_total double precision,
    events integer,
    prev_rank integer,
    extra jsonb,
    created_at timestamp not null default now(),
    unique (tour, edition, player_id)
);
create index if not exists golf_rankings_player_idx on golf_rankings (tour, player_id);
create index if not exists golf_rankings_edition_idx on golf_rankings (tour, edition, rank);

create table if not exists golf_players (
    id uuid primary key default gen_random_uuid(),
    tour text not null,
    player_id text not null,
    name text not null,
    name_ko text,
    name_en text,
    country text not null,
    birth_date text,
    extra jsonb,
    updated_at timestamp not null default now(),
    unique (tour, player_id)
);

create table if not exists golf_stats (
    id uuid primary key default gen_random_uuid(),
    tour text not null,
    season text not null,
    stat_key text not null,
    label text not null,
    unit text not null default '',
    rank integer not null,
    player_id text not null,
    player_name text not null,
    value double precision not null,
    extra jsonb,
    updated_at timestamp not null default now(),
    unique (tour, season, stat_key, player_id)
);
create index if not exists golf_stats_player_idx on golf_stats (tour, player_id);
create index if not exists golf_stats_key_idx on golf_stats (tour, season, stat_key, rank);
