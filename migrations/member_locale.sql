-- 회원 앱 언어(2026-09-22) — 푸시·오류 문구를 받는 사람 언어로 만들기 위해. GET /me 때 x-locale 헤더로 갱신.
alter table hiq_members add column if not exists locale text not null default 'ko';
