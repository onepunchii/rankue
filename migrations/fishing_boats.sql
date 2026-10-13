-- 낚시어선 명부(2026-10-14) — 해양수산부 낚시 어선업 신고정보를 통째로 받아 둔 것(server/scripts/fishing-load-boats.ts).
-- 지역으로 거르는 변수가 없는 API 라 우리 표에서 찾는다. 받은 값 그대로(공공누리 1유형 — 화면에 출처를 적는다).
CREATE TABLE IF NOT EXISTS fishing_boats (
  id text PRIMARY KEY,                 -- 어선 번호(fsboNo)
  name text NOT NULL,
  region text NOT NULL DEFAULT '',     -- 시도 · 시군구(신고확인번호의 앞부분)
  port text,                           -- 선적항(적힌 그대로)
  tons numeric,
  passengers integer,
  valid_until date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fishing_boats_region_idx ON fishing_boats (region);
