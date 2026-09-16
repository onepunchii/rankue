-- 전화번호 가입자의 국가를 KR 로 채운다(2026-09-17 오너: "전화번호는 다 한국이야").
--
-- 왜 비어 있었나: 국가는 Vercel 의 x-vercel-ip-country 헤더로만 잡는데, 그 코드가 **소셜 가입 경로에만**
-- 있었다. 실측 — 소셜 36명 중 35명(97%) 국가 있음, 전화 41명 중 0명. 대전을 하는 사람이 대부분 초기
-- 전화번호 가입자라, 대전 헤더의 국기가 13명 중 1명만 떴다.
--
-- 안전장치 둘: (1) 이미 값이 있으면 건드리지 않는다, (2) 010 으로 시작하는 실제 한국 번호만 채운다
-- (테스트 계정 000- 한 건은 제외). 소셜 가입자는 헤더로 잡힌 진짜 국가가 있으므로 조건에서 빠진다.
--
-- 되돌리기: update profiles set country_code = null where country_code = 'KR' and google_sub is null and apple_sub is null;

update profiles
set country_code = 'KR'
where country_code is null
  and google_sub is null
  and apple_sub is null
  and phone like '010%';
