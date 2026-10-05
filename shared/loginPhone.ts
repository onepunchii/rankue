/**
 * 전화번호 로그인 입구에서 받아도 되는 글자인가(2026-10-05 카카오 로그인 검토에서 확인된 구멍).
 *
 * 회원 행의 phone 칸에는 전화번호만 있는 것이 아니다. 소셜로 가입한 회원은 `social:<제공자>:…`,
 * 탈퇴한 회원은 `del-…` 자리표시자가 들어 있다(이 칸은 notNull + (store_id, phone) 유니크라 비울 수 없다).
 * 전화번호 로그인(POST /login)은 이 칸을 글자 그대로 비교하고, 소셜로 가입한 프로필에는 PIN 이 없다 —
 * 그래서 자리표시자를 '전화번호'로 보내면 PIN 없이 그 계정으로 들어갔다. 가입(POST /register)에 보내면
 * 남이 쓸 자리표시자를 선점할 수도 있었다. 그런 글자는 DB 를 보기 전에 입구에서 끊는다.
 *
 * 화면 번들에도 실릴 수 있는 파일이다 — 비밀 값이 없다.
 * 주의: "숫자 10~11자리만" 같은 꼴 검사는 여기 넣지 않았다. 로그인은 저장된 글자와 그대로 비교하는데,
 * 옛 회원 행에 하이픈·해외 번호가 섞여 있는지 확인하지 못했다(운영 DB 조회 금지) — 섞여 있으면 그 회원의 로그인이 막힌다.
 */

/** 소셜 가입 회원 행의 phone 자리표시자 접두(hiqService.socialLogin). */
export const SOCIAL_PHONE_PREFIX = "social:";
/** 탈퇴 회원 행의 phone 자리표시자 접두(user.repo deleteAccount). */
export const DELETED_PHONE_PREFIX = "del-";

/** 전화번호 자리에 올 수 없는 자리표시자인가. 앞뒤 공백·대소문자를 바꿔 보내도 걸린다. */
export function isPlaceholderPhone(raw: unknown): boolean {
    if (typeof raw !== "string") return false;
    const s = raw.trim().toLowerCase();
    return s.startsWith(SOCIAL_PHONE_PREFIX) || s.startsWith(DELETED_PHONE_PREFIX);
}

/** 전화번호 로그인·가입·PIN 재설정이 받아도 되는 값인가 — 빈 값·글자가 아닌 값·자리표시자는 안 된다. */
export function isLoginPhone(raw: unknown): raw is string {
    return typeof raw === "string" && raw.trim().length > 0 && !isPlaceholderPhone(raw);
}

/**
 * 카카오로 가입한 회원 행의 phone 자리표시자 — 뒤에 붙는 것은 **카카오 회원번호가 아니라 난수**다.
 * 회원번호는 짧은 숫자라 훑을 수 있고, 로그인 응답·/me 에 회원 행이 통째로 실려 본인 번호 주변 대역도 드러난다.
 * 카카오 로그인은 프로필의 kakao_sub 로 회원을 찾으므로 이 칸에 회원번호가 들어갈 이유가 없다.
 */
export function kakaoPhonePlaceholder(randomId: string): string {
    return `${SOCIAL_PHONE_PREFIX}kakao:${randomId}`;
}

/** 카카오로 **가입한** 회원 행인가(전화번호 회원이 카카오를 연결한 것과 구분한다). */
export function isKakaoSignupPhone(phone: unknown): boolean {
    return typeof phone === "string" && phone.startsWith(`${SOCIAL_PHONE_PREFIX}kakao:`);
}
