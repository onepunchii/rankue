-- 라운드 사진(2026-09-30) — 랭큐매치 점수 적을 때 올리는 사진. 앨범(그 경기 참가자)과 골프장 페이지(공개로 돌린 것만).
-- shared/schema.ts 의 golfRoundPhotos 와 같은 정의다.
--
-- 적용: 따로 돌리지 않아도 된다 — 첫 업로드(POST /api/hiq/golf/match/:id/photos)가 표가 없으면 같은 DDL 로 만든다
--       (server/storage/golfPhoto.repo.ts ensureTable). 읽기는 표가 없으면 빈 목록으로 조용히 넘어간다.
--       미리 만들어 두려면 Neon 콘솔 SQL 편집기에 이 파일 내용을 붙여 실행(추가만 하는 DDL — 기존 테이블에 영향 없음).
-- 되돌릴 때: drop table golf_round_photos;  (사진 Blob 은 따로 남는다 — hiq/golf-photo·hiq/golf-thumb 접두어)

create table if not exists golf_round_photos (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references golf_match_sessions(id) on delete cascade,
  member_id   uuid not null references hiq_members(id) on delete cascade,
  hole_no     integer,
  url         text not null,
  thumb_url   text not null,
  width       integer,
  height      integer,
  is_public   boolean not null default false,
  course_slug text,
  hidden_at   timestamp,
  created_at  timestamp not null default now()
);

-- 이의제기(9/30 추가, 운영 DB 에는 적용 완료) — 자동 가림 사진의 작성자 원탭 이의제기
alter table golf_round_photos add column if not exists appeal_text text;
alter table golf_round_photos add column if not exists appeal_at timestamp;

create index if not exists golf_round_photos_session_idx on golf_round_photos (session_id);
create index if not exists golf_round_photos_course_idx on golf_round_photos (course_slug, is_public, created_at);
