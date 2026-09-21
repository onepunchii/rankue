-- 채팅 한 표(2026-09-21): 방 종류와 무관한 hiq_chat_messages + 1:1 방(hiq_chat_rooms/members).
-- 옛 크루 채팅·조인 방 메시지를 옮긴다(id 유지, 옛 표는 보관). 코드 배포보다 먼저 적용.
create table if not exists hiq_chat_messages (
  id uuid primary key default gen_random_uuid() not null,
  room_key text not null,
  sender_id uuid references hiq_members(id),
  message text not null,
  type text not null default 'text',
  metadata jsonb,
  created_at timestamp not null default now()
);
create index if not exists idx_chat_messages_room on hiq_chat_messages(room_key, created_at);
create table if not exists hiq_chat_rooms (
  id uuid primary key default gen_random_uuid() not null,
  kind text not null default 'dm',
  title text,
  created_by uuid references hiq_members(id),
  created_at timestamp not null default now()
);
create table if not exists hiq_chat_room_members (
  id uuid primary key default gen_random_uuid() not null,
  room_id uuid not null references hiq_chat_rooms(id) on delete cascade,
  member_id uuid not null references hiq_members(id),
  joined_at timestamp not null default now(),
  unique(room_id, member_id)
);
insert into hiq_chat_messages (id, room_key, sender_id, message, type, metadata, created_at)
  select id, 'crew:' || crew_id, sender_id, message, type, metadata, created_at from hiq_crew_chats
  on conflict (id) do nothing;
insert into hiq_chat_messages (id, room_key, sender_id, message, type, metadata, created_at)
  select id, 'listing:' || booking_id, sender_id, message, type, metadata, created_at from hiq_listing_chats
  on conflict (id) do nothing;
