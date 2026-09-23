-- 알림함 인덱스(2026-09-23). PK 하나뿐이라 "내 알림 최신순 한 페이지"가 Seq Scan + top-N Sort 였다
-- (4,528행 전부를 훑어 893행을 골라내고 정렬). 커서 페이징(created_at < ?)도 이 인덱스가 받는다.
-- 운영 반영 실측: Seq Scan 174 buffers / 0.72ms → Index Scan 13 buffers / 0.06ms.
create index concurrently if not exists hiq_notifications_member_created_idx
  on hiq_notifications (member_id, created_at desc);
