-- 내 표시 지점(2026-10-15) — 약수터 · 조망점 · 위험 · 갈림길 · 기타. 나만 본다. 사진은 작은 한 장(hiking-thumb 폴더, 이 회원 것만).
create table if not exists hiking_marks (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references hiq_members(id) on delete cascade,
  mountain_id text not null,
  kind        text not null check (kind in ('water', 'view', 'danger', 'junction', 'other')),
  lat         double precision not null,
  lng         double precision not null,
  note        text,
  photo_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists hiking_marks_member_mountain on hiking_marks (member_id, mountain_id);
