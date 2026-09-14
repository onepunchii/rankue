-- 골프 온라인게임(미니골프 대전, 2026-09-14). 정본은 shared/schema.ts
create table if not exists golf_arcade_rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    host_id uuid not null references hiq_members(id),
    course_id text not null default 'rankue-park',
    status text not null default 'waiting',
    created_at timestamp not null default now(),
    started_at timestamp,
    finished_at timestamp
);
create index if not exists golf_arcade_rooms_code_idx on golf_arcade_rooms (code, status);
create table if not exists golf_arcade_players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references golf_arcade_rooms(id),
    member_id uuid not null references hiq_members(id),
    name text not null,
    strokes jsonb not null default '[]',
    finished_at timestamp,
    joined_at timestamp not null default now(),
    unique (room_id, member_id)
);
