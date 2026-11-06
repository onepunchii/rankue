-- 매장 대회(2026-11-06 오너 '추천대로' 사장님 도구 ② — shared/storeCup.ts).
-- 사장님이 연 대회도 크루 대회의 표(hiq_crew_tournaments · _participants · _matches)를 그대로 쓴다 — 접수 · 대진 · 점수판 경기 · 승자 올리기가
-- 이미 다 있다. 매장 대회는 crew_id 대신 store_id 를 갖는다(둘 중 하나 — 코드가 지킨다).
-- 열을 더하고, crew_id 의 '반드시 있음'만 푼다(지우는 데이터 없음 — 크루 대회 줄은 그대로 crew_id 가 있다).
-- 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다(크루 대회 화면이 표를 통째로 읽는다).
-- 되돌릴 때(매장 대회 줄이 없을 때만): alter table hiq_crew_tournaments alter column crew_id set not null; 열 셋 · 색인 하나를 지운다.

alter table hiq_crew_tournaments add column if not exists store_id uuid references hiq_stores(id) on delete cascade;
alter table hiq_crew_tournaments add column if not exists entry_fee integer;
alter table hiq_crew_tournaments alter column crew_id drop not null;
alter table hiq_crew_tournament_participants add column if not exists fee_paid boolean not null default false;
create index if not exists hiq_crew_tournaments_store_idx on hiq_crew_tournaments (store_id, created_at) where store_id is not null;
