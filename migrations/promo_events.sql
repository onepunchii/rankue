-- 검색 유입 → 가입 깔때기(2026-09-27) — 매장·선수 페이지 '길 찾기' 배너의 단계별 하루 유니크 방문자.
-- shared/schema.ts 의 promoEvents 와 같은 정의다. 단계: view · click · use · gate · signup, 출처: store · pba · umb.
--
-- 적용: Neon 콘솔 SQL 편집기에 이 파일 내용을 붙여 실행(추가만 하는 DDL — 기존 테이블에 영향 없음).
-- 이 테이블이 없어도 서비스는 정상 동작한다. 비콘은 조용히 실패하고 어드민에는 '미설정'으로 보인다.
-- 되돌릴 때: drop table promo_events;

create table if not exists promo_events (
  day        date      not null,
  src        text      not null,
  step       text      not null,
  visitor    text      not null,
  first_seen timestamp not null default now(),
  primary key (day, src, step, visitor)
);

create index if not exists promo_events_day_idx on promo_events (day);
