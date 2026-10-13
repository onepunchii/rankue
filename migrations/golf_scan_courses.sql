-- 스코어카드에서 확인된 코스와 파(2026-10-13) — 더하기만. 오너: "해당 홀과 코스를 누적 DB 로 저장해 놓는 거 알지?"
-- 카드에 찍힌 합과 맞아떨어진 아홉 홀만 쌓는다(server/services/golfScanRound.ts saveSeenCourse). 명부(rankue_golf_courses)에 없는 코스를 읽을 때 보태 쓴다.
-- pars_key: 아홉 홀의 파를 이어 쓴 글자("434544345"). 같은 사람이 같은 것을 또 올리면 seen 만 는다.
create table if not exists golf_scan_courses (
    id bigserial primary key,
    club_id text not null,
    course_key text not null,
    course_name text not null,
    pars_key text not null,
    member_id text not null,
    seen integer not null default 1,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    unique (club_id, course_key, pars_key, member_id)
);
create index if not exists golf_scan_courses_club_idx on golf_scan_courses (club_id, course_key);
