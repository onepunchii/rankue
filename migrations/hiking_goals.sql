-- 올해의 목표(2026-10-15) — 해마다 한 줄. 비운 칸(NULL)은 목표가 아니다. 진행은 정상 인증 · 산행 요약으로 화면이 센다.
create table if not exists hiking_goals (
  member_id   uuid not null references hiq_members(id) on delete cascade,
  year        integer not null,
  climbs      integer,
  height_m    integer,
  kfs         integer,
  updated_at  timestamptz not null default now(),
  primary key (member_id, year)
);
