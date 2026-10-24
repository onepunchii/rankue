-- 정상 인증 실패의 까닭(2026-10-24 오너: "진행") — 실패한 인증이 아무 데도 남지 않아, 정상에 있었는데 떨어진 것인지 알 수 없었다.
-- 규칙은 shared/hikingSummitMiss.ts. **좌표는 저장하지 않는다** — 까닭 · 거리 구간 · 위치 정확도 구간 · 기기 종류만.
-- 산 id 는 FK 를 걸지 않는다(같은 산 합치기 스크립트가 hiking_summits 만 옮긴다 — 실패 기록은 옛 id 로 남아도 된다).
-- 180일 지난 줄은 매일 청소(cron sim-cleanup)가 지운다. 탈퇴하면 지운다(withdrawPurge).
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다(표가 없어도 인증 자체는 된다 — 적기만 실패하고 지나간다).
-- 되돌릴 때: drop table hiking_summit_misses;

create table if not exists hiking_summit_misses (
  id           uuid primary key default gen_random_uuid() not null,
  member_id    uuid not null references hiq_members(id) on delete cascade,
  mountain_id  text not null,
  -- far · coarse · no-fix · no-summit · denied · unavailable
  reason       text not null,
  -- far 일 때 거리 구간('150-500m' · '500m-2km' · '>2km'), 그 밖은 shared/hikingStamps SummitBucket 또는 null
  bucket       text,
  -- 위치 정확도 구간('<20m' · '20-50m' · '50-200m' · '>200m') — 값 대신
  accuracy     text,
  -- app · inapp · web
  client       text,
  created_at   timestamp not null default now()
);
create index if not exists hiking_summit_misses_created_idx on hiking_summit_misses (created_at);
create index if not exists hiking_summit_misses_member_idx on hiking_summit_misses (member_id, mountain_id);
