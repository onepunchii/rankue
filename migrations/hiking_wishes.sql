-- 등산 — 가고 싶은 산(2026-10-13 오너: "골프 CC 상세 페이지 기능을 산 상세 페이지에 접목" — 골프의 '관심 등록'에 해당).
-- 회원이 산에 눌러 둔 표시 하나. 규칙은 shared/hikingWish.ts, 읽고 쓰는 곳은 server/storage/hikingWishes.ts.
-- 위치 · 날짜 계획 같은 것은 없다 — 어느 회원이 어느 산을 담았는가뿐이다.
--
-- 더하기만 한다. 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiking_wishes;

create table if not exists hiking_wishes (
  member_id   uuid not null references hiq_members(id) on delete cascade,
  mountain_id text not null references hiking_mountains(id) on delete cascade,
  created_at  timestamp not null default now(),
  primary key (member_id, mountain_id)
);
