-- 관심 선수(팔로우, 2026-09-13 오너). 순위 변동 알림의 대상 목록이기도 하다.
create table if not exists hiq_player_follows (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null references hiq_members(id),
    category text not null,
    player_umb_id text not null,
    created_at timestamp not null default now(),
    unique (member_id, category, player_umb_id)
);
create index if not exists hiq_player_follows_player_idx on hiq_player_follows (category, player_umb_id);
