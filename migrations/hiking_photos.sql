-- 등산 — 산행 사진(2026-10-13). 규칙은 shared/hikingPhotos.ts — 첫 걸음은 올린 사람만 보는 내 사진첩이다.
-- **어디서 찍었는지(좌표)는 저장하지 않는다** — 어느 산의 사진인지와 올린 때만. 사진 파일의 위치 정보는 올릴 때 지운다.
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiking_photos;

create table if not exists hiking_photos (
  id          uuid primary key default gen_random_uuid() not null,
  member_id   uuid not null references hiq_members(id) on delete cascade,
  mountain_id text not null references hiking_mountains(id),
  -- 우리 저장소의 주소(hiq/hiking-photo/ · hiq/hiking-thumb/)
  url         text not null,
  thumb_url   text not null,
  width       integer not null,
  height      integer not null,
  -- 올린 때(찍은 때가 아니다 — 사진의 정보는 지우고 받는다)
  taken_at    timestamp not null default now(),
  created_at  timestamp not null default now()
);
create index if not exists hiking_photos_member_mountain_idx on hiking_photos (member_id, mountain_id, taken_at desc);
