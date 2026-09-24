-- 2026-09-24 골프장 페이지 · 회원권 시세 · 관심 골프장
CREATE TABLE IF NOT EXISTS golf_course_pages (
  slug text PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL,
  city text,
  address text,
  lat double precision,
  lng double precision,
  course_ids integer[] NOT NULL DEFAULT '{}',
  club_id uuid,
  kind text,
  holes integer,
  parts jsonb,
  courses jsonb,
  intro text,
  info jsonb,
  fees jsonb,
  tgm_items text[] NOT NULL DEFAULT '{}',
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golf_course_pages_region_idx ON golf_course_pages (region, city);
CREATE INDEX IF NOT EXISTS golf_course_pages_course_ids_idx ON golf_course_pages USING gin (course_ids);

CREATE TABLE IF NOT EXISTS golf_membership_prices (
  item_id text PRIMARY KEY,
  slug text NOT NULL REFERENCES golf_course_pages(slug) ON DELETE CASCADE,
  label text NOT NULL,
  price integer NOT NULL,
  year_high integer,
  year_low integer,
  change integer,
  as_of date,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS golf_membership_prices_slug_idx ON golf_membership_prices (slug);

CREATE TABLE IF NOT EXISTS golf_membership_price_history (
  item_id text NOT NULL,
  d date NOT NULL,
  price integer NOT NULL,
  PRIMARY KEY (item_id, d)
);

CREATE TABLE IF NOT EXISTS golf_course_watches (
  member_id uuid NOT NULL REFERENCES hiq_members(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES golf_course_pages(slug) ON DELETE CASCADE,
  filters jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, slug)
);
CREATE INDEX IF NOT EXISTS golf_course_watches_slug_idx ON golf_course_watches (slug);
