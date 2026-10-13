-- 낚시 조과 둘째 판(2026-10-14) — 더하기만. 무게 · 갈치의 지 · 방류 · 사진. 규칙: shared/fishing.ts · shared/fishingFish.ts
alter table fishing_catches add column if not exists weight_kg numeric(6,2);
alter table fishing_catches add column if not exists ji smallint;
alter table fishing_catches add column if not exists released boolean not null default false;
alter table fishing_catches add column if not exists photo_url text;
alter table fishing_catches add column if not exists thumb_url text;
