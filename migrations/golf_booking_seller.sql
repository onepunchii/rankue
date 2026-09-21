-- 부킹은 누구나(2026-09-21 오너 A안): 올린 쪽을 적는다 — STORE(매장·매니저) / PERSONAL(개인 양도). 옛 글은 null = 매장.
-- 코드 배포보다 먼저 적용. 되돌릴 때: alter table golf_bookings drop column seller_type;
alter table golf_bookings add column if not exists seller_type text;
