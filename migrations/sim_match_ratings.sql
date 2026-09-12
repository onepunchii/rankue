-- 온라인 대전 레이팅을 테이블(대대·중대) 통합으로 옮긴다(2026-09-12 오너: "대대 중대 통합해줘").
-- 옛 값은 hiq_sim_ratings 에 종목·테이블별로 있었다. 합칠 때 레이팅은 판 수로 가중 평균한다
-- (Elo 는 더할 수 있는 값이 아니다 — 많이 친 판의 값이 그 사람 실력에 가깝다).
create table if not exists hiq_sim_match_ratings (
    member_id  uuid not null references hiq_members(id),
    game_type  text not null,
    rating     integer not null default 1000,
    matches    integer not null default 0,
    wins       integer not null default 0,
    updated_at timestamp not null default now(),
    primary key (member_id, game_type)
);

insert into hiq_sim_match_ratings (member_id, game_type, rating, matches, wins, updated_at)
select r.member_id, r.game_type,
       round(sum(r.sim_rating::numeric * r.matches) / nullif(sum(r.matches), 0))::int,
       sum(r.matches)::int, sum(r.wins)::int, now()
from hiq_sim_ratings r
where r.matches > 0
group by r.member_id, r.game_type
on conflict (member_id, game_type) do nothing;
