-- 등산 — 코스를 빌려 보는 줄(2026-10-13). 받은 코스 묶음은 봉우리마다 묶여 있어, 산림청 100대 명산 가운데 40곳은 제 이름의 코스가 없다.
-- 그런데 이웃 봉우리의 코스 가운데 그 명산의 정상을 지나는 것이 있다(금정산 · 무학산 · 백덕산 …). 코스를 옮기지 않고 **이어서** 보여 준다 —
-- 이웃 봉우리의 화면은 그대로 두고, 명산 화면에도 그 코스가 나온다. 잇는 것은 server/scripts/hiking-link-courses.ts.
--
-- 더하기만 한다. 배포 **전에** 먼저 돌린다. 되돌릴 때: drop table hiking_course_links; (그리고 스크립트가 고친 명산의 course_count 를 다시 적재로 되돌린다)

create table if not exists hiking_course_links (
  mountain_id text not null references hiking_mountains(id) on delete cascade,
  course_id   text not null references hiking_courses(id) on delete cascade,
  -- 이 코스 위에서 이 산의 정상이 놓인 거리(km) — 코스의 제 주인(봉우리)의 summit_km 과 다르다
  summit_km   numeric(7,3) not null,
  created_at  timestamp not null default now(),
  primary key (mountain_id, course_id)
);
create index if not exists hiking_course_links_course_idx on hiking_course_links (course_id);
