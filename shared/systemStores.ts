// 시스템 매장 — 사업체(가맹점)가 아니라 유저가 소속되는 그릇이다.
//
// hiq:    전화번호로 가입한 모든 유저의 기본 소속. 매장 지정이 없으면 여기로 떨어진다
//         (server/middleware/tenant.ts, client StoreContext).
// global: 구글·애플로 가입한 유저의 소속. 없으면 소셜 가입 자체가 실패한다
//         (hiqService.socialLogin → GLOBAL_STORE_NOT_SEEDED).
//
// ⚠️ 절대 삭제하지 말 것. 회원·경기가 전부 이 두 매장에 매달려 있다.
// 어드민 '가맹점' 목록에서는 제외한다 — 진짜 계약 매장이 몇 곳인지 가려지기 때문이다.
export const SYSTEM_STORE_SLUGS = ["hiq", "global"] as const;

/** 전화 가입자의 기본 소속 매장 */
export const DEFAULT_STORE_SLUG = "hiq";
/** 소셜 가입자의 소속 매장 */
export const GLOBAL_STORE_SLUG = "global";

export function isSystemStore(slug: string | null | undefined): boolean {
    return !!slug && (SYSTEM_STORE_SLUGS as readonly string[]).includes(slug);
}
