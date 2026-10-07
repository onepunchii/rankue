-- 골프장 페이지: 어드민에서 고친 칸은 자료를 다시 적재해도 남긴다 (2026-10-07)
-- 오너: "이거 잘못된 정보라 수정가능하게 — 1.원장좌표 수정시 골프장 좌표가 자동 반영되게 2.골프장 명 수정 가능하게"
--
-- golf_course_pages 는 적재 스크립트(server/scripts/golf-course-pages.ts --write)가 원본 자료로 통째로 다시 쓴다.
-- 어드민에서 이름·좌표·홈페이지·전화를 고쳐도 다음 적재 때 원래 값으로 돌아갔다.
-- admin_keep 에 '어드민이 고친 칸'의 이름(name · coords · website · phone)을 적어 두고, 적재 스크립트는 그 칸을 건드리지 않는다.
--
-- 더하기만 한다(열 하나, 기본값 빈 배열). 옛 행은 전부 빈 배열 = 예전과 같은 동작.
--
-- 운영 DB 적용: 2026-10-07 (코드 배포 전에 먼저)

alter table golf_course_pages add column if not exists admin_keep text[] not null default '{}'::text[];
