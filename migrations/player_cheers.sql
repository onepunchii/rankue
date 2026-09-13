-- 선수 응원글(2026-09-13 오너 제안 11번). 커뮤니티 댓글과 같은 안전장치(필터·신고·블라인드·차단)를 탄다.
create table if not exists hiq_player_cheers (
    id uuid primary key default gen_random_uuid(),
    category text not null,
    player_umb_id text not null,
    author_id uuid not null references hiq_members(id),
    content text not null,
    is_blinded boolean not null default false,
    blind_reason text,
    deleted_at timestamp,
    created_at timestamp not null default now()
);
create index if not exists hiq_player_cheers_player_idx on hiq_player_cheers (category, player_umb_id, created_at desc);
