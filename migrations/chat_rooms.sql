-- 채팅(2026-09-21): 조인·부킹 대화방 메시지 + 방별 읽은 시각. 코드 배포보다 먼저 적용.
-- 되돌릴 때: drop table hiq_listing_chats; drop table hiq_chat_reads;
create table if not exists hiq_listing_chats (
  id uuid primary key default gen_random_uuid() not null,
  booking_id uuid not null references golf_bookings(id) on delete cascade,
  sender_id uuid references hiq_members(id),
  message text not null,
  type text not null default 'text',
  metadata jsonb,
  created_at timestamp not null default now()
);
create index if not exists idx_listing_chats_room on hiq_listing_chats(booking_id, created_at);
create table if not exists hiq_chat_reads (
  id uuid primary key default gen_random_uuid() not null,
  room_key text not null,
  member_id uuid not null references hiq_members(id),
  last_read_at timestamp not null default now(),
  unique(room_key, member_id)
);
