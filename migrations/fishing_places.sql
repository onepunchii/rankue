-- 낚시터(2026-10-14) — 더하기만. 행정안전부 낚시터정보(지자체에 등록 · 신고된 낚시터업 — 유료 낚시터 중심)를 걸러 실은 것.
-- 적재: server/scripts/fishing-load-places.ts. 좌표가 주소와 어긋나거나 국내 밖인 곳은 좌표를 비운다. 요금은 원문 그대로(형식이 제각각).
create table if not exists fishing_places (
    id text primary key,
    name text not null,
    kind text,
    sido text,
    sigungu text,
    address text,
    lat double precision,
    lng double precision,
    species text[] not null default '{}',
    fee text,
    tel text,
    data_date text,
    updated_at timestamptz not null default now()
);
create index if not exists fishing_places_region_idx on fishing_places (sido, sigungu);
