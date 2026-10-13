-- 등산 코스 — 길의 종류(2026-10-13). 산림청 100대 명산 코스 파일(한국등산트레킹지원센터)은 점마다 그 구간이 어떤 길인지 적어 두었다
-- (오솔길 · 계단 · 너덜길 · 포장길 · 암릉 …). 코스마다 [[종류, km], …]로 더해 싣는다(shared/hikingSurface.ts).
-- 그 파일에서 온 코스(frtrl_id 'k100-…')에만 값이 있고, 그 밖의 코스는 비어 있다(null).
--
-- 더하기만 한다(있는 줄은 그대로 — 새 칸은 전부 비어 있다). 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다(산 화면이 이 칸을 읽는다).
-- 되돌릴 때: alter table hiking_courses drop column if exists surface;

alter table hiking_courses add column if not exists surface jsonb;
