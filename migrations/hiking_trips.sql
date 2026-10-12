-- 등산 — 산행 한 번의 요약(2026-10-13). 산행 중 '길 띠'를 마치면 남기는 것(shared/hikingTrail.ts 의 TripInput).
-- **좌표 · 걸은 길을 저장하지 않는다** — 언제 · 어느 산 · 어느 코스 · 길 위의 거리 · 오른 높이 · 정상에 닿았는가뿐이다.
-- (걸은 길을 저장하는 것은 기획서 6장의 B 걸음 — 위치기반서비스 신고가 먼저다.)
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiking_trips;

create table if not exists hiking_trips (
  id             uuid primary key default gen_random_uuid() not null,
  member_id      uuid not null references hiq_members(id) on delete cascade,
  mountain_id    text not null references hiking_mountains(id),
  -- 걸은 코스(hiking_courses.id) — 코스가 다시 적재돼 사라져도 기록은 남게 참조를 걸지 않는다
  course_id      text,
  started_at     timestamp not null,
  ended_at       timestamp not null,
  -- 코스 선 위에서 움직인 거리(km) · 오른 높이(m) — 기기가 센 값(위치가 튄 구간은 뺀다)
  km             numeric(6,2) not null default 0,
  gain_m         integer not null default 0,
  reached_summit boolean not null default false,
  created_at     timestamp not null default now(),
  -- 같은 산행을 두 번 보내도 한 줄
  constraint hiking_trips_member_started_unique unique (member_id, started_at)
);
create index if not exists hiking_trips_member_idx on hiking_trips (member_id, started_at desc);
