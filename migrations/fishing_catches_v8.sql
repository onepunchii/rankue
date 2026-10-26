-- 조과의 시각 · 물 · 채비(2026-10-26 낚시 탭 리뷰 — "들물 · 날물과 같이 보는 게 낚시 일지의 핵심, 내 장비의 채비 조합을 고르게"). 더하기만: 칸 셋.
-- caught_at: 몇 시쯤(한국 시각 'HH:MM'). tide_flow: 그 시각의 물('들물' | '날물' — 적을 때 가까운 항구의 그날 조석으로 센다, 모르면 NULL).
-- rig: 채비(내 장비의 '채비 조합' 이름이나 직접 적은 글, 30자). 옛 줄은 모두 NULL. 배포 **전에** 먼저 돌린다.
-- 되돌릴 때: alter table fishing_catches drop column if exists caught_at; alter table fishing_catches drop column if exists tide_flow; alter table fishing_catches drop column if exists rig;
alter table fishing_catches add column if not exists caught_at text;
alter table fishing_catches add column if not exists tide_flow text;
alter table fishing_catches add column if not exists rig text;
