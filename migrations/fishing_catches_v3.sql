-- 조과에 그날의 물때를(2026-10-14) — 어느 바다 식으로 세는가만 남긴다('west' 7물때 · 'south' 8물때). 물때 이름은 날짜로 그때그때 센다.
-- 민물 · 옛 줄은 NULL.
ALTER TABLE fishing_catches ADD COLUMN IF NOT EXISTS tide_sea text;
