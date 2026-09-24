-- 2026-09-24 골프장 페이지 보강 — 로고·잔디·플레이 방식·연락처·홈페이지·대표 그린피·인기·별칭
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS grass text[] NOT NULL DEFAULT '{}';
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS play text[] NOT NULL DEFAULT '{}';
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS fee_from integer;
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS popularity integer NOT NULL DEFAULT 0;
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE golf_course_pages ADD COLUMN IF NOT EXISTS ext_ids integer[] NOT NULL DEFAULT '{}';
