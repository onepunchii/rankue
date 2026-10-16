-- 관리자 작업 기록(2026-10-16) — 더하기만. 관리자 가드를 지난 바꾸는 요청마다 한 줄(server/middleware/adminAuth recordOnReply).
-- 남기지 않는 칸(PIN · 전화 · 계좌 …)은 shared/adminActions scrubAdminDetail 이 지운 뒤에 적는다.
create table if not exists hiq_admin_actions (
    id uuid primary key default gen_random_uuid(),
    admin_profile_id uuid,
    admin_name text,
    method text not null,
    path text not null,
    status integer not null,
    detail jsonb,
    created_at timestamptz not null default now()
);
create index if not exists hiq_admin_actions_created_idx on hiq_admin_actions (created_at desc);
create index if not exists hiq_admin_actions_admin_idx on hiq_admin_actions (admin_profile_id, created_at desc);
