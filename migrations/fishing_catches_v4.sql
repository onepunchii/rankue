-- 조과의 자리(2026-10-15 오너: "좌표 받음") — 잡은 자리의 좌표와 그날 바다의 한 장(가까운 낚시지수 지점의 파고 · 바람 · 수온 · 물때).
-- 좌표는 고른 사람만, 내 기록에서만 쓴다(공개 화면은 내보내지 않는다). 옛 줄 · 좌표를 안 고른 줄은 NULL.
ALTER TABLE fishing_catches ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE fishing_catches ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE fishing_catches ADD COLUMN IF NOT EXISTS weather jsonb;
