-- 카카오 지도 하루 사용 수(2026-10-25) — 유료(0.1원/건)라 서버가 하루 전체 상한을 지킨다. 규칙은 shared/kakaoMap.ts.
-- 하루에 한 줄(한국 날짜). loads = 띄우라고 허락한 수, refused = 상한에 걸려 거절한 수.
-- 더하기만 한다. 배포 **전에** 먼저 돌린다.
-- 되돌릴 때: drop table kakao_map_loads;
create table if not exists kakao_map_loads (
    day date primary key,
    loads integer not null default 0,
    refused integer not null default 0,
    updated_at timestamptz not null default now()
);
