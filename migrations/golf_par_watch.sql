-- 골프 파 자동 반영 감시 · 잠금(2026-10-17 어드민 전수 조사 골프 ② — "서로 다른 카드 두 장이면 공용 파가 바뀐다 · 잠금 칸이 없다").
-- par_lock: { at, by, reason } — 잠근 코스는 스코어카드가 파를 바꾸지 못한다(services/golfScanRound promoteSeenCourse). 운영자 손 수정은 된다
-- golf_par_changes: 파가 바뀐 기록 한 줄씩 — added(카드가 코스를 더함) · fixed(카드가 파를 바꿈) · blocked(잠겨서 막음) · admin(운영자가 고침) · reverted(되돌림) · lock · unlock
alter table rankue_golf_courses add column if not exists par_lock jsonb;
create table if not exists golf_par_changes (id bigserial primary key, club_id text not null, course_id uuid, course_name text not null, kind text not null, from_pars text, to_pars text, members integer, by text, reason text, at timestamptz not null default now());
create index if not exists golf_par_changes_at_idx on golf_par_changes (at desc);
create index if not exists golf_par_changes_course_idx on golf_par_changes (course_id, at desc);
