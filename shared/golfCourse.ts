/**
 * 골프장 페이지의 순수 규칙(2026-09-24) — 화면·서버 프리렌더·사이트맵이 **같은 함수**를 쓴다.
 * 한쪽만 제목 공식이나 주소 규칙을 바꾸면 검색엔진이 보는 것과 사람이 보는 것이 갈린다.
 *
 * 주소 체계
 *   /golf/course/:slug                  골프장 한 곳(정본)
 *   /golf/courses[/:region[/:city]]     골프장 목록 · 지역 · 시군 — 항상 색인
 *   /golf/:intent[/:region[/:city]]     부킹 · 조인 · 긴급(취소티) — 글이 있을 때만 색인
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙, 2026-08-16·09-14 사고).
 */
import { isUrgentJoin, type UrgentJoinLike } from "./golfJoin.js";

export const ORIGIN = "https://www.rankue.co.kr";

/** 지역 허브 순서(정적 목록의 넓은 체계). */
export const GOLF_REGIONS = ["경기", "강원", "충청", "경상", "전라", "제주"] as const;
export type GolfRegion = (typeof GOLF_REGIONS)[number];
export const REGION_LABEL: Readonly<Record<string, string>> = {
    경기: "경기·수도권", 강원: "강원", 충청: "충청", 경상: "경상", 전라: "전라", 제주: "제주",
};

export type GolfIntent = "booking" | "join" | "urgent";
export const GOLF_INTENTS: readonly GolfIntent[] = ["booking", "join", "urgent"];
/** 화면 말. 긴급 = 당일 떨이 조인(긴급 조인). '취소티'는 검색어라 허브 제목(listTitle)에만 쓴다 — 알림·필터에서 두 뜻으로 쓰지 않는다. */
export const INTENT_LABEL: Readonly<Record<GolfIntent, string>> = { booking: "부킹", join: "조인", urgent: "긴급 조인" };

/** 시군 이름의 짧은 꼴 — "이천시" → "이천". 한 글자가 되면 그대로(검색어는 "이천 골프장"). */
export function cityShort(city: string | null | undefined): string {
    if (!city) return "";
    const s = city.replace(/(시|군)$/, "");
    return s.length >= 2 ? s : city;
}

/** 주소 한 조각을 URL 에 쓸 꼴로 — 한글은 그대로 두고 링크 만들 때 encodeURIComponent 한다. */
export function coursePath(slug: string): string { return `/golf/course/${encodeURIComponent(slug)}`; }
export function listPath(opts: { intent?: GolfIntent | null; region?: string | null; city?: string | null } = {}): string {
    const base = opts.intent ? `/golf/${opts.intent}` : "/golf/courses";
    if (!opts.region) return base;
    const r = `${base}/${encodeURIComponent(opts.region)}`;
    return opts.city ? `${r}/${encodeURIComponent(cityShort(opts.city))}` : r;
}

// ── 돈 ────────────────────────────────────────────────────────────
/** 만원 → "3억 2,000만원" · "8,500만원". 회원권 시세 표기. */
export function manwonText(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n) || n <= 0) return "";
    const eok = Math.floor(n / 10000), rest = Math.round(n % 10000);
    if (!eok) return `${rest.toLocaleString("ko-KR")}만원`;
    return rest ? `${eok}억 ${rest.toLocaleString("ko-KR")}만원` : `${eok}억원`;
}
/** 원 → "23만원" · "23.5만원". 그린피 표기. */
export function wonShort(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n) || n <= 0) return "";
    const man = n / 10000;
    return `${Number.isInteger(man) ? man.toLocaleString("ko-KR") : man.toFixed(1)}만원`;
}

// ── 그린피 ─────────────────────────────────────────────────────────
export interface FeeRow { day: string; nonMember: number | null; member: number | null; family: number | null }
export interface Fees { rows: FeeRow[]; extra: { caddie: number | null; cart: number | null } | null }
/** 주중 비회원 그린피(없으면 가장 싼 비회원 값). 제목·설명에 한 숫자만 쓸 때. */
export function weekdayFee(fees: Fees | null | undefined): number | null {
    const rows = fees?.rows ?? [];
    const wd = rows.find((r) => /주중|평일/.test(r.day) && r.nonMember);
    if (wd?.nonMember) return wd.nonMember;
    const all = rows.map((r) => r.nonMember).filter((v): v is number => !!v);
    return all.length ? Math.min(...all) : null;
}

// ── 제목·설명(검색 결과에 뜨는 글) ─────────────────────────────────
export interface CourseSeoFacts {
    name: string; region: string; city?: string | null; kind?: string | null; holes?: number | null;
    fees?: Fees | null; topPrice?: number | null; listingCount?: number;
    /** 대표 그린피(원) — 그린피 표가 없을 때 */
    feeFrom?: number | null;
    grass?: string[]; play?: string[];
    /** 옛 이름 — "로제비앙GC(구 큐로CC)" 처럼 제목에 붙여 옛 이름 검색도 받는다 */
    aliases?: string[];
}
const PLAY_WORD: Record<string, string> = { "3인가능": "3인 플레이", "2인가능": "2인 플레이", 노캐디: "노캐디" };

/**
 * 별칭 가운데 **정말 다른 이름**만 — 개명(큐로CC → 로제비앙GC)·다른 표기(에이치원클럽 · H1 CLUB).
 * "베네스트G.C" 나 "뉴코리아 컨트리클럽" 처럼 꼬리·띄어쓰기만 다른 옛 표기는 뺀다 — 제목·이름 밑에 붙으면 군더더기다(2026-09-24).
 */
const nameCore = (s: string) => s.toLowerCase()
    .replace(/\(\s*구\s*[,:：]?[^)]*\)/g, "")
    .replace(/컨트리클럽|컨트리|골프앤리조트|골프리조트|골프클럽|골프장|골프앤|리조트|클럽|club|golf|resort|country|c\.c|g\.c|cc|gc/g, "")
    .replace(/[\s()·.,&㈜\-_]/g, "");
function bigramSim(a: string, b: string): number {
    const bg = (s: string) => { const r: string[] = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
    const A = bg(a), B = bg(b); if (!A.length || !B.length) return a === b ? 1 : 0;
    let h = 0; const p = [...B]; for (const x of A) { const k = p.indexOf(x); if (k >= 0) { h++; p.splice(k, 1); } }
    return (2 * h) / (A.length + B.length);
}
export function distinctAliases(name: string, aliases: readonly string[] | null | undefined): string[] {
    const n = nameCore(name); const out: string[] = []; const seen = [n];
    for (const a of aliases ?? []) {
        const c = nameCore(a);
        if (!c || seen.some((x) => x.includes(c) || c.includes(x) || bigramSim(x, c) >= 0.5)) continue;
        seen.push(c); out.push(a);
    }
    return out;
}
export function courseTitle(c: CourseSeoFacts): string {
    const parts = ["부킹", "조인", "그린피"];
    if (c.topPrice) parts.unshift("회원권 시세");
    // 개명한 골프장은 옛 이름을 괄호로 — 아직 옛 이름으로 찾는 사람이 많다(한 개만, 제목이 길어지지 않게)
    const old = distinctAliases(c.name, c.aliases).find((a) => a.length <= 14);
    return `${c.name}${old ? `(${old})` : ""} ${parts.join("·")} | 랭큐 골프`;
}
export function courseDescription(c: CourseSeoFacts): string {
    const where = [REGION_LABEL[c.region] ?? c.region, cityShort(c.city)].filter(Boolean).join(" ");
    const shape = [c.holes ? `${c.holes}홀` : "", c.kind ?? ""].filter(Boolean).join(" ");
    const bits = [`${where} ${shape}`.trim() + " 골프장."];
    const fee = weekdayFee(c.fees);
    if (fee) bits.push(`주중 비회원 그린피 ${wonShort(fee)}.`);
    else if (c.feeFrom) bits.push(`그린피 ${wonShort(c.feeFrom)}부터.`);
    if (c.topPrice) bits.push(`회원권 시세 ${manwonText(c.topPrice)}.`);
    const traits = [...(c.grass ?? []), ...(c.play ?? []).map((p) => PLAY_WORD[p] ?? p)];
    if (traits.length) bits.push(`${traits.join(" · ")}.`);
    // 글이 없을 때 붙던 권유 문장("…알림으로 받으세요")은 뺐다 — 골프장 473곳 설명마다 같은 문장이 반복됐다(2026-09-24 검토).
    if (c.listingCount) bits.push(`지금 올라온 티타임 ${c.listingCount}건.`);
    return bits.join(" ");
}
export function listTitle(o: { intent?: GolfIntent | null; region?: string | null; city?: string | null }): string {
    const where = o.city ? cityShort(o.city) : o.region ? (REGION_LABEL[o.region] ?? o.region) : "전국";
    if (o.intent === "urgent") return `${where} 골프 취소티·임박티·긴급 조인 | 랭큐 골프`;
    if (o.intent === "join") return `${where} 골프 조인·동반자 모집 | 랭큐 골프`;
    if (o.intent === "booking") return `${where} 골프 부킹·골프장 예약 | 랭큐 골프`;
    return `${where} 골프장 — 부킹·조인·그린피·회원권 시세 | 랭큐 골프`;
}
export function listDescription(o: { intent?: GolfIntent | null; region?: string | null; city?: string | null; courseCount: number; listingCount: number }): string {
    const where = o.city ? cityShort(o.city) : o.region ? (REGION_LABEL[o.region] ?? o.region) : "전국";
    const live = o.listingCount ? `지금 ${o.listingCount}건이 올라와 있어요.` : "";
    if (o.intent === "urgent") return `${where} 골프장 당일·임박 티타임과 취소티. ${live} 관심 골프장을 등록하면 올라올 때 알려 드려요.`.trim();
    if (o.intent === "join") return `${where} 골프 조인 — 1인·2인 자리, 남녀 구성, 1부·2부·3부로 찾기. ${live}`.trim();
    if (o.intent === "booking") return `${where} 골프 부킹 — 골프장 ${o.courseCount}곳의 티타임과 그린피. ${live}`.trim();
    return `${where} 골프장 ${o.courseCount}곳 — 그린피·회원권 시세·코스 정보와 지금 올라온 부킹·조인. ${live}`.trim();
}

// ── 글(티타임) 요약 ─────────────────────────────────────────────────
/** 공개 페이지에 싣는 글 요약 — 연락처·글쓴이 없음. */
export interface PublicListing extends UrgentJoinLike {
    id: string;
    listingType: "BOOKING" | "JOIN";
    joinType?: string | null;
    datetime: string;
    greenFee?: number | null;
    costMode?: string | null;
    slots?: unknown;
    options?: string[] | null;
    sellerType?: string | null;
    joinApplied: number;
    joinCapacity: number;
    isUrgent: boolean;
}
/** 이 글이 어떤 허브에 속하나 — 긴급은 조인의 한 갈래지만 허브는 따로 둔다. */
export function listingIntents(l: Pick<PublicListing, "listingType"> & UrgentJoinLike, nowMs: number): GolfIntent[] {
    const out: GolfIntent[] = [l.listingType === "JOIN" ? "join" : "booking"];
    if (isUrgentJoin(l, nowMs)) out.push("urgent");
    return out;
}

/** 한국 시각의 '부'(1부 ~11시 · 2부 11~15시 · 3부 15시~). 목록 필터(bookingFilter.golfTimeSpan)와 같은 경계. */
export function teePart(datetime: string | Date): 1 | 2 | 3 {
    const h = new Date(new Date(datetime).getTime() + 9 * 3600_000).getUTCHours();
    return h < 11 ? 1 : h < 15 ? 2 : 3;
}
