-- 카카오 유료 호출 하루 수(2026-10-25) — 로드뷰 · 근처 장소(카테고리 검색). 지도는 kakao_map_loads 에 따로 센다. 규칙은 shared/kakaoMap.ts KAKAO_KIND.
-- 하루 · 종류마다 한 줄(한국 날짜). calls = 허락한 수, refused = 상한에 걸려 거절한 수.
-- 더하기만 한다. 배포 **전에** 먼저 돌린다.
-- 되돌릴 때: drop table kakao_api_calls;
create table if not exists kakao_api_calls (
    day date not null,
    kind varchar(16) not null,
    calls integer not null default 0,
    refused integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (day, kind)
);
