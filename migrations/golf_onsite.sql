-- 현장 인증 도장(2026-09-30 오너 결정) — 라운드 중 골프장 2km 안에서 위치가 한 번이라도 잡히면 ✓ 현장 인증,
-- 아니면 점수·평균은 남고 도장만 흐린 '기록 도장'. 규칙은 shared/golfOnSite.ts, 표 설명은 shared/schema.ts.
--
-- 적용: 운영 DB 에 2026-09-30 적용 완료(추가만 하는 DDL — 기존 행·칸은 건드리지 않는다).
--       ⚠️ 새 환경에선 **배포 전에** 먼저 돌릴 것 — drizzle 의 select() 가 hiq_game_history·golf_match_sessions 의
--       새 칸을 읽으므로, 칸이 없으면 기록·경기 조회가 전부 실패한다(당구 기록 포함).
--       golf_round_checkins 표만은 첫 확인(POST /api/hiq/golf/match/:id/checkin)이 없으면 같은 DDL 로 만든다.
--
-- 옛 기록: on_site 에 기본값을 두지 않는다. 이 규칙 전 행은 NULL 로 남아 '그대로 인정'(도장으로 센다)된다.
-- 되돌릴 때: alter table hiq_game_history drop column on_site;
--           alter table golf_match_sessions drop column started_at, drop column holes_done_at;
--           drop table golf_round_checkins;

-- 기록 한 줄이 현장 인증인가 — NULL 옛 기록(인정), true 인증, false 기록 도장
alter table hiq_game_history add column if not exists on_site boolean;

-- 30분 규칙: 진행 중으로 바뀐 때 · 실제 회원의 18홀이 처음 다 적힌 때
alter table golf_match_sessions add column if not exists started_at timestamp;
alter table golf_match_sessions add column if not exists holes_done_at timestamp;

-- 위치 확인 한 번 = 한 행. 좌표는 없다 — 인증 여부와 거리 구간만.
create table if not exists golf_round_checkins (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references golf_match_sessions(id) on delete cascade,
  member_id       uuid not null references hiq_members(id) on delete cascade,
  verified        boolean not null,
  distance_bucket text not null,
  source          text not null,
  created_at      timestamp not null default now()
);
create index if not exists golf_round_checkins_session_idx on golf_round_checkins (session_id, created_at);
