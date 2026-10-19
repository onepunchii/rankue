-- 전국 당구장 인허가 자료를 매장 디렉토리에 잇는다 (2026-10-19)
-- 오너: "당구장이 1만 곳이 넘는데 우리 1,100개밖에 없잖아 — 다 연결하면 디비나 사이트맵이 풍부해질 것 같은데" → 「행정안전부_생활_당구장업 조회서비스」 신청
--
-- 영업 중 15,191곳(같은 날 실측) — 우리 1,199곳 중 969곳이 그 안의 같은 곳, 14,222곳이 새로 들어온다(shared/billiardHalls matchHalls).
-- 더하기만 한다(열 · 색인). 있던 행의 이름 · 주소 · 좌표는 건드리지 않는다 — 같은 곳으로 맞은 행에는 아래 gov_* 열만 채운다.
--   source        'collected'(수집 CSV · 등록 · 제보로 들어온 행 — 지금 전부) | 'gov'(인허가 자료로만 들어온 행)
--   gov_key       개방자치단체코드-관리번호(관리번호만으로는 겹친다)
--   gov_lat/lng   인허가 좌표(EPSG:5174 → WGS84, 건물 번지와 견줘 중앙 7m) — 있던 좌표(Nominatim, 동 · 구 수준으로 떨어진 것 포함)보다 정확해 읽을 때 먼저 쓴다
--   license_date  인허가일 · gov_status open|paused|closed · gov_closed_date 폐업일 · gov_checked_at 마지막으로 받은 때
--
-- 운영 DB 적용: 2026-10-19 (코드 배포 전에 먼저)
-- 적용 확인:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'store_listings'
--    AND column_name IN ('source','gov_key','gov_lat','gov_lng','license_date','gov_status','gov_closed_date','gov_checked_at');   -- 8줄

ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'collected';
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_key text;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_lat double precision;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_lng double precision;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS license_date date;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_status text;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_closed_date date;
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS gov_checked_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS store_listings_gov_key_uq ON store_listings (gov_key) WHERE gov_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS store_listings_source_idx ON store_listings (source);
