-- 산악회 일정 — 고른 산(2026-10-13 오너: "크루에 정모 및 장소 입력에 산 주소가 자동 입력되어도 좋을 듯"의 다음 걸음).
-- 일정을 만들 때 고른 산의 주소(slug) 한 칸. 지금까지는 고른 산이 '모이는 곳'의 글만 채우고 남지 않았다 — 이 칸이 있어야
-- 일정 카드의 '산 정보 보기', 고치기 창의 '고른 산', 지난 일정의 '함께 정상 인증 N명'이 된다.
-- 규칙은 shared/crewMountain.ts(주소의 꼴), 쓰는 곳은 server/routes/modules/crew.ts(산악회만 받는다 — 당구 · 골프 크루의 일정은 늘 비어 있다).
-- 산의 표(hiking_mountains)에 묶지 않는다(외래 키 없음) — 산의 주소는 글자이고, 있는 산인지는 서버가 적을 때 본다.
--
-- 더하기만 한다(있는 줄은 그대로 — 새 칸은 전부 비어 있다). 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다:
--   · 정모 목록 · 정모 한 줄 읽기는 칸이 아직 없어도 버틴다(server/storage/crew.repo.ts — 산이 없는 일정으로 읽는다).
--   · 만들기 · 고치기 · 참석 · 정모 리마인더는 칸이 있어야 한다(일정 표의 모든 칸을 적거나 읽는다).
-- 되돌릴 때: alter table hiq_crew_activities drop column if exists mountain_slug;

alter table hiq_crew_activities add column if not exists mountain_slug text;
