-- 골프장 코스 가이드(2026-10-12) — 개요 · 코스 구성 · 코스 특징 · 대표 홀 · 시설 · 오는 길 · 라운드 팁 · 자주 묻는 것.
-- 모양과 거르는 규칙은 shared/golfCourseGuide.ts. 적재 스크립트(golf-course-pages.ts)는 이 칸을 건드리지 않는다(다시 적재해도 남는다).
-- 더하기만 한다. 값이 없으면(null) 화면은 가이드 구역을 그리지 않는다.
alter table golf_course_pages add column if not exists guide jsonb;
