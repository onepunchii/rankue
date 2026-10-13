-- 오늘의 바다(2026-10-14) — 기상청 특보 현황(getPwnStatus)을 받아 둔 것 한 줄. 화면을 열 때 15분보다 낡았으면 다시 받는다.
-- data: { t6, t7, tmFc, tmEf, tmSeq } — 받은 글 그대로 둔다(읽는 규칙은 shared/fishingSea 가 바뀌어도 다시 읽을 수 있게).
CREATE TABLE IF NOT EXISTS fishing_sea_status (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
