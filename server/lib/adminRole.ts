/**
 * 관리자 계정은 번호 + PIN 으로 들이지 않는다(2026-10-07 오너: "관리자 계정 핀번호 막자").
 *
 * 4자리 PIN 은 관리 권한을 지키기에 약하다(시도 횟수 제한은 번호 + IP 단위라, IP 를 바꿔 가며 훑으면 뚫릴 수 있다).
 * 그래서 관리자 역할(profiles.role = admin · super_admin) 계정은 **카카오·구글·애플로만** 들어온다.
 * PIN 으로 그 계정의 세션에 닿는 길을 전부 같은 규칙으로 닫는다 — 하나라도 남으면 PIN 이 다시 뿌리가 된다:
 *   - 전화번호 로그인(hiqService.login)            소셜 로그인이 연결된 관리자 계정이면 PIN 을 보기 전에 거절
 *   - 다른 매장 가입으로 프로필에 붙기(register)     관리자 프로필에는 번호 + PIN 으로 새 회원 행을 붙이지 않는다
 *   - 전화번호 계정 잇기(attachSocialToPhone)       남의 소셜을 관리자 계정에 PIN 으로 붙이지 못한다
 *   - 파트너 번호 폼(partnerLogin)                  관리자 계정을 들이지 않는다
 *   - 바로 들어가기(POST /partner/sso)              관리자는 소셜 로그인이 연결돼 있어야 관리 쿠키를 받는다
 * PIN 은 관리자에게도 남는다 — **이미 로그인한 세션 안에서**의 본인 확인(설정의 연결·해제)에만 쓰인다.
 *
 * 소셜 로그인이 하나도 연결되지 않은 관리자 계정은 전화번호 로그인을 막지 않는다(막으면 들어올 길이 없다).
 * 그런 계정은 관리 화면이 열리지 않는다(SSO) — 설정에서 카카오·구글을 연결하면 그때부터 번호 길이 닫히고 관리 화면이 열린다.
 * 이미 만들어진 세션(30일 쿠키)은 이 규칙으로 끊기지 않는다.
 */
export function isAdminRole(role: unknown): boolean {
    return role === "admin" || role === "super_admin";
}

/** 소셜 로그인(카카오·구글·애플)이 하나라도 연결된 프로필인가. */
export function hasSocialLogin(profile: { googleSub?: string | null; appleSub?: string | null; kakaoSub?: string | null } | null | undefined): boolean {
    return !!profile && (!!profile.googleSub || !!profile.appleSub || !!profile.kakaoSub);
}
