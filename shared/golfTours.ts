/**
 * 골프 랭킹 4개 투어의 공통 메타(2026-09-13 오너: "골프 탭에 당구와 비슷한 랭킹 — PGA·LPGA·KPGA·KLPGA, 1차에 모두, 공개 전체").
 *
 * 두 종류다:
 *  - **세계 랭킹**(owgr 남자 · rolex 여자): 주 1회, 평균 포인트가 순위 기준, 국가별 집계·국내 순위판이 의미 있다.
 *  - **투어 랭킹**(kpga · klpga): 시즌 포인트(제네시스·대상포인트)가 순위 기준, 대회가 끝날 때마다 바뀐다. 기록(비거리 등)이 풍성하다.
 * 화면·API·사이트맵·크론이 전부 이 표를 본다. 투어를 더할 때는 여기와 서버 수집기(server/services/golf)만 늘리면 된다.
 *
 * 출처 표기는 오너 결정(2026-09-13)대로 "그냥 거기 자료다" 수준으로 작게 — 링크 하나.
 */
export const GOLF_TOURS = ["owgr", "rolex", "kpga", "klpga"] as const;
export type GolfTour = (typeof GOLF_TOURS)[number];

export interface GolfTourMeta {
    readonly id: GolfTour;
    /** 세계 랭킹인가(국가 집계·국내 순위판·1년 전 대비를 그린다) */
    readonly world: boolean;
    readonly gender: "M" | "F";
    /** 화면 이름 키(i18n) */
    readonly labelKey: string;
    /** 출처 이름·링크 — 작게 한 줄 */
    readonly sourceName: string;
    readonly sourceUrl: string;
    /** 순위 기준 값의 종류: avg(평균 포인트) · points(시즌 포인트) */
    readonly valueKind: "avg" | "points";
    /** 순위 기준 값의 이름 키 */
    readonly valueLabelKey: string;
}

export const GOLF_TOUR_META: Readonly<Record<GolfTour, GolfTourMeta>> = {
    owgr: { id: "owgr", world: true, gender: "M", labelKey: "golf.tourOwgr", sourceName: "OWGR", sourceUrl: "https://www.owgr.com", valueKind: "avg", valueLabelKey: "golf.avgPoints" },
    rolex: { id: "rolex", world: true, gender: "F", labelKey: "golf.tourRolex", sourceName: "Rolex Rankings", sourceUrl: "https://www.rolexrankings.com", valueKind: "avg", valueLabelKey: "golf.avgPoints" },
    kpga: { id: "kpga", world: false, gender: "M", labelKey: "golf.tourKpga", sourceName: "KPGA", sourceUrl: "https://www.kpga.co.kr", valueKind: "points", valueLabelKey: "golf.seasonPoints" },
    klpga: { id: "klpga", world: false, gender: "F", labelKey: "golf.tourKlpga", sourceName: "KLPGA", sourceUrl: "https://klpga.co.kr", valueKind: "points", valueLabelKey: "golf.seasonPoints" },
};

export function isGolfTour(v: unknown): v is GolfTour {
    return typeof v === "string" && (GOLF_TOURS as readonly string[]).includes(v);
}

/**
 * 선수 카드에 크게 보여 줄 대표 기록(투어별 원본 키 → 공통 이름). 순서가 곧 화면 순서.
 * KPGA 는 menuId(문자열), KLPGA 는 menu2 코드가 원본 키다 — 라벨은 원본이 주는 걸 그대로 쓴다.
 */
export interface StatHighlight { readonly key: string; readonly emoji: string; readonly short: string }
export const STAT_HIGHLIGHTS: Readonly<Record<"kpga" | "klpga", readonly StatHighlight[]>> = {
    kpga: [
        { key: "9", emoji: "🚀", short: "드라이브" },      // 평균 드라이브 거리(Yds)
        { key: "10", emoji: "🎯", short: "페어웨이" },     // 페어웨이 안착률(%)
        { key: "11", emoji: "🟢", short: "그린 적중" },    // 그린 적중률(%)
        { key: "14", emoji: "⛳", short: "평균 퍼트" },    // 평균 퍼트 수
        { key: "15", emoji: "🧮", short: "평균타수" },     // 평균타수
        { key: "2", emoji: "💰", short: "상금" },          // 제네시스 상금 순위(원)
    ],
    klpga: [
        { key: "AvgDrivingDistance", emoji: "🚀", short: "드라이브" },
        { key: "FairwayHitPct", emoji: "🎯", short: "페어웨이" },
        { key: "ParOnPct", emoji: "🟢", short: "그린 적중" },
        { key: "AvgPutt", emoji: "⛳", short: "평균 퍼트" },
        { key: "AvgScore", emoji: "🧮", short: "평균타수" },
        { key: "Money", emoji: "💰", short: "상금" },
    ],
};

/** KLPGA 공식 기록 메뉴(menu1/menu2) — 사이트가 라벨을 HTML 제목으로만 주므로 여기 적어 둔다(2026-09 실측). */
export interface KlpgaMenu { readonly menu1: "Point" | "Score" | "Tech" | "Etc"; readonly menu2: string; readonly label: string; readonly unit: string; readonly asc?: boolean }
export const KLPGA_MENUS: readonly KlpgaMenu[] = [
    { menu1: "Point", menu2: "Klpga", label: "대상포인트", unit: "P" },
    { menu1: "Point", menu2: "Money", label: "상금", unit: "원" },
    { menu1: "Point", menu2: "Rookie", label: "신인상포인트", unit: "P" },
    { menu1: "Point", menu2: "Krank", label: "K-랭킹", unit: "P" },
    { menu1: "Score", menu2: "AvgScore", label: "평균타수", unit: "타", asc: true },
    { menu1: "Score", menu2: "Par3Performance", label: "파3 성적", unit: "타", asc: true },
    { menu1: "Score", menu2: "Par4Performance", label: "파4 성적", unit: "타", asc: true },
    { menu1: "Score", menu2: "Par5Performance", label: "파5 성적", unit: "타", asc: true },
    { menu1: "Score", menu2: "AvgBirdie", label: "평균 버디", unit: "개" },
    { menu1: "Score", menu2: "BirdiePct", label: "버디율", unit: "%" },
    { menu1: "Score", menu2: "HoleInOne", label: "홀인원", unit: "개" },
    { menu1: "Score", menu2: "Eagle", label: "이글", unit: "개" },
    { menu1: "Score", menu2: "ParbrakePct", label: "파 브레이크율", unit: "%" },
    { menu1: "Tech", menu2: "AvgDrivingDistance", label: "드라이브 거리", unit: "yd" },
    { menu1: "Tech", menu2: "FairwayHitPct", label: "페어웨이 안착률", unit: "%" },
    { menu1: "Tech", menu2: "ParOnPct", label: "그린 적중률", unit: "%" },
    { menu1: "Tech", menu2: "AvgPutt", label: "평균 퍼팅", unit: "개", asc: true },
    { menu1: "Tech", menu2: "BunkerSavePct", label: "벙커 세이브율", unit: "%" },
    { menu1: "Tech", menu2: "RecoveryPct", label: "리커버리율", unit: "%" },
    { menu1: "Tech", menu2: "DriveJisu", label: "드라이브 지수", unit: "" },
    { menu1: "Tech", menu2: "IronJisu", label: "아이언 지수", unit: "" },
    { menu1: "Etc", menu2: "Top10FinishPct", label: "톱10 피니시율", unit: "%" },
    { menu1: "Etc", menu2: "Tasu60Pct", label: "60타대 비율", unit: "%" },
    { menu1: "Etc", menu2: "TotalJisu", label: "종합 지수", unit: "" },
];

/** 순위 기준 값 표기 — 평균 포인트는 소수 둘째, 시즌 포인트·상금은 정수(천 단위 쉼표). */
export function formatRankValue(tour: GolfTour, v: number): string {
    if (GOLF_TOUR_META[tour].valueKind === "avg") return v.toFixed(2);
    return Math.round(v).toLocaleString("en-US");
}

/** 기록 값 표기 — 단위별. 원화는 만/억으로 줄인다. */
export function formatStatValue(value: number, unit: string): string {
    if (unit === "원") {
        if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(value >= 1_000_000_000 ? 0 : 1)}억`;
        if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("en-US")}만`;
        return value.toLocaleString("en-US");
    }
    if (unit === "%") return `${value.toFixed(1)}%`;
    if (unit === "yd" || unit === "Yds") return `${value.toFixed(1)}yd`;
    if (unit === "P") return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(value >= 100 ? 1 : 2);
}
