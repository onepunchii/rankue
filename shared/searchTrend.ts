/**
 * 검색 수요(2026-10-05 오너: "순서대로 하자"의 4번) — 네이버 검색어 트렌드로 "사람들이 무엇을 찾나"를 잰다.
 * 화면에 싣는 정보가 아니라 **무엇을 만들지 정하는 도구**다(어드민 '검색 수요'). 이 도구로 처음 잰 결과가
 * 골프장 날씨(100) > 맛집(30) > 회원권·그린피였고, 그 순서대로 만들었다.
 *
 * 읽는 법 — 값은 **상대값**이다. 한 번에 넣은 검색어 묶음들 가운데, 기간 안에서 가장 큰 값이 100.
 *   그래서 따로 조회한 결과끼리는 견줄 수 없다. 견주려면 같은 조회에 같이 넣는다(묶음 다섯 개까지).
 *   묶음 하나에 검색어를 여럿 넣으면 그 합이다("골프 조인" + "골프조인" 처럼 띄어쓰기 다른 말을 한데).
 * 한도: 묶음 5개 · 묶음당 검색어 20개 · 2016-01-01 부터(NAVER API HUB 검색어 트렌드).
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
export const TREND_MAX_GROUPS = 5;
export const TREND_MAX_KEYWORDS = 20;
export const TREND_MONTHS = [12, 24, 36] as const;
export type TrendMonths = (typeof TREND_MONTHS)[number];
export type TrendUnit = "month" | "week";

export interface TrendGroupInput { name: string; keywords: string[] }
export interface TrendRequest { groups: TrendGroupInput[]; months: TrendMonths; unit: TrendUnit }
export interface TrendPoint { period: string; ratio: number }
export interface TrendGroup {
    name: string; keywords: string[]; data: TrendPoint[];
    /** 기간 평균(원래 눈금) */
    avg: number;
    /** 평균이 가장 큰 묶음을 100 으로 본 값 */
    share: number;
    /** 가장 많이 찾은 구간 */
    peak: TrendPoint | null;
}
export interface TrendResult { startDate: string; endDate: string; unit: TrendUnit; groups: TrendGroup[] }

const pad = (n: number) => String(n).padStart(2, "0");
/**
 * 조회 기간. 달 단위는 **꽉 찬 달만** — 이번 달은 며칠치뿐이라 넣으면 마지막 칸이 푹 꺼져 보인다.
 * 주 단위는 어제까지.
 */
export function trendRange(months: number, unit: TrendUnit, nowMs: number): { startDate: string; endDate: string } {
    const k = new Date(nowMs + 9 * 3600_000);
    const y = k.getUTCFullYear(), m = k.getUTCMonth(), d = k.getUTCDate();
    const iso = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    if (unit === "month") {
        const end = new Date(Date.UTC(y, m, 0));            // 지난달 말일
        const start = new Date(Date.UTC(y, m - months, 1)); // months 달 전 1일
        return { startDate: iso(start), endDate: iso(end) };
    }
    const end = new Date(Date.UTC(y, m, d - 1));
    const start = new Date(Date.UTC(y, m - months, d));
    return { startDate: iso(start), endDate: iso(end) };
}

/** 입력 다듬기 — 빈 것·겹친 것을 빼고 한도에 맞춘다. 쓸 묶음이 없으면 null. */
export function cleanTrendRequest(raw: unknown): TrendRequest | null {
    const r = (raw ?? {}) as { groups?: unknown; months?: unknown; unit?: unknown };
    if (!Array.isArray(r.groups)) return null;
    const groups: TrendGroupInput[] = [];
    const names = new Set<string>();
    for (const g of r.groups as { name?: unknown; keywords?: unknown }[]) {
        const kws = [...new Set((Array.isArray(g?.keywords) ? g.keywords : []).map((k) => String(k ?? "").trim().slice(0, 40)).filter(Boolean))].slice(0, TREND_MAX_KEYWORDS);
        if (!kws.length) continue;
        let name = String(g?.name ?? "").trim().slice(0, 20) || kws[0].slice(0, 20);
        while (names.has(name)) name = `${name}·`.slice(0, 20) + (names.size + 1); // 이름이 같으면 응답에서 섞인다
        names.add(name);
        groups.push({ name, keywords: kws });
        if (groups.length >= TREND_MAX_GROUPS) break;
    }
    if (!groups.length) return null;
    const months = (TREND_MONTHS as readonly number[]).includes(Number(r.months)) ? (Number(r.months) as TrendMonths) : 12;
    return { groups, months, unit: r.unit === "week" ? "week" : "month" };
}

/** 네이버 응답(results[].data[]) → 평균·비중·정점이 붙은 묶음. 평균이 큰 순. */
export function summarizeTrend(results: { title: string; keywords?: string[]; data?: { period: string; ratio: number }[] }[], req: TrendRequest): TrendGroup[] {
    const groups = req.groups.map((g) => {
        const hit = results.find((x) => x.title === g.name);
        const data = (hit?.data ?? []).map((p) => ({ period: String(p.period), ratio: Number(p.ratio) || 0 }));
        // 검색량이 0 인 구간은 응답에서 빠진다 — 평균은 기간 전체 칸 수로 나눠야 한다(빠진 칸을 빼고 나누면 드문 검색어가 부풀려진다)
        const slots = Math.max(data.length, req.unit === "month" ? req.months : Math.round(req.months * 4.345));
        const sum = data.reduce((a, p) => a + p.ratio, 0);
        const peak = data.length ? data.reduce((a, p) => (p.ratio > a.ratio ? p : a)) : null;
        return { name: g.name, keywords: g.keywords, data, avg: slots ? sum / slots : 0, share: 0, peak };
    });
    const top = Math.max(...groups.map((g) => g.avg), 0);
    for (const g of groups) g.share = top > 0 ? Math.round((g.avg / top) * 100) : 0;
    return groups.sort((a, b) => b.avg - a.avg);
}

/** 골프장 하나를 넣으면 '그 이름에 붙여 찾는 말' 다섯 묶음을 만든다 — 띄어 쓴 꼴·붙여 쓴 꼴을 같이 */
export function courseSuffixGroups(courseName: string, extraNames: string[] = []): TrendGroupInput[] {
    const names = [...new Set([courseName, ...extraNames].map((n) => n.trim()).filter(Boolean))].slice(0, 3);
    const v = (...suffixes: string[]) => names.flatMap((n) => suffixes.flatMap((s) => [`${n} ${s}`, `${n}${s}`])).slice(0, TREND_MAX_KEYWORDS);
    return [
        { name: "날씨", keywords: v("날씨") },
        { name: "맛집", keywords: v("맛집") },
        { name: "그린피", keywords: v("그린피", "가격") },
        { name: "회원권", keywords: v("회원권") },
        { name: "예약·부킹", keywords: v("예약", "부킹") },
    ];
}

/** 자주 재 보는 묶음 */
export const TREND_PRESETS: { id: string; label: string; groups: TrendGroupInput[] }[] = [
    { id: "golf", label: "골프 큰 검색어", groups: [
        { name: "골프장 날씨", keywords: ["골프장 날씨", "골프장날씨"] },
        { name: "골프 예약", keywords: ["골프 예약", "골프예약", "골프장 예약"] },
        { name: "골프 회원권", keywords: ["골프 회원권", "골프회원권", "회원권 시세"] },
        { name: "골프 조인", keywords: ["골프 조인", "골프조인"] },
        { name: "스크린골프", keywords: ["스크린골프"] },
    ] },
    { id: "billiards", label: "당구 큰 검색어", groups: [
        { name: "PBA", keywords: ["PBA", "프로당구"] },
        { name: "당구장", keywords: ["당구장"] },
        { name: "당구 게임", keywords: ["당구 게임", "당구게임"] },
        { name: "당구 레슨", keywords: ["당구 레슨", "당구레슨"] },
        { name: "3쿠션", keywords: ["3쿠션", "쓰리쿠션"] },
    ] },
    { id: "sports", label: "종목 사이", groups: [
        { name: "PBA", keywords: ["PBA", "프로당구"] },
        { name: "당구장", keywords: ["당구장"] },
        { name: "스크린골프", keywords: ["스크린골프"] },
        { name: "파크골프", keywords: ["파크골프"] },
        { name: "골프 조인", keywords: ["골프 조인", "골프조인"] },
    ] },
    { id: "next", label: "다음 종목 후보", groups: [
        { name: "풋살", keywords: ["풋살", "풋살장"] },
        { name: "탁구", keywords: ["탁구", "탁구장"] },
        { name: "파크골프", keywords: ["파크골프", "파크골프장"] },
        { name: "러닝", keywords: ["러닝크루", "러닝 크루"] },
        { name: "당구장", keywords: ["당구장"] },
    ] },
];
