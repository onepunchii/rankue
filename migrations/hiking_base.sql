-- 등산 — 산 · 코스 · 길 위의 지점(2026-10-13 오너: "우리가 가장 잘하는 산에 대한 정보를 페이지 만들어서 골프처럼 사이트맵해서 정보 + 가입 유도").
-- 기획 docs/01-plan/features/hiking-category.md 의 0단계(자료 적재). 규칙은 shared/hikingMountains.ts · hikingGeo.ts · hikingGuide.ts.
--
-- 더하기만 한다(당구 · 골프의 표는 건드리지 않는다). 배포 **전에** 먼저 돌린다.
-- 채우는 것은 server/scripts/hiking-import.ts(받은 자료 → 이 표). 다시 돌려도 같은 줄을 고쳐 쓴다.
-- 되돌릴 때: drop table hiking_pois; drop table hiking_courses; drop table hiking_mountains;

create table if not exists hiking_mountains (
  -- 받은 자료의 번호(위키데이터 'Q…' · 지도 'osm…' · 목록 'komount…')
  id            text primary key,
  -- 공개 주소(/hiking/mountains/<slug>) — 이름, 같은 이름이 있으면 '이름-시군'
  slug          text not null,
  name          text not null,
  peak_name     text,
  aliases       jsonb not null default '[]'::jsonb,
  lat           double precision,
  lng           double precision,
  height_m      integer,
  sido          text,
  sigungu       text,
  dong          text,
  -- 권역(shared/hikingMountains 의 HikingRegionId)
  region        text,
  -- 1 = 명산 목록의 산 · 2 = 백과 문서가 있는 산 · 3 = 그 밖
  tier          integer not null default 3,
  -- 속한 목록 [{ "list": "kfs100", "no": 32 }]
  lists         jsonb not null default '[]'::jsonb,
  -- 특성(shared/hikingMountains 의 HikingTrait)
  traits        jsonb not null default '[]'::jsonb,
  -- 걸러 둔 소개 글(shared/hikingGuide 의 MountainGuide). 없으면 null
  guide         jsonb,
  course_count  integer not null default 0,
  -- 코스들 가운데 가장 짧은 것 · 긴 것의 거리(km) — 목록에 쓴다
  course_min_km numeric(6,2),
  course_max_km numeric(6,2),
  -- 길 위의 지점 수 { "SIGN": 14, "DANGER": 2, … }
  poi_counts    jsonb not null default '{}'::jsonb,
  created_at    timestamp not null default now(),
  updated_at    timestamp not null default now(),
  constraint hiking_mountains_slug_unique unique (slug)
);
create index if not exists hiking_mountains_region_idx on hiking_mountains (region);
create index if not exists hiking_mountains_tier_idx on hiking_mountains (tier);

create table if not exists hiking_courses (
  -- '<봉우리 번호>-<파일 순번>' (한국등산트레킹지원센터의 봉우리 번호 frtrlId)
  id           text primary key,
  mountain_id  text not null references hiking_mountains(id) on delete cascade,
  frtrl_id     text not null,
  seq          integer not null,
  -- 원 기록에서 잰 값(점을 줄이기 전)
  km           numeric(6,2) not null,
  gain_m       integer not null,
  loss_m       integer not null,
  min_m        integer not null,
  max_m        integer not null,
  loop         boolean not null default false,
  -- 정상(산의 좌표)이 선의 어디쯤인가 — 선에서 150m 안일 때만. 아니면 null
  summit_km    numeric(6,3),
  -- 줄인 선 [[위도, 경도, 높이, 누적 km], …]
  line         jsonb not null,
  created_at   timestamp not null default now(),
  updated_at   timestamp not null default now()
);
create index if not exists hiking_courses_mountain_idx on hiking_courses (mountain_id);

create table if not exists hiking_pois (
  -- '<봉우리 번호>:<지점 번호>'
  id           text primary key,
  mountain_id  text not null references hiking_mountains(id) on delete cascade,
  frtrl_id     text not null,
  -- SIGN(갈림길) · DANGER(위험) · WILD(동식물) · CULTURAL(문화자원) · SHELTER(대피소) · GRID(국가지점번호)
  type         text not null,
  name         text not null,
  note         text,
  lat          double precision not null,
  lng          double precision not null,
  alt_m        integer,
  -- 가장 가까운 코스와 그 선 위의 거리(km) — 60m 안일 때만
  course_id    text,
  km           numeric(6,3),
  created_at   timestamp not null default now()
);
create index if not exists hiking_pois_mountain_idx on hiking_pois (mountain_id);
create index if not exists hiking_pois_course_idx on hiking_pois (course_id);
