-- 등산 — 산행 사진 응원(2026-11-04 오너: "사진 응원 기능만 먼저 시행하자").
-- 공개 산행 사진에 다른 회원이 누르는 응원 하나. 사람마다 사진 하나에 한 번(다시 누르면 거둔다). 규칙은 shared/hikingPhotos.ts,
-- 읽고 쓰는 곳은 server/storage/hikingPhotos.ts. 사진이 지워지면 같이 지워진다. 탈퇴는 withdrawPurge 가 지운다(회원 행이 남아 cascade 가 돌지 않는다).
--
-- 더하기만 한다. 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiking_photo_cheers;

create table if not exists hiking_photo_cheers (
  photo_id   uuid not null references hiking_photos(id) on delete cascade,
  member_id  uuid not null references hiq_members(id) on delete cascade,
  created_at timestamp not null default now(),
  primary key (photo_id, member_id)
);
create index if not exists hiking_photo_cheers_member_idx on hiking_photo_cheers (member_id);
