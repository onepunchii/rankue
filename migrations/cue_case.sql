-- 당구 큐 케이스(2026-10-16 오너: "큐케이스로 가고 …" → 기획서 docs/01-plan/features/billiards-cue-case.md). 목록은 shared/cueCase.ts, 판정은 shared/cueCaseRules.ts.
-- 받은 기록(고치지도 지우지도 않는다)과 대표 큐. 표 설명은 shared/schema.ts.
--
-- 더하기만 한다(있는 표 · 줄은 건드리지 않는다). 배포 **전에** 먼저 돌린다.
-- 되돌릴 때: drop table hiq_cue_case_prefs; drop table hiq_cue_case_awards;

create table if not exists hiq_cue_case_awards (
  id          uuid primary key default gen_random_uuid() not null,
  member_id   uuid not null references hiq_members(id) on delete cascade,
  -- shared/cueCase 의 id(cue-games-50 · cue-on-tier-gold · chalk-palace · glove-m10 …) — 바꾸지 않는다
  item_id     text not null,
  -- 조건이 처음 채워진 판이 끝난 때(적은 때가 아니다)
  earned_at   timestamp not null,
  created_at  timestamp not null default now(),
  constraint hiq_cue_case_awards_member_item_unique unique (member_id, item_id)
);
create index if not exists hiq_cue_case_awards_item_idx on hiq_cue_case_awards (item_id);

create table if not exists hiq_cue_case_prefs (
  member_id   uuid primary key not null references hiq_members(id) on delete cascade,
  hero_item   text,
  updated_at  timestamp not null default now()
);
