-- 수족관에서 뺀 어종(2026-10-18 오너: "수족관에 물고기 빼기") — 어종 이름 목록. 조과 기록은 그대로, 수조에서만 안 보인다
alter table fishing_tanks add column if not exists hidden_species text[] not null default '{}';
