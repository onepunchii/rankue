-- 당구대 로고 · 광고(2026-10-24 오너: "이 로고를 투명도 있게 온라인게임 당구대에 · 어드민에서 교체해서 광고") — 규칙은 shared/tableBrand.
-- 줄 하나 = 캠페인 하나. 지금 걸리는 것은 테이블마다: 켜져 있고 기간 안인 줄 가운데 기간 있는 줄(협찬) 먼저 → 시작이 늦은 것 → 나중에 만든 것.
-- 더하기만 한다: 표 하나 + '랭큐 기본' 한 줄(없을 때만).
create table if not exists sim_table_brands (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image text not null,
  opacity real not null default 0.16,
  scale real not null default 0.6,
  place text not null default 'center',
  tone text not null default 'original',
  tables text[] not null default '{DAEDAE,JUNGDAE_KR}',
  sponsor text,
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into sim_table_brands (title, image)
select '랭큐 기본', '/billiards/table/rankue-logo.webp'
where not exists (select 1 from sim_table_brands);
