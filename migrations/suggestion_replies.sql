-- 건의 답장 기록 — shared/schema.ts 의 suggestionReplies 와 같은 정의다(2026-09-11).
--
-- 운영자가 대시보드 건의함에서 '앱으로 답장'한 내용을 건의에 붙여 남긴다(오너 요청 "내가 답장한 내역도 볼 수 있게").
-- 그전 답장은 회원 알림(hiq_notifications type 'suggestion_reply')으로만 남아 어느 건의에 답했는지 기록이 없었다.
-- 옛 답장은 scripts/backfill-suggestion-replies.ts 로 옮긴다(미리보기 → --apply).
--
-- 추가만 하는 DDL 이라 기존 테이블에 영향이 없고, 여러 번 실행해도 같다(if not exists).
-- 제약 이름은 drizzle-kit 이 짓는 이름과 맞췄다 — 나중에 db:push 가 이름 차이로 지웠다 다시 만들지 않게.

create table if not exists suggestion_replies (
  id               uuid      primary key default gen_random_uuid() not null,
  suggestion_id    uuid      not null,
  message          text      not null,
  admin_profile_id uuid,                                  -- 보낸 운영자(프로필). 옛 답장 이관분은 비어 있다
  created_at       timestamp not null default now(),
  constraint suggestion_replies_suggestion_id_suggestions_id_fk
    foreign key (suggestion_id) references suggestions(id) on delete cascade
);

create index if not exists suggestion_replies_suggestion_idx on suggestion_replies (suggestion_id, created_at);
