-- 테이블 QR — 이 매장에서 친 경기(2026-11-06 오너 '추천대로' 사장님 도구 ①, shared/storeVenue.ts).
-- 손님이 테이블의 QR 을 찍고 연 점수판 경기에 그 매장 · 테이블을 적는다. 회원의 소속(store_id = 가입 매장)은 그대로 — '어디서 쳤나'만 더한다.
-- 사장님 대시보드의 '우리 매장에서 친 경기' · 매장 페이지의 '이번 달 이 매장 경기 · 이달의 에버 왕'이 읽는다.
-- 더하기만 한다. 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다(hiq_games 를 통째로 읽는 곳이 많다).
-- 되돌릴 때: drop index if exists hiq_games_venue_idx; alter table hiq_games drop column venue_store_id, drop column table_no;

alter table hiq_games add column if not exists venue_store_id uuid references hiq_stores(id);
alter table hiq_games add column if not exists table_no integer;
create index if not exists hiq_games_venue_idx on hiq_games (venue_store_id, played_at) where venue_store_id is not null;
