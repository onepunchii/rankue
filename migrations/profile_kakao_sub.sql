-- 카카오 로그인(2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플").
-- profiles.kakao_sub = 카카오 회원번호. google_sub·apple_sub 와 같은 꼴(text + 유니크, 비어 있는 행은 몇 줄이든 된다). 덧붙이기만 한다.
-- 카카오 토큰은 어디에도 저장하지 않는다 — 이 번호 하나만 남긴다.
--
-- **적용 순서를 지켜라**: 이 SQL 을 먼저 DB 에 적용하고 그 다음 코드를 배포한다.
-- shared/schema.ts 의 profiles 에 kakaoSub 가 들어가면 프로필을 통째로 읽는 쿼리(로그인·/me·프로필 수정 …)가 전부 kakao_sub 를
-- SELECT 한다 — 열이 DB 에 없으면 그 길이 모두 500 난다. 열만 먼저 있는 것은 옛 코드에 아무 영향이 없다.
--
-- 제약 이름은 drizzle 이 .unique() 에 기대하는 profiles_kakao_sub_unique.
-- (google_sub·apple_sub 는 이 폴더에 SQL 이 없다 — drizzle push 로 만들어져 profiles_google_sub_unique 꼴일 것이다.)
-- ADD CONSTRAINT 에는 IF NOT EXISTS 가 없어서 DO 블록으로 감쌌다 — 두 번 돌려도 된다.
-- 유니크 '인덱스'가 아니라 '제약'으로 만든다: 같은 이름의 인덱스만 있으면 나중에 drizzle push 가 제약을 또 만들려다 이름이 겹쳐 실패한다.
--
-- 적용 확인(2026-10-05 검토) — 코드를 배포하기 **전에** 운영 DB 에서 아래 둘이 각각 한 줄씩 나와야 한다.
-- 열만 보면 안 된다: 열만 있고 제약이 없으면 500 은 안 나지만 같은 카카오가 두 프로필에 붙을 수 있다
-- (hiqService.linkKakao 의 23505 처리와 "카카오 계정 하나에 프로필 하나"가 이 제약에 기댄다).
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'kakao_sub';
--   SELECT conname FROM pg_constraint WHERE conname = 'profiles_kakao_sub_unique' AND conrelid = 'profiles'::regclass;
-- 운영 DB 적용: 2026-10-05 밤(KST) 적용·확인 — 열 kakao_sub(text, null 허용)와 제약 profiles_kakao_sub_unique 가 있고, 프로필 149행 중 값은 0.
--
-- 되돌리기: (코드를 먼저 되돌린 뒤)
--   ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_kakao_sub_unique;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS kakao_sub;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kakao_sub text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_kakao_sub_unique' AND conrelid = 'profiles'::regclass
    ) THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_kakao_sub_unique UNIQUE (kakao_sub);
    END IF;
END $$;
