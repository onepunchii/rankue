-- 랭큐 굿즈샵 출시 알림(2026-10-24) — 한 사람에 한 줄, 고른 품목 목록(shared/goodsShop). 비우면 신청을 거둔 것.
-- 탈퇴하면 storage/withdrawPurge 가 지운다(회원 행이 남아 cascade 가 돌지 않는다). 더하기만 한다.
create table if not exists goods_shop_interest (
  member_id uuid primary key references hiq_members(id) on delete cascade,
  items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
