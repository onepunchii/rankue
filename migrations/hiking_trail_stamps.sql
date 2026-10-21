-- 코리아둘레길 코스 도장(2026-10-21) — 코스의 두 끝에서 위치를 한 번씩 확인하면 그 코스의 도장. 규칙은 shared/trailStamps.ts.
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다.
-- **좌표는 저장하지 않는다** — 서버가 두 끝까지의 거리를 재고 어느 끝(start · end) · 때 · 거리 구간만 남긴다(정상 인증과 같은 원칙).
-- 코스는 두루누비 코스 id(crsIdx — server/assets/trails/korea-trails.json). 자료가 DB 에 없으니 FK 는 회원에만.
-- 되돌릴 때: drop table hiking_trail_stamps; drop table hiking_trail_checks;

create table if not exists hiking_trail_checks (
  id           uuid primary key default gen_random_uuid() not null,
  member_id    uuid not null references hiq_members(id) on delete cascade,
  course_id    text not null,
  route        text not null,
  course_key   text not null,
  -- 어느 끝에서 확인했나
  end_at       text not null check (end_at in ('start', 'end')),
  -- 확인한 때(UTC 벽시계)
  at           timestamp not null,
  created_at   timestamp not null default now()
);
create index if not exists hiking_trail_checks_member_course_idx on hiking_trail_checks (member_id, course_id, at);

create table if not exists hiking_trail_stamps (
  member_id    uuid not null references hiq_members(id) on delete cascade,
  course_id    text not null,
  route        text not null,
  course_key   text not null,
  -- 출발한 끝 · 출발 확인한 때 · 도장이 된 때
  first_end    text not null check (first_end in ('start', 'end')),
  started_at   timestamp not null,
  done_at      timestamp not null,
  created_at   timestamp not null default now(),
  primary key (member_id, course_id)
);
create index if not exists hiking_trail_stamps_member_idx on hiking_trail_stamps (member_id);
