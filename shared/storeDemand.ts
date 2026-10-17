/**
 * 손님이 찾는 매장(2026-10-18 오너: "당구장 사장님을 모집하기 위한 제안 — 지금 당구장 클릭수는 있는데") — 어드민 목록 · 사장님 리포트 카드가 같은 셈을 쓴다.
 *
 * 근거는 방문자 발자국(ui_events — 10/8부터, 60일 보관). 매장 페이지(/stores/<코드>)를 연 사람과, 거기서 가게로 가려고 누른 것:
 *   길찾기 · 전화(번호를 누르면 발자국에는 '(번호)'로 남는다) · 주소. 누른 것의 이름은 화면 말(다섯 언어)로 남아서 다섯 개를 다 센다.
 * 숫자는 받은 그대로만 — 어림하거나 부풀리지 않는다. 기간은 실제로 발자국이 있는 날부터(30일을 골라도 10/8 전은 없다).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */

/** 매장 페이지의 '길찾기' 단추 — client/src/pages/store-listing.tsx 의 directionsCta 다섯 언어 */
export const DIRECTIONS_LABELS = ["길찾기", "Directions", "Chỉ đường", "Yol tarifi", "Cómo llegar"] as const;
/** '전화' 단추(callCta 다섯 언어) + 번호를 직접 누른 것(발자국이 숫자를 '(번호)'로 가린다) */
export const CALL_LABELS = ["전화", "Call", "Gọi", "Ara", "Llamar", "(번호)"] as const;
/** '사장님이신가요? 내 매장 정보 관리 신청'(claimCta) — 앞부분만 본다 */
export const CLAIM_LABEL_PREFIX = "사장님이신가요";
/** 매장 페이지 한 장의 주소 모양 — 하위 주소(/stores/<코드>/…)는 세지 않는다 */
export const STORE_PAGE_RE = "^/stores/[^/]+$";

export interface StoreDemandRow {
    code: string;
    name: string;
    region: string | null;
    address: string | null;
    phone: string | null;
    claimed: boolean;
    /** 페이지를 연 횟수 · 사람 수(방문자 = 브라우저 하나) */
    views: number;
    visitors: number;
    /** 네이버 검색에서 들어온 사람 수 */
    naver: number;
    directions: number;
    calls: number;
    addressTaps: number;
    claimTaps: number;
    lastAt: string | null;
}
export interface StoreDemandList { days: number; from: string | null; to: string | null; rows: StoreDemandRow[]; totals: { visitors: number; views: number; stores: number; naver: number; intents: number } }
export interface StoreReport extends StoreDemandRow { days: number; from: string | null; to: string | null; daily: { day: string; visitors: number }[] }

/** 가게로 가려는 행동(길찾기 · 전화 · 주소) */
export const intentsOf = (r: Pick<StoreDemandRow, "directions" | "calls" | "addressTaps">) => r.directions + r.calls + r.addressTaps;
/** 네이버 비율(%) — 사람이 없으면 null */
export const naverShare = (r: Pick<StoreDemandRow, "naver" | "visitors">): number | null => (r.visitors > 0 ? Math.round((r.naver / r.visitors) * 100) : null);
/** "10월 8일 ~ 10월 17일" — 같은 날이면 하루만 */
export function demandRangeText(from: string | null, to: string | null): string {
    const md = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}월 ${Number(m[2])}일` : d; };
    if (!from || !to) return "";
    return from.slice(0, 10) === to.slice(0, 10) ? md(from) : `${md(from)} ~ ${md(to)}`;
}
/** 기간 칸 — 7 · 30 만 */
export const demandDaysOf = (v: unknown): 7 | 30 => (String(v) === "7" ? 7 : 30);
/** 리포트 카드 주소(어드민 쿠키로만 열린다 — 공개 카드가 아니다) */
export const storeReportPngPath = (code: string, days: number) => `/api/hiq/admin/store-demand/${encodeURIComponent(code)}/report.png?days=${days}`;

/** 리포트 카드의 큰 숫자 셋 — 0 인 칸도 그대로 적는다(빈 자리를 만들지 않는다) */
export function reportStats(r: StoreReport): { label: string; value: string; unit: string }[] {
    const share = naverShare(r);
    return [
        { label: "매장 페이지를 본 사람", value: r.visitors.toLocaleString("ko-KR"), unit: "명" },
        { label: "길찾기 · 전화 · 주소 누름", value: intentsOf(r).toLocaleString("ko-KR"), unit: "번" },
        { label: "네이버 검색으로 온 사람", value: share == null ? "-" : String(share), unit: share == null ? "" : "%" },
    ];
}
