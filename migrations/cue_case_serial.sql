-- 큐 케이스 넘버링(2026-10-16 오너: "총 몇 명이 가지고 넘버링처럼") — 받은 기록에 '몇 번째 주인인가'(serial) 칸을 더한다.
-- 번호는 한 번 정하면 바꾸지 않는다(받은 순서 = 기록에 적힌 순서). 이미 있는 줄은 적힌 순서(created_at → earned_at → id)대로 매긴다.
-- 더하기만: 칸 하나 · 이름 붙은 고유 묶음 하나(같은 물건에 같은 번호 둘 금지). 되돌릴 때: alter table hiq_cue_case_awards drop column serial;
alter table hiq_cue_case_awards add column if not exists serial integer;
update hiq_cue_case_awards a set serial = s.rn
  from (select id, row_number() over (partition by item_id order by created_at, earned_at, id) as rn from hiq_cue_case_awards) s
  where a.id = s.id and a.serial is null;
create unique index if not exists hiq_cue_case_awards_item_serial_unique on hiq_cue_case_awards (item_id, serial);
