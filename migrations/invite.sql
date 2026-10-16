-- 친구 초대(2026-10-16) — 더하기만. 규칙: shared/invite.ts · 보상: shared/cueCase.ts(invite · invited · invitePick)
-- 한 사람에 코드 하나(여섯 글자)
create table if not exists hiq_invite_codes (
    member_id uuid primary key,
    code text not null unique,
    created_at timestamptz not null default now()
);
-- 초대로 센 가입 — 한 사람은 한 번만 초대로 센다(invitee_id 가 열쇠)
create table if not exists hiq_referrals (
    invitee_id uuid primary key,
    inviter_id uuid not null,
    code text not null,
    created_at timestamptz not null default now()
);
create index if not exists hiq_referrals_inviter_idx on hiq_referrals (inviter_id, created_at);
