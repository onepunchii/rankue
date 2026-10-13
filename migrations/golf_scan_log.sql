-- 스코어카드 스캔 기록(2026-10-13) — 더하기만. 하루 횟수 제한과 쓰는 양 · 판독 품질을 보는 데만 쓴다.
-- 그림 · 이름 · 읽은 점수는 넣지 않는다 — 누가 · 언제 · 어느 방에서 · 잘 읽혔는가(칸 수)뿐이다. 규칙: shared/golfScorecardScan.ts
create table if not exists golf_scan_log (
    id bigserial primary key,
    member_id text not null,
    session_id text,
    model text not null default '',
    -- ok: 초안이 나왔다 · handwritten / other: 받는 꼴이 아니다 · none: 줄을 못 찾았다 · failed: 모델이 답하지 못했다
    outcome text not null,
    rows integer not null default 0,
    cells_ok integer not null default 0,
    cells_check integer not null default 0,
    cells_empty integer not null default 0,
    ms integer,
    created_at timestamptz not null default now()
);
create index if not exists golf_scan_log_member_idx on golf_scan_log (member_id, created_at desc);
