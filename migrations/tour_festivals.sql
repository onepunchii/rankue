-- 전국 축제 (2026-10-21)
-- 오너: "전국 축제랑 국토종주를 추가하고 싶은데" → 축제는 종목이 아니라 '갈 이유' — 공개 페이지(/festivals) + 종목마다 맞는 축제.
-- 한국관광공사 TourAPI(KorService2 · searchFestival2 목록 + detailIntro2 · detailCommon2 상세)를 하루 한 번 옮겨 둔다
-- (화면이 볼 때마다 부르면 개발 계정 하루 1,000번을 넘는다). 축제(EV01)만 · 좌표 있는 것만. 날짜는 'YYYYMMDD' 글자 그대로(시간대 함정 없게).
-- 이 표만 새로 만든다 — 다른 표는 건드리지 않는다. 채우는 곳: server/services/festivalSync.ts(매시 크론에 얹음) · server/scripts/sync-festivals.ts
--
-- 운영 DB 적용: 2026-10-21 (코드 배포 전에 먼저)
CREATE TABLE IF NOT EXISTS tour_festivals (
  content_id text PRIMARY KEY,
  title text NOT NULL,
  start_ymd text NOT NULL,
  end_ymd text NOT NULL,
  addr text,
  region text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  cat text,
  image text,
  image_lic text,
  tel text,
  modified text,
  place text,
  playtime text,
  fee text,
  host text,
  host_tel text,
  homepage text,
  overview text,
  detail_mod text,
  seen_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tour_festivals_end_idx ON tour_festivals (end_ymd);
