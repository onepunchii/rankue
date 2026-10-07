-- 파트너(사장님) 신청에 랭큐 계정을 붙인다 (2026-10-07)
-- 오너: "지금 사장님이 없잖아 — 앞으로 사장님들이 신청·승인했을 때를 생각해서 진행하자"
--
-- 예전: 로그인 없이 이름·연락처만 받고, 승인하면 그 연락처와 같은 번호의 프로필을 찾아(없으면 만들어 4자리 PIN 발급) 권한을 줬다.
--       카카오·구글로 쓰는 사람은 번호 + PIN 계정이 따로 생겼다.
-- 이제: 신청에 계정(회원 id · 프로필 id)을 같이 적고, 승인하면 그 계정이 사장님이 된다(server/lib/partnerApply.ts · admin.ts issueOwnership).
--       거절 사유와 처리 시각도 남긴다 — 신청자가 자기 신청의 상태를 본다(GET /partner/applications).
--
-- 더하기만 한다(열 · 색인). 옛 행의 새 열은 NULL 이고, 그런 신청은 예전 방식으로 승인된다.
-- 외래 키는 걸지 않는다 — 계정이 지워져도 신청 기록은 남는다(승인 때 계정이 없으면 서버가 거절한다).
--
-- 운영 DB 적용: 2026-10-07 (코드 배포 전에 먼저)
-- 적용 확인:
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_name IN ('store_listing_claims','store_registrations')
--      AND column_name IN ('applicant_member_id','applicant_profile_id','reject_reason','processed_at');   -- 7줄

ALTER TABLE store_listing_claims ADD COLUMN IF NOT EXISTS applicant_member_id uuid;
ALTER TABLE store_listing_claims ADD COLUMN IF NOT EXISTS applicant_profile_id uuid;
ALTER TABLE store_listing_claims ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE store_listing_claims ADD COLUMN IF NOT EXISTS processed_at timestamp;

ALTER TABLE store_registrations ADD COLUMN IF NOT EXISTS applicant_member_id uuid;
ALTER TABLE store_registrations ADD COLUMN IF NOT EXISTS applicant_profile_id uuid;
ALTER TABLE store_registrations ADD COLUMN IF NOT EXISTS reject_reason text;

CREATE INDEX IF NOT EXISTS store_listing_claims_applicant_idx ON store_listing_claims (applicant_profile_id);
CREATE INDEX IF NOT EXISTS store_registrations_applicant_idx ON store_registrations (applicant_profile_id);
