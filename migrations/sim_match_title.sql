-- 멀티방 방제(2026-10-06 오너: "당구 멀티방에서 방제를 만들 수 있게"). 선택 입력 20자, 공개 방에만 쓴다.
-- 비어 있으면(null) 예전처럼 방장 이름이 방의 얼굴이다. 있던 방은 전부 null.
alter table hiq_sim_matches add column if not exists title text;
