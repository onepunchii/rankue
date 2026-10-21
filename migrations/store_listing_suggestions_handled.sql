-- 매장 정보 제보 '처리함' (2026-10-21)
-- 매장 페이지의 '수정 제안'(POST /listings/:code/suggest)이 store_listing_suggestions 에 쌓이는데 어드민에 보는 화면이 없었다(2건 · 아무도 못 봄).
-- 어드민 '매장 정보 제보'에서 처리했다고 표시한다. 더하기만 한다(빈 열 하나).
--
-- 운영 DB 적용: 2026-10-21 (코드 배포 전에 먼저)
-- 적용 확인:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'store_listing_suggestions' AND column_name = 'handled_at';   -- 1줄

ALTER TABLE store_listing_suggestions ADD COLUMN IF NOT EXISTS handled_at timestamp;
