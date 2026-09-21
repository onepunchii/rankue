-- 1:1·소그룹 방에 종목(2026-09-21 오너: "골프 채팅과 당구 채팅은 구별되게").
-- 채팅 탭이 종목별로 갈리므로 방도 종목을 가진다. 기존 방은 당구로 둔다.
alter table hiq_chat_rooms add column if not exists sport text not null default 'BILLIARDS';
