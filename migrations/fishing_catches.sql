-- 낚시 조과 기록(2026-10-14) — 더하기만. 한 줄 = 한 번의 출조에서 잡은 한 어종. 규칙: shared/fishing.ts
-- 잡은 곳은 사람이 적은 이름만(좌표를 받지 않는다). 지금은 운영자만 쓴다(FISHING_PUBLIC).
create table if not exists fishing_catches (
    id uuid primary key default gen_random_uuid(),
    member_id text not null,
    fished_on text not null,
    place text not null,
    spot text,
    species text not null,
    length_cm numeric(5,1),
    fish_count integer not null default 1,
    note text,
    created_at timestamptz not null default now()
);
create index if not exists fishing_catches_member_idx on fishing_catches (member_id, fished_on desc, created_at desc);
