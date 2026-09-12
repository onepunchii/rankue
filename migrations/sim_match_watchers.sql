-- 관전자 표시(2026-09-12). {"<회원 id>": epoch ms} — 최근 몇 초 안에 폴링한 사람만 센다.
-- 되돌릴 때: alter table hiq_sim_matches drop column watchers;
alter table hiq_sim_matches add column if not exists watchers jsonb;
