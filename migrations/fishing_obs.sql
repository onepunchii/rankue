-- 낚시 출조 브리핑이 받아 둔 공공 자료(2026-10-14) — 종류(kind)와 열쇠(key)마다 한 줄.
--   tide  '<항구 코드>:<YYYY-MM-DD>'  그날의 예측 조위(10분 간격) — 예측이라 바뀌지 않는다
--   sun   '<항구 코드>:<YYYY-MM-DD>'  해 · 달의 출몰 시각
--   index '<낚시지수 지점 이름>'      바다낚시지수 엿새치(세 시간마다 다시 받는다)
--   now   '<항구 코드>'               지금의 수온 · 기온 · 가까운 부이 · 해무관측소(20분마다 다시 받는다)
-- 받은 자료는 공공누리 1유형(국립해양조사원 · 한국천문연구원) — 화면에 출처를 적는다.
CREATE TABLE IF NOT EXISTS fishing_obs (
  kind text NOT NULL,
  key text NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
