-- 친구 초대 취소(2026-10-16 어드민 › 당구 › 친구 초대) — 더하기만: hiq_referrals 에 칸 셋.
-- 줄을 지우지 않고 표시만 한다 — 지우면 같은 사람이 초대 코드를 다시 넣을 수 있다(초대받은 사람 열쇠가 비므로).
-- 취소한 줄은 초대 수 · 단계 보상 · 한정 큐 고르기에서 빠진다. 되돌릴 때: alter table hiq_referrals drop column canceled_at, drop column cancel_reason, drop column canceled_by;
alter table hiq_referrals add column if not exists canceled_at timestamptz;
alter table hiq_referrals add column if not exists cancel_reason text;
alter table hiq_referrals add column if not exists canceled_by text;
