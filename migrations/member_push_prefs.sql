-- 알림 카테고리별 켬/끔(2026-09-13 오너: "크루 알림·온라인게임 알림 등 카테고리로 나눠서").
-- 끈 것만 담는다({"rooms": false}); NULL = 전부 켜짐.
alter table hiq_members add column if not exists push_prefs jsonb;
