-- 온라인 대전 자유 채팅(2026-09-16 오너: "멀티가 너무 정적이다 … 일단 자유로운 챗이 가능하게").
--
-- 이모지는 대전 행의 단일 슬롯이라 둘이 같은 폴링 창(2~5초)에 하나씩 보내면 앞의 것이 소리 없이 사라진다.
-- 대화는 그러면 안 되므로 샷(hiq_sim_match_shots)과 같은 자식 테이블 + 대전 행의 카운터로 둔다.
-- id 를 uuid PK 로 두는 건 나중에 신고를 붙일 자리를 미리 만드는 것이다(지금은 안 붙인다. 비용 0).
--
-- **적용 순서를 지켜라**: 이 SQL 을 먼저 DB 에 적용하고 그 다음 코드를 배포한다.
-- withNames() 가 hiq_sim_matches 컬럼을 전부 나열해 SELECT 하므로, chat_seq 가 스키마에만 있고 DB 에 없으면
-- get()·listMine()·listWatchable() 이 전부 죽어 /sim 전 경로가 500 난다.
--
-- 되돌리기: (코드를 먼저 되돌린 뒤)
--   drop table if exists hiq_sim_match_chats;
--   alter table hiq_sim_matches drop column if exists chat_seq;

alter table hiq_sim_matches add column if not exists chat_seq integer not null default 0;

create table if not exists hiq_sim_match_chats (
    id           uuid        primary key default gen_random_uuid() not null,
    match_id     uuid        not null references hiq_sim_matches(id) on delete cascade,
    seq          integer     not null,
    sender_index integer     not null,
    sender_id    uuid        not null references hiq_members(id),
    kind         text        not null default 'text',
    text         text        not null,
    client_key   text,
    created_at   timestamp   not null default now()
);

-- 커서 읽기(where match_id = ? and seq >= ?)가 이 btree 를 그대로 쓴다 — 추가 인덱스가 필요 없다.
create unique index if not exists hiq_sim_match_chats_match_id_seq_unique
    on hiq_sim_match_chats (match_id, seq);

-- 같은 전송의 재시도를 한 줄로 합친다(on conflict do nothing).
create unique index if not exists hiq_sim_match_chats_match_id_sender_index_client_key_unique
    on hiq_sim_match_chats (match_id, sender_index, client_key);
