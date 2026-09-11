// 이용약관(EULA) 버전과 동의 판정 — 서버(UGC 작성 문지기)와 화면(동의 시트·가입)이 같은 규칙을 쓴다.
//
// 왜 필요한가: App Store 1.2 / Play UGC 정책은 글·댓글·사진·채팅을 올리기 전에 "불쾌한 콘텐츠와 악성 사용자에
// 대한 무관용" 약관에 동의하게 하라고 요구한다(감사 S4). 동의 기록은 hiq_members.terms_version·terms_accepted_at.
//
// 왜 버전이 날짜 문자열인가: 사람이 읽을 수 있고, 같은 형식이면 문자열 비교가 곧 시간 순서라서
// "이 버전 이상이면 유효"를 한 줄로 쓸 수 있다.
//
// 왜 최소 버전을 따로 두는가: 오탈자만 고친 개정까지 모든 회원에게 동의 시트를 다시 띄울 이유는 없다.
//  - 문구만 고쳤다        → TERMS_VERSION 만 올린다(기존 동의 유지, 새 동의는 새 버전으로 기록).
//  - 권리·의무가 바뀌었다 → TERMS_MIN_VERSION 도 같은 값으로 올린다(기존 동의가 무효가 되어 다음 글쓰기 때 다시 묻는다).
// 날짜를 바꾸면 shared/termsContent.ts 의 시행일 문구도 함께 바꾼다.
export const TERMS_VERSION = "2026-09-11";
export const TERMS_MIN_VERSION = "2026-09-11";

/** 동의하지 않은 회원의 UGC 작성을 서버가 거절할 때 붙이는 오류 코드 — 화면은 이 코드를 보면 동의 시트를 띄운다. */
export const TERMS_REQUIRED_CODE = "TERMS_REQUIRED";

/**
 * 운영자가 정지한 계정(profiles.status='banned')의 로그인·UGC 작성을 서버가 거절할 때 붙이는 오류 코드.
 * 약관 4조(무관용 — 이용 정지)가 실제로 지켜지게 하는 쪽이다(server/middleware/terms.ts, server/routes/modules/auth.ts).
 */
export const ACCOUNT_SUSPENDED_CODE = "ACCOUNT_SUSPENDED";

const VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 저장된(또는 화면이 보낸) 약관 버전이 지금 유효한 동의인가.
 * 미래 버전을 거절하는 이유: 화면이 보낸 값을 그대로 저장하는 경로(가입·동의 API)가 있어서,
 * "9999-12-31" 같은 값으로 앞으로의 개정까지 미리 동의한 것처럼 만들 수 없게 한다.
 */
export function isTermsAccepted(version: unknown): boolean {
    return typeof version === "string"
        && VERSION_RE.test(version)
        && version >= TERMS_MIN_VERSION
        && version <= TERMS_VERSION;
}
