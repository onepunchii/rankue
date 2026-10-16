-- 크론 일의 실행 기록(2026-10-17 어드민 › 등산 › 현황 — "전날 브리핑 크론이 실패해도 아무도 모른다"). 더하기만: 표 하나.
-- 매시 리마인더 크론에 얹힌 일(산행 · 라운드 전날 브리핑 · 월대회 굴리기)이 **실제로 일했거나 실패했을 때만** 한 줄 — 시간 밖의 빈 실행은 적지 않는다.
-- 되돌릴 때: drop table hiq_cron_runs;
create table if not exists hiq_cron_runs (
  id      bigserial primary key,
  -- hiking_eve · golf_eve · cup_roll
  job     text not null,
  ran_at  timestamptz not null default now(),
  ok      boolean not null,
  -- 그 일이 돌려준 숫자(보낸 수 · 실패 수 …) 또는 { error }
  result  jsonb
);
create index if not exists hiq_cron_runs_job_idx on hiq_cron_runs (job, ran_at desc);
