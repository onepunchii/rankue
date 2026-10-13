-- 크루 정출(2026-10-14) — 더하기만. 정출 한 번 = 크루 · 날 · 출조지. 조과는 fishing_catches.trip_id 로 붙는다(붙인 조과는 그 크루가 본다).
-- 규칙: shared/fishingTrip.ts
create table if not exists fishing_trips (
    id uuid primary key default gen_random_uuid(),
    crew_id uuid not null,
    fished_on text not null,
    place text not null,
    title text,
    created_by text not null,
    created_at timestamptz not null default now()
);
create index if not exists fishing_trips_crew_idx on fishing_trips (crew_id, fished_on desc);
alter table fishing_catches add column if not exists trip_id uuid;
create index if not exists fishing_catches_trip_idx on fishing_catches (trip_id) where trip_id is not null;
