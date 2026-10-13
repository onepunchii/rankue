-- 골프장 공식 사이트가 공개한 남은 티(2026-10-13) — 더하기만. 규칙과 받는 곳의 목록은 shared/golfOpenTee.ts
-- golf_open_tees     : 남은 티 한 줄(골프장 · 날짜 · 시간 · 코스). 다시 받았을 때 없어진 줄은 지운다(예약됐다).
-- golf_open_tee_days : 그 골프장 · 그 날짜를 언제 처음 · 마지막으로 봤는가. '새로 나온 티'(처음 본 뒤에 생긴 줄)와 '확인한 시각'의 바탕.
create table if not exists golf_open_tees (
    slug text not null,
    play_date text not null,
    tee_time text not null,
    course text not null default '',
    holes integer,
    list_price integer,
    price integer,
    first_seen timestamptz not null default now(),
    seen_at timestamptz not null default now(),
    primary key (slug, play_date, tee_time, course)
);
create index if not exists golf_open_tees_date_idx on golf_open_tees (play_date, tee_time);
create index if not exists golf_open_tees_first_seen_idx on golf_open_tees (first_seen desc);

create table if not exists golf_open_tee_days (
    slug text not null,
    play_date text not null,
    first_checked timestamptz not null default now(),
    checked_at timestamptz not null default now(),
    ok boolean not null default true,
    note text,
    tees integer not null default 0,
    primary key (slug, play_date)
);
