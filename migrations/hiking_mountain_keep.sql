-- 등산 산 자료 고치기(2026-10-17 어드민 › 등산 › 산 자료) — 더하기만: hiking_mountains 에 칸 하나.
-- 어드민에서 고친 칸 { coords | height | peak: { at, by, reason, was } } — 적재(server/scripts/hiking-import*.ts)가 다시 돌아도 그 칸은 덮지 않는다(골프 admin_keep 과 같은 뜻).
-- 되돌릴 때: alter table hiking_mountains drop column admin_keep;
alter table hiking_mountains add column if not exists admin_keep jsonb;
