-- 방문자 발자국 (2026-10-08)
-- 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도 접목해 줘"
--
-- 화면(client Tracker)이 모은 화면 이동(page) · 누른 단추(click) · 스크롤 깊이(scroll) · 열린 창(open)을 한 줄씩 남긴다.
-- 관리자 콘솔 '방문자 발자국'(/api/hiq/admin/visitors/*)이 읽는다. 무엇을 남기고 무엇을 남기지 않는지는 shared/uiTrail.ts.
--
--   visitor    브라우저 난수 ID — 방문 비콘(daily_visits.visitor)과 같은 값. 이름·IP 는 없다
--   member_id  로그인한 사람이면 회원 id(서명 쿠키). FK 를 걸지 않는다 — 회원이 지워져도 60일 통계는 남고, 지우는 쪽이 이 표 때문에 막히지 않는다
--   path       화면 주소(쿼리 제외)
--   meta       l 누른 글자(40자) · h 이동 주소 · d 스크롤 깊이 · ref 유입 호스트 · w 폰/PC · s 방문 한 번(탭)
--   created_at 이 표만 timestamptz 다(다른 표의 시간대 없는 UTC 와 다르다 — 한국 날짜로 자를 때 9시간 밀리는 함정을 피한다)
--
-- 60일이 지난 줄은 하루 한 번 도는 정리 크론(/api/cron/sim-cleanup)이 지운다.
-- 더하기만 한다(새 표 하나 + 인덱스 둘). 운영 DB 적용: 2026-10-08 (코드 배포 전에 먼저)

create table if not exists ui_events (
  id bigint generated always as identity primary key,
  name varchar(16) not null,
  visitor varchar(64) not null,
  member_id uuid,
  path varchar(300) not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ui_events_time_idx on ui_events (created_at);
create index if not exists ui_events_visitor_time_idx on ui_events (visitor, created_at);
