-- 크루 도장깨기(2026-10-12 오너: "골프 마무리 하고 등산 넘어가자" — 기획서 docs/01-plan/features/golf-stamp-collection.md 7장).
-- 크루 도장(같은 라운드에서 크루원 둘 이상이 현장 인증한 골프장)과 크루가 받은 깃발. 규칙은 shared/golfCrewStamps.ts, 표 설명은 shared/schema.ts.
--
-- 더하기만 한다(있는 표 · 줄은 건드리지 않는다). 배포 **전에** 먼저 돌린다 — 없어도 화면은 열리지만(서버가 표 없음을 빈 목록으로 받는다)
-- 크루 도장이 적히지 않는다.
-- 되돌릴 때: drop table golf_crew_stamp_awards; drop table golf_crew_stamps;

create table if not exists golf_crew_stamps (
  id          uuid primary key default gen_random_uuid() not null,
  crew_id     uuid not null references hiq_crews(id) on delete cascade,
  -- 골프장 원장 번호, 번호 없는 옛 기록이면 'name:<이름 알맹이>'
  club_key    text not null,
  club_id     text,
  club_name   text not null,
  -- 처음 크루 도장이 된 라운드를 끝낸 때
  first_at    timestamp not null,
  -- 넷이 한 조로 돈 첫 라운드를 끝낸 때(풀조). 없으면 null
  full_at     timestamp,
  -- 크루 도장이 된 라운드 수 · 가장 많이 같이 간 인원
  rounds      integer not null default 1,
  most        integer not null default 2,
  created_at  timestamp not null default now(),
  updated_at  timestamp not null default now(),
  constraint golf_crew_stamps_crew_club_unique unique (crew_id, club_key)
);
create index if not exists golf_crew_stamps_club_idx on golf_crew_stamps (club_id);

create table if not exists golf_crew_stamp_awards (
  id          uuid primary key default gen_random_uuid() not null,
  crew_id     uuid not null references hiq_crews(id) on delete cascade,
  -- flag(도장첩 한 권 · 'all-open') · full(그 권의 도장이 전부 풀조)
  kind        text not null,
  key         text not null,
  -- 그 깃발을 받은 순번(1 = 처음 받은 크루 — '1호') — 같은 (kind, key) 안에서 겹치지 않는다
  serial      integer not null,
  earned_at   timestamp not null,
  created_at  timestamp not null default now(),
  constraint golf_crew_stamp_awards_crew_kind_key_unique unique (crew_id, kind, key),
  constraint golf_crew_stamp_awards_kind_key_serial_unique unique (kind, key, serial)
);
create index if not exists golf_crew_stamp_awards_crew_idx on golf_crew_stamp_awards (crew_id);
