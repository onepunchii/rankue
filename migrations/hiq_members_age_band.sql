-- 프로필 나이대 (2026-10-20)
-- 오너: "당구 골프 등산 낚시에 공통으로 해야 되니깐 성별이랑 나이대로 가고 각 프로필 배너 창 잘 만들어 줘"
-- 설정 화면의 출생연도 칸을 나이대(10s · 20s · 30s · 40s · 50s · 60s)로 바꾼다 — 정확한 나이는 어디에도 쓰지 않는다.
-- 더하기만 한다(빈 열 하나). 있던 birth_year 는 그대로 두고, 나이대가 비었을 때 그 해로 읽는다(shared/profileBasics ageBandOf).
-- 탈퇴하면 birth_year · gender 와 같이 지운다(server/storage/user.repo).
--
-- 운영 DB 적용: 2026-10-20 (코드 배포 전에 먼저 — hiq_members 를 통째로 읽는 곳이 새 열을 찾는다)
-- 적용 확인:
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hiq_members' AND column_name = 'age_band';   -- 1줄, text

ALTER TABLE hiq_members ADD COLUMN IF NOT EXISTS age_band text;
