-- 주 종목(2026-10-01) — 가입 때 고른 종목으로 앱이 시작한다. null = 아직 안 고름(한 번 묻는다). 덧붙이기만 한다.
ALTER TABLE hiq_members ADD COLUMN IF NOT EXISTS primary_sport text;
