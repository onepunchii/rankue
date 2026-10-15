-- 어종 랭킹(2026-10-15 오너: "내가 공개여부 가능") — 조과마다 '랭킹에 올리기'. 기본은 꺼짐(옛 줄은 모두 비공개로 남는다).
ALTER TABLE fishing_catches ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fishing_catches_public_species ON fishing_catches (species) WHERE is_public;
