-- 골프 라운드의 출처 · 스캔 기록 · 운영자의 공식/미인증 전환(2026-10-17 어드민 전수 조사 골프 ① — "스캔 라운드가 곧바로 공식이 된다 · 출처 필터가 없다").
-- source: null = 점수판으로 친 라운드 · 'scan' = 스코어카드로 올린 라운드(storage/golf.repo recordScannedRound)
-- scan_meta: { read: 읽은 18칸, edits: 사람이 고친 칸 수, cardDay: 카드의 날 } — 옛 스캔(이 칸 전)은 { backfill: true } 만
-- admin_onsite: 운영자가 바꾼 기록 [{ at, by, reason, from, to }] — 되돌린 것까지 쌓는다
alter table golf_match_sessions add column if not exists source text;
alter table golf_match_sessions add column if not exists scan_meta jsonb;
alter table golf_match_sessions add column if not exists admin_onsite jsonb;
-- 옛 스캔 채우기 — 혼자 · 끝남 · 2분 안에 18홀이 다 찬 판 가운데 같은 회원이 30분 안에 카드를 읽은(golf_scan_log 'card' ok) 것만(10/17 실측 36판)
update golf_match_sessions s set source = 'scan', scan_meta = '{"backfill": true}'::jsonb where s.source is null and s.stroke_mode = 'solo' and s.status = 'finished' and s.finished_at - s.created_at < interval '2 minutes' and exists (select 1 from golf_scan_log l where l.member_id = s.host_id::text and l.session_id = 'card' and l.outcome = 'ok' and l.created_at between (s.created_at at time zone 'UTC') - interval '30 minutes' and (s.created_at at time zone 'UTC'));
create index if not exists golf_match_sessions_source_idx on golf_match_sessions (source) where source is not null;
