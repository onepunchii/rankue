-- 등산 — 산행 사진을 공개로(2026-10-13 오너: "사진 공개가 기본인데 본인이 공개 비공개 할 수 있게, 골프에 골프장 목록에 사진 올리는 것처럼").
-- 규칙은 shared/hikingPhotos.ts, 읽고 쓰는 곳은 server/storage/hikingPhotos.ts.
--
-- is_public 의 기본값은 false 다 — 공개가 기본이라는 것은 **새 화면이 올리는 사진**의 이야기이고, 그 값은 서버가 줄마다 적는다.
--   · 이미 있는 줄은 false 로 남는다: "내 사진첩에만 담겨요"라고 적힌 화면에서 올린 사진이다.
--   · 이 파일을 돌린 뒤 새 코드가 배포되기 전까지 옛 코드가 넣는 줄(공개 여부를 적지 않는다)도 같은 약속 아래 올린 것이라 false 다.
-- hidden_at 은 가림(서로 다른 3명 신고 · 운영자), appeal_* 은 올린 사람의 이의제기다. **좌표 칸은 없다.**
--
-- 더하기만 한다. 여러 번 돌려도 같다. 배포 **전에** 먼저 돌린다 — 올리기 · 공개 바꾸기 · 가리기 · 이의제기가 이 칸들에 쓴다
-- (읽기와 운영자 신고 큐는 칸이 아직 없어도 버틴다: 내 사진은 전부 비공개로, 이 산의 사진은 빈 값으로).
-- 되돌릴 때: drop index if exists hiking_photos_public_idx;
--            alter table hiking_photos drop column if exists is_public, drop column if exists hidden_at, drop column if exists appeal_text, drop column if exists appeal_at;

alter table hiking_photos add column if not exists is_public   boolean not null default false;
alter table hiking_photos add column if not exists hidden_at   timestamp;
alter table hiking_photos add column if not exists appeal_text text;
alter table hiking_photos add column if not exists appeal_at   timestamp;

-- 산 화면 '이 산의 사진' — 그 산의 공개 · 안 가려진 사진을 새 것부터
create index if not exists hiking_photos_public_idx on hiking_photos (mountain_id, taken_at desc) where is_public and hidden_at is null;
