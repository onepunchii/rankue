-- 온라인 대전 무효(2026-10-16 어드민 › 당구 › 온라인 대전) — 더하기만: hiq_sim_matches 에 칸 하나.
-- 무효는 '오래 멈춘 판' 정리(cleanupStalePlaying — canceled · end_reason 'stale')와 같은 길로 닫는다: status 'canceled' · end_reason 'void'.
-- 이 칸은 그 기록 { at, reason, by, prevEndReason, restored? } — 되살릴 때 원래 끝난 까닭으로 돌린다.
-- 되돌릴 때: alter table hiq_sim_matches drop column admin_void;
alter table hiq_sim_matches add column if not exists admin_void jsonb;
