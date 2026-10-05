-- '앱에서 열기' 로그인 넘겨주기(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고 그대로 이어 쓰게. 새 앱 빌드 없이").
-- 웹(로그인됨)이 한 번만 쓰는 토큰을 받아 앱 주소(rankue://open?path=/dashboard?handoff=…)에 실어 보내고, 앱의 웹뷰가 그 토큰을 쿠키와 바꾼다.
-- shared/schema.ts 의 hiqLoginHandoffs 와 같은 정의다. 규칙은 shared/loginHandoff.ts, 라우트는 server/routes/modules/handoff.ts.
--
-- 열:
--   token_hash  sha256(토큰) hex 64자. **토큰 원문은 어디에도 저장하지 않는다** — 이 표가 새도 로그인할 수 있는 값이 나오지 않는다.
--   member_id   토큰을 받은 회원. 회원 행이 지워지면 같이 지워진다.
--   expires_at  만든 때 + 120초(HANDOFF_TTL_SEC).
--   used_at     null 이면 아직 안 쓴 것. 쓰는 순간 now() 가 들어간다 — 한 번만 쓰인다:
--               UPDATE hiq_login_handoffs SET used_at = now()
--                WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING member_id;
-- 시각은 전부 timestamptz 이고 비교는 DB 의 now() 로만 한다(서버 인스턴스 시계와 무관).
--
-- 쌓이지 않게(코드가 한다 — server/storage/loginHandoff.repo.ts sweepLoginHandoffs): 토큰을 발급할 때마다
--   그 회원의 10분 넘은 행(발급 횟수를 세는 창 밖)과, 누구 것이든 만료된 지 하루 넘은 행을 지운다.
--   가장 많이 남아도 '최근 하루 동안 발급된 수'만큼이다.
--
-- **적용 순서**: 이 SQL 을 먼저 DB 에 적용하고 그 다음 코드를 배포한다.
--   표가 없으면 POST /api/hiq/handoff(발급)와 /redeem(바꾸기)만 500 이 난다 — 다른 화면·로그인에는 영향이 없다(새 표라 기존 쿼리가 읽지 않는다).
--   표만 먼저 있는 것은 옛 코드에 아무 영향이 없다. 덧붙이기만 하는 DDL 이라 두 번 돌려도 된다.
-- 적용 확인(코드를 배포하기 전에 운영 DB 에서 — 첫 줄은 한 줄, 둘째 줄은 네 줄이 나와야 한다):
--   SELECT conname FROM pg_constraint WHERE conname = 'hiq_login_handoffs_token_hash_unique' AND conrelid = 'hiq_login_handoffs'::regclass;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'hiq_login_handoffs' ORDER BY indexname;
--     (hiq_login_handoffs_expires_idx · hiq_login_handoffs_member_idx · hiq_login_handoffs_pkey · hiq_login_handoffs_token_hash_unique)
--
-- 운영 DB 적용: 2026-10-06 새벽(KST) 적용·확인 — 표·제약 셋(pkey · token_hash unique · member fk)·인덱스 넷이 있다.
--
-- 되돌리기: (코드를 먼저 되돌린 뒤)
--   DROP TABLE IF EXISTS hiq_login_handoffs;
--   지워도 잃는 것이 없다 — 행은 길어야 2분 쓰이는 토큰의 해시뿐이다(이미 로그인된 쿠키는 이 표와 무관하게 계속 유효하다).

CREATE TABLE IF NOT EXISTS hiq_login_handoffs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL,
    member_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    -- 제약 이름은 drizzle 이 기대하는 꼴로 맞춘다(.unique() → <표>_<열>_unique, references → <표>_<열>_<상대 표>_<상대 열>_fk) —
    -- 나중에 drizzle push 가 같은 제약을 다른 이름으로 또 만들려 들지 않게. 유니크는 인덱스가 아니라 '제약'이다(profile_kakao_sub.sql 과 같은 이유).
    CONSTRAINT hiq_login_handoffs_token_hash_unique UNIQUE (token_hash),
    -- 회원 행이 지워지면 같이 지운다(시험 스크립트가 회원을 통째로 지운다 — 이 표가 그걸 막으면 안 된다)
    CONSTRAINT hiq_login_handoffs_member_id_hiq_members_id_fk FOREIGN KEY (member_id) REFERENCES hiq_members(id) ON DELETE CASCADE
);

-- 회원별 최근 발급 수(10분에 5번)와 그 회원의 옛 행 청소
CREATE INDEX IF NOT EXISTS hiq_login_handoffs_member_idx ON hiq_login_handoffs (member_id, created_at);
-- 만료된 지 하루 넘은 행 청소
CREATE INDEX IF NOT EXISTS hiq_login_handoffs_expires_idx ON hiq_login_handoffs (expires_at);
