-- 부킹도 앱 안 예약 신청(2026-09-21): 신청 행에 인원. 조인은 1. 되돌릴 때: alter table golf_join_requests drop column headcount;
alter table golf_join_requests add column if not exists headcount integer not null default 1;
