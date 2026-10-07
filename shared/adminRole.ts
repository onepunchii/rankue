/**
 * 관리자 역할의 두 단계(2026-10-07 오너: "내가 다른 회원 어드민 부관리자 설정해줄 거야 … 해당 부관리자는 볼 수만 있어 수정 이런 거는 아직 권한을
 * 안 줄 거야 … 슈퍼관리자(나) 수정 모든 권한 > 관리자(보기만 가능)").
 *
 *   super_admin  슈퍼관리자 — 관리자 콘솔의 모든 것(보기 · 고치기), 콘솔 밖 운영자 기능(문의 답변·번역·남의 글 정리·크루 전권·온라인게임 길찾기)
 *   admin        관리자(부관리자) — **관리자 콘솔을 보기만** 한다. 고치는 요청은 서버가 전부 거절하고, 콘솔 밖에서는 일반 회원과 같다
 *
 * 역할은 profiles.role 한 칸이다. 전화번호·이메일로 사람을 가리지 않는다(코드에 적지 않는다).
 * 임명·해제는 슈퍼관리자가 어드민 회원 관리에서 한다(POST /admin/members/:id/sub-admin): user ↔ admin 사이만 바꾼다.
 *
 * 왜 shared 인가: 같은 판정을 서버(가드 · 임명)와 화면(메뉴의 콘솔 입구 · 보기 전용 표시 · 임명 단추)이 같이 쓴다.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙). 지금은 임포트가 없다.
 */

/** 관리자 콘솔에 들어올 수 있는 역할 — 슈퍼관리자와 관리자(보기 전용) */
export function isConsoleRole(role: unknown): boolean {
    return role === "super_admin" || role === "admin";
}

/** 고칠 수 있는가(관리자 콘솔의 쓰기 · 콘솔 밖 운영자 기능) — 슈퍼관리자만 */
export function isSuperAdminRole(role: unknown): boolean {
    return role === "super_admin";
}

/** 보기 전용 관리자인가 */
export function isViewOnlyAdminRole(role: unknown): boolean {
    return role === "admin";
}

/**
 * 고치지 않는 POST — 조회인데 본문이 필요해 POST 로 만든 것들. 보기 전용 관리자도 부를 수 있다.
 * 여기에 넣는 것은 **아무것도 저장·발송하지 않는** 요청뿐이다(넣기 전에 그 라우트를 읽어 볼 것).
 */
export const VIEW_ONLY_ALLOWED_POSTS: readonly string[] = [
    "/api/hiq/admin/search-trend", // 검색 수요 — 네이버 검색량을 물어 화면에 보여 주기만 한다
];

/** 보기 전용 관리자가 부를 수 있는 요청인가 — GET·HEAD, 그리고 위 목록의 POST */
export function viewOnlyAllows(method: string, path: string): boolean {
    const m = String(method).toUpperCase();
    if (m === "GET" || m === "HEAD") return true;
    if (m !== "POST") return false;
    const p = String(path).split("?")[0].replace(/\/+$/, "");
    return VIEW_ONLY_ALLOWED_POSTS.includes(p);
}

/** 서버가 보기 전용 관리자의 쓰기를 거절할 때의 코드 — 화면이 이 코드로 '보기 전용' 안내를 띄운다 */
export const ADMIN_VIEW_ONLY_CODE = "ADMIN_VIEW_ONLY";
export const ADMIN_VIEW_ONLY_MESSAGE = "보기 전용 관리자 계정이라 바꿀 수 없습니다";

/** 임명·해제가 바꾸는 값 — 지금 역할이 from 일 때만 to 로(사장님·부킹매니저·슈퍼관리자는 건드리지 않는다) */
export function subAdminSwitch(on: boolean): { from: "user" | "admin"; to: "user" | "admin" } {
    return on ? { from: "user", to: "admin" } : { from: "admin", to: "user" };
}

/** 회원 관리 화면의 역할 이름표 */
export function adminRoleLabel(role: unknown): string | null {
    if (role === "super_admin") return "슈퍼관리자";
    if (role === "admin") return "관리자 · 보기 전용";
    return null;
}
