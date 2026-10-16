/**
 * 관리자 작업 기록(2026-10-16 어드민 전수 조사 — "지우기 · 무효 · 수정이 서버 로그에만 남는다"). 표 hiq_admin_actions.
 * 관리자 가드(server/middleware/adminAuth checkSuperAdmin)를 지난 **바꾸는 요청**(GET · HEAD 가 아닌 것)이 답할 때 한 줄을 남긴다 —
 * 새 어드민 기능을 만들어도 따로 할 일이 없다. 여기는 순수 규칙: 무엇을 지우고(scrub) 화면에 어떤 이름으로 보일지(label).
 */

/** 남기지 않는 칸 — PIN · 비밀번호 · 열쇠 · 전화번호 · 계좌 */
const SECRET = /^pin|pin$|password|passcode|secret|token|phone|^tel$|account|bank|cookie/i;
const MAX_STR = 160, MAX_ARR = 20, MAX_DEPTH = 3, MAX_KEYS = 30;

export function scrubAdminDetail(v: unknown, depth = 0): unknown {
    if (v == null || typeof v === "number" || typeof v === "boolean") return v ?? null;
    if (typeof v === "string") return v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…(${v.length}자)` : v;
    if (depth >= MAX_DEPTH) return "…";
    if (Array.isArray(v)) {
        const head = v.slice(0, MAX_ARR).map((x) => scrubAdminDetail(x, depth + 1));
        return v.length > MAX_ARR ? [...head, `…외 ${v.length - MAX_ARR}개`] : head;
    }
    if (typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, MAX_KEYS)) out[k] = SECRET.test(k) ? "•••" : scrubAdminDetail(x, depth + 1);
        return out;
    }
    return String(v);
}

/** 주소 → 사람이 읽는 이름(모르는 주소는 null — 화면이 방법 · 주소를 그대로 보인다) */
const LABELS: readonly (readonly [string, RegExp, string])[] = [
    ["POST", /^\/admin\/sim\/recompute-ratings/, "온라인 레이팅 다시 계산"],
    ["PATCH", /^\/admin\/members\/[^/]+$/, "회원 정보 수정"],
    ["POST", /^\/admin\/members\/[^/]+\/status$/, "회원 상태 바꾸기(정지 · 해제)"],
    ["POST", /^\/admin\/members\/[^/]+\/reset-pin$/, "PIN 초기화"],
    ["POST", /^\/admin\/members\/[^/]+\/booking-manager$/, "부킹매니저 켜기 · 끄기"],
    ["POST", /^\/admin\/members\/[^/]+\/sub-admin$/, "관리자 임명 · 해제"],
    ["DELETE", /^\/admin\/games\/[^/]+$/, "실전 경기 지우기"],
    ["POST", /^\/admin\/leads\/[^/]+\/status$/, "입점 문의 상태"],
    ["POST", /^\/admin\/notices$/, "공지 쓰기"],
    ["PATCH", /^\/admin\/notices\/[^/]+$/, "공지 고치기"],
    ["DELETE", /^\/admin\/notices\/[^/]+$/, "공지 지우기"],
    ["POST", /^\/admin\/push$/, "푸시 보내기"],
    ["POST", /^\/admin\/reports\/action$/, "신고 처리"],
    ["POST", /^\/admin\/users\/[^/]+\/ban$/, "회원 차단"],
    ["POST", /^\/admin\/impersonate\/exit$/, "사장님 화면에서 나오기"],
    ["POST", /^\/admin\/impersonate\/[^/]+$/, "사장님 화면 대리 접속"],
    ["POST", /^\/admin\/suggestions\/[^/]+\/reply$/, "건의 답변"],
    ["PATCH", /^\/admin\/suggestions\//, "건의 읽음 표시"],
    ["PATCH", /^\/admin\/membership\/orders\/[^/]+\/status$/, "골프 회원권 상태"],
    ["POST", /^\/admin\/listing-claims\/[^/]+\/approve$/, "매장 클레임 승인"],
    ["POST", /^\/admin\/listing-claims\/[^/]+\/reject$/, "매장 클레임 거절"],
    ["POST", /^\/admin\/store-registrations\/[^/]+\/approve$/, "신규 매장 승인"],
    ["POST", /^\/admin\/store-registrations\/[^/]+\/reject$/, "신규 매장 거절"],
    ["POST", /^\/admin\/golf\/listings\/[^/]+\/hide$/, "조인 · 부킹 글 가리기"],
    ["DELETE", /^\/admin\/golf\/listings\/[^/]+$/, "조인 · 부킹 글 지우기"],
    ["POST", /^\/admin\/golf\/rounds\/cleanup-stale$/, "멈춘 대기방 정리"],
    ["POST", /^\/admin\/golf\/rounds\/[^/]+\/abandon$/, "라운드 방 접기"],
    ["POST", /^\/admin\/golf\/rounds\/[^/]+\/finish$/, "라운드 기록으로 끝내기"],
    ["POST", /^\/admin\/golf\/rounds\/[^/]+\/void$/, "라운드 무효"],
    ["POST", /^\/admin\/golf\/photos\/[^/]+\/hide$/, "라운드 사진 가리기"],
    ["POST", /^\/admin\/golf\/photos\/[^/]+\/appeal$/, "사진 이의제기 판정"],
    ["DELETE", /^\/admin\/golf\/photos\/[^/]+$/, "라운드 사진 지우기"],
    ["POST", /^\/admin\/golf\/overview\/price-sync/, "시세 동기화 미리보기"],
    ["PUT", /^\/admin\/golf\/courses\/nines\/[^/]+\/pars$/, "골프장 파 고치기"],
    ["POST", /^\/admin\/golf\/courses\/nines$/, "골프장 코스 더하기"],
    ["PATCH", /^\/admin\/golf\/courses\/clubs\/[^/]+\/coords$/, "골프장 좌표(원장)"],
    ["PATCH", /^\/admin\/golf\/courses\/[^/]+\/coords$/, "골프장 페이지 좌표"],
    ["PUT", /^\/admin\/golf\/courses\/[^/]+\/name$/, "골프장 이름 고치기"],
    ["POST", /^\/admin\/golf\/courses\/logo\/fetch$/, "로고 받아 오기"],
    ["POST", /^\/admin\/golf\/courses\/[^/]+\/logo$/, "골프장 로고 바꾸기"],
    ["PATCH", /^\/admin\/golf\/courses\/[^/]+$/, "골프장 정보 고치기"],
    ["POST", /^\/admin\/goods\/grant$/, "굿즈 증정"],
    ["POST", /^\/admin\/goods\/revoke$/, "증정 회수"],
];
export function adminActionLabel(method: string, path: string): string | null {
    const p = path.split("?")[0].replace(/^\/api\/hiq/, "");
    const m = method.toUpperCase();
    return LABELS.find(([mm, re]) => mm === m && re.test(p))?.[2] ?? null;
}

/** GET /admin/actions 의 한 줄 */
export interface AdminActionRow {
    id: string;
    at: string;
    adminName: string;
    method: string;
    path: string;
    label: string | null;
    status: number;
    detail: unknown;
}
