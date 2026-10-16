-- 수족관 꾸미기(2026-10-16) — 더하기만. 규칙: shared/fishingDecor.ts
-- 받은 장식: 한 사람이 한 장식을 한 번. serial = 그 장식의 몇 번째 주인(금 닻은 99 까지 — 넣을 때 막는다)
create table if not exists fishing_decor_awards (
    member_id text not null,
    item_id text not null,
    serial integer not null,
    earned_at timestamptz not null default now(),
    primary key (member_id, item_id)
);
create unique index if not exists fishing_decor_awards_serial_idx on fishing_decor_awards (item_id, serial);
-- 내 수족관의 자리(여섯 칸) — {"left": "kelp", "prop": ""} · 없는 칸은 '알아서'
create table if not exists fishing_tanks (
    member_id text primary key,
    layout jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);
