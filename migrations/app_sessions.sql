-- 앱 접속 세션(2026-09-13 오너: 잔류 측정). 열림/닫힘 + 5분 하트비트. 로그인 회원만.
create table if not exists hiq_app_sessions (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null references hiq_members(id),
    platform text not null,
    opened_at timestamp not null default now(),
    last_seen_at timestamp not null default now(),
    closed_at timestamp
);
create index if not exists hiq_app_sessions_member_idx on hiq_app_sessions (member_id, opened_at);
create index if not exists hiq_app_sessions_opened_idx on hiq_app_sessions (opened_at);
