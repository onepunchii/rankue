-- 채팅 금지(2026-10-26 오너 — 멀티방 대전에서 성적인 욕 · 패드립이 오갔는데 계정 정지밖에 수단이 없었다). 더하기만: 표 하나.
-- 회원마다 한 줄. ban_until 이 지금보다 뒤면 자유 채팅(대전 채팅 · 크루/1:1 채팅)을 못 쓴다 — 문구 단추 · 운영자 문의는 그대로.
-- 운영자가 정하거나(관리자 › 회원 상세 '채팅 금지'), 막힌 말을 10분 안에 세 번 쓰면 24시간 자동(hits · hits_at).
-- 시각은 timestamptz — 비교는 DB 의 now() 로만 한다(JS Date 를 raw sql 에 넣으면 9시간 어긋나는 함정).
-- 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiq_chat_moderation;
create table if not exists hiq_chat_moderation (
    member_id uuid primary key,
    ban_until timestamptz,
    ban_reason text,
    ban_by text,
    hits integer not null default 0,
    hits_at timestamptz,
    updated_at timestamptz not null default now()
);
