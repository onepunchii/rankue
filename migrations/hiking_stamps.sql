-- 등산 — 정상에 오른 기록과 받은 것(2026-10-13 오너: "다양한 스탬프를 받을 수 있게 … 골프의 도장깨기를 비슷하게 접목").
-- 규칙은 shared/hikingStamps.ts. 기획 docs/01-plan/features/hiking-category.md.
--
-- 더하기만 한다(당구 · 골프의 표는 건드리지 않는다). 배포 **전에** 먼저 돌린다.
-- **좌표는 저장하지 않는다** — 정상까지의 거리를 서버가 재고 인증 여부와 거친 거리 구간만 남긴다(골프의 현장 인증과 같은 원칙).
-- 되돌릴 때: drop table hiking_awards; drop table hiking_summits;

create table if not exists hiking_summits (
  id           uuid primary key default gen_random_uuid() not null,
  member_id    uuid not null references hiq_members(id) on delete cascade,
  mountain_id  text not null references hiking_mountains(id),
  -- 오른 때(인증한 때 · 적은 날)
  at           timestamp not null,
  -- 정상 가까이에서 위치로 인증했는가. false 는 인증 없이 적은 기록(흐린 도장)
  verified     boolean not null default false,
  -- 거리 구간('<150m' · '150-500m' · '500m-2km' · '>2km' · 'coarse' · 'no-fix') — 좌표 대신 이것만
  bucket       text,
  -- 한국 날짜(YYYY-MM-DD) — 같은 산의 인증은 하루에 한 번
  day          text not null,
  created_at   timestamp not null default now(),
  constraint hiking_summits_member_mountain_day_verified_unique unique (member_id, mountain_id, day, verified)
);
create index if not exists hiking_summits_member_idx on hiking_summits (member_id);
create index if not exists hiking_summits_mountain_idx on hiking_summits (mountain_id);

create table if not exists hiking_awards (
  id          uuid primary key default gen_random_uuid() not null,
  member_id   uuid not null references hiq_members(id) on delete cascade,
  -- patch(도장첩 한 권의 와펜) · grand(묶음 전부의 큰 와펜) · pin(핀)
  kind        text not null,
  key         text not null,
  -- 그것을 받은 순번(1 = 처음)
  serial      integer not null,
  earned_at   timestamp not null,
  created_at  timestamp not null default now(),
  constraint hiking_awards_member_kind_key_unique unique (member_id, kind, key),
  constraint hiking_awards_kind_key_serial_unique unique (kind, key, serial)
);
create index if not exists hiking_awards_member_idx on hiking_awards (member_id);
