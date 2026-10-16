-- 굿즈 · 배지 증정(2026-10-16 오너: "어드민에 굿즈 내역 · 증정 · 수정 가능하게" → 네 종목 전부 · 증정한 것만 회수 + 사유 · 알림 + 받은 화면). 더하기만.
-- 증정은 각 종목의 받은 기록(hiq_cue_case_awards · golf_stamp_awards · hiking_awards · fishing_decor_awards)에 한 줄을 넣고, 여기에 누가 · 왜를 남긴다.
-- 회수는 증정한 줄만 — 받은 기록의 그 줄을 지우고 여기에 회수한 때 · 사람 · 까닭을 적는다(이 줄은 지우지 않는다).
create table if not exists hiq_goods_grants (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null,
    sport text not null,
    item text not null,
    serial integer,
    reason text not null,
    message text,
    notified boolean not null default false,
    admin_profile_id uuid,
    admin_name text,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoked_by text,
    revoke_reason text
);
create index if not exists hiq_goods_grants_member_idx on hiq_goods_grants (member_id, created_at desc);
create index if not exists hiq_goods_grants_created_idx on hiq_goods_grants (created_at desc);
