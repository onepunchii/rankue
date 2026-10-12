-- 도장첩에서 받은 것(2026-10-12 오너: "추천대로 진행" → "응 그렇게 하고" — 기획서 docs/01-plan/features/golf-stamp-collection.md 의 '완성 기록').
-- 볼마커(도장첩 한 권 · 누구나 일곱 권 전부)와 트로피를 받은 때와 순번. 규칙은 shared/golfStampAwards.ts, 표 설명은 shared/schema.ts.
--
-- 더하기만 한다(있는 표 · 줄은 건드리지 않는다). 배포 **전에** 먼저 돌린다 — 없어도 화면은 열리지만(서버가 표 없음을 빈 목록으로 받는다)
-- 받은 순번이 적히지 않는다.
-- 되돌릴 때: drop table golf_stamp_awards;

create table if not exists golf_stamp_awards (
  id          uuid primary key default gen_random_uuid() not null,
  member_id   uuid not null references hiq_members(id) on delete cascade,
  -- book(도장첩 한 권) · all(누구나 일곱 권 전부) · trophy(찍은 엘리트 골프장 수)
  kind        text not null,
  -- 권의 id · 'all-open' · 그 수('10')
  key         text not null,
  -- 그것을 받은 순번(1 = 처음) — 같은 (kind, key) 안에서 겹치지 않는다
  serial      integer not null,
  -- 그것을 채운 도장을 얻은 때(적은 때가 아니다)
  earned_at   timestamp not null,
  created_at  timestamp not null default now(),
  constraint golf_stamp_awards_member_kind_key_unique unique (member_id, kind, key),
  constraint golf_stamp_awards_kind_key_serial_unique unique (kind, key, serial)
);
create index if not exists golf_stamp_awards_member_idx on golf_stamp_awards (member_id);
