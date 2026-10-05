-- 골프장 날씨(2026-10-05 오너: "기상청 날씨 … 순서대로 하자") — 기상청 예보를 받아 둔 것.
-- 공공누리 1유형(출처 표시)이라 저장·게재할 수 있다. 골프장마다가 아니라 격자(5km)·구역마다 한 줄 — 이웃 골프장은 같은 줄을 본다.
-- 채우는 곳: server/services/golfWeather.ts(상세를 열 때 낡았으면 받아 오고, 크론이 조금씩 데워 둔다).

-- 단기예보: 격자 하나에 가장 새 발표 한 벌
CREATE TABLE IF NOT EXISTS golf_weather_grid (
  nx integer NOT NULL,
  ny integer NOT NULL,
  base text NOT NULL,                       -- 발표 시각 'YYYYMMDDHHmm'(한국 시각)
  data jsonb NOT NULL,                      -- { hours: [...], minmax: {...} } — shared/golfWeather WxGrid
  fetched_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (nx, ny)
);
CREATE INDEX IF NOT EXISTS golf_weather_grid_fetched_idx ON golf_weather_grid (fetched_at);

-- 중기예보: 구역코드 하나에 한 줄(육상 권역 11B00000 … · 기온 시군 11B10101 …)
CREATE TABLE IF NOT EXISTS golf_weather_mid (
  reg_id text PRIMARY KEY,
  base text NOT NULL,                       -- 발표 시각 'YYYYMMDDHHmm'
  data jsonb NOT NULL,
  fetched_at timestamp NOT NULL DEFAULT now()
);
