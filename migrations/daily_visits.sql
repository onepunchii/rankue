-- 일별 유니크 웹 접속자 — 슈퍼관리자 대시보드의 "접속자" 지표.
-- shared/schema.ts 의 dailyVisits 와 같은 정의다.
--
-- ⚠️ hiq_visit_logs 와 혼동하지 말 것. 그쪽은 **회원의 매장 방문 기록**이라 member_id 가
--    필수이고 로그인하지 않은 사람은 잡히지 않는다. 이 테이블은 가입 여부와 무관한
--    웹/앱 접속자를 센다. 대시보드에서도 "접속자" vs "매장방문"으로 라벨을 나눴다.
--
-- 적용 방법 (둘 중 하나):
--   1) Neon 콘솔 SQL 편집기에 이 파일 내용을 붙여 실행 — 이 방법을 권한다.
--      추가만 하는 DDL 이라 기존 테이블에 영향이 없다.
--   2) npm run db:push (drizzle-kit) — ⚠️ 스키마 전체를 동기화하므로 DB 가 코드와
--      어긋나 있으면 의도치 않은 ALTER 가 생길 수 있다. 프로덕션에서는 1) 이 안전하다.
--
-- 이 테이블이 없어도 서비스는 정상 동작한다. 비콘은 조용히 실패하고
-- 대시보드에는 "접속자: 미설정" 으로 표시된다(0 명이 아니라 미설정 — 둘은 다른 사실이다).

create table if not exists daily_visits (
  day        date        not null,
  visitor    text        not null,
  first_seen timestamp   not null default now(),
  primary key (day, visitor)
);

-- "오늘/어제 몇 명" 이 유일한 읽기 패턴이다.
create index if not exists daily_visits_day_idx on daily_visits (day);
