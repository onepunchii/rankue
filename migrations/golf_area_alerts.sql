-- 지역 조인·부킹 알림(2026-10-05 오너: "2단계까지 진행" — 검색으로 들어온 사람이 빈 목록에서 '이 지역에 올라오면 알려 주세요'를 켠다).
-- 한 회원·한 지역에 한 줄. cities 가 비면 그 지역 전체, 있으면 그 시군만. filters 는 관심 골프장과 같은 모양(kinds·days·parts·maxFee·minSeats).
-- 회원 행은 탈퇴해도 '탈퇴회원'으로 남으므로(전적 보존) ON DELETE CASCADE 만으로는 안 지워진다 — deleteAccount 가 직접 지운다.
CREATE TABLE IF NOT EXISTS golf_area_alerts (
  member_id uuid NOT NULL REFERENCES hiq_members(id) ON DELETE CASCADE,
  region text NOT NULL,
  cities text[] NOT NULL DEFAULT '{}',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, region)
);
CREATE INDEX IF NOT EXISTS golf_area_alerts_region_idx ON golf_area_alerts (region);
