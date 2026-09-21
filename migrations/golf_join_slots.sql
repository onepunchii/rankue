-- 골프 조인 2026-09-21: 자리(slot) 모델 · 스크린/파크 조인 · 1/N 비용 · 장소 좌표(내 주변 정렬).
-- 신청 상태에 accepted/rejected 가 생겼다(호스트 승인제) — status 는 text 라 DB 변경은 없다.
-- 코드 배포보다 먼저 적용한다(select * 가 새 칸을 찾는다). 되돌릴 때:
--   alter table golf_bookings drop column join_type, drop column slots, drop column cost_mode, drop column venue_name, drop column lat, drop column lng;
alter table golf_bookings add column if not exists join_type text;
alter table golf_bookings add column if not exists slots jsonb;
alter table golf_bookings add column if not exists cost_mode text;
alter table golf_bookings add column if not exists venue_name text;
alter table golf_bookings add column if not exists lat double precision;
alter table golf_bookings add column if not exists lng double precision;
