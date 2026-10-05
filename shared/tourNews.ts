/**
 * 투어 소식 — 네이버 뉴스 검색을 그 자리에서(2026-10-05 오너: "순서대로 하자"의 3번).
 *
 * 왜 투어 단위만인가(실측 2026-10-05, 제목·요약에 그 종목 낱말이 든 비율):
 *   · 투어 이름은 깨끗하다 — "PBA 투어"·"LPBA"·"3쿠션 당구"·"KPGA 투어"·"KLPGA 투어"·"PGA 투어"·"LPGA 투어" 모두 10/10.
 *   · 선수 이름은 들쭉날쭉하다(박현경 10/10, 조재호·김가영·고진영 0~1/10 — 동명이인·본문에만 언급). 골프장 이름은 0~1/10(자선대회·분양 광고).
 *   · "세계3쿠션"을 최신순으로 찾으면 1/10 — 그래서 3쿠션은 "3쿠션 당구"다.
 * 정렬: 기본은 최신순(date). KPGA·KLPGA 는 최신순이면 한두 매체의 단신이 줄을 채워 정확도순(sim)으로 받는다(그래도 하루 안쪽 기사다).
 * 당구 검색 수요는 PBA 에 몰려 있다(네이버 검색량: PBA 100 · 당구장 40 · 나머지 0~1) — PBA 페이지가 첫 자리다.
 *
 * 네이버 검색 API 특약(2026-09-07 시행 — 기사 요약으로 확인) 때문에 지키는 것:
 *   저장·캐싱 금지(열 때마다 실시간, no-store) · 가공 금지(순서·제목 그대로, 걸러 내지 않는다) · 결과 화면에 광고 금지 · AI 요약 금지.
 *   검색엔진용 화면(prerender)에는 싣지 않는다.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
export const TOUR_NEWS = {
    pba: { query: "PBA 투어", sort: "date", label: "PBA 투어 소식" },
    lpba: { query: "LPBA", sort: "date", label: "LPBA 소식" },
    carom: { query: "3쿠션 당구", sort: "date", label: "3쿠션 소식" },
    kpga: { query: "KPGA 투어", sort: "sim", label: "KPGA 투어 소식" },
    klpga: { query: "KLPGA 투어", sort: "sim", label: "KLPGA 투어 소식" },
    pga: { query: "PGA 투어", sort: "date", label: "PGA 투어 소식" },
    lpga: { query: "LPGA 투어", sort: "date", label: "LPGA 투어 소식" },
} as const satisfies Record<string, { query: string; sort: "date" | "sim"; label: string }>;
export type TourNewsTopic = keyof typeof TOUR_NEWS;
export const isTourNewsTopic = (v: unknown): v is TourNewsTopic => typeof v === "string" && Object.prototype.hasOwnProperty.call(TOUR_NEWS, v);
/** 한 번에 보여 주는 기사 수 */
export const TOUR_NEWS_COUNT = 5;

/** 기사 한 줄 — 네이버가 준 글 그대로(강조 태그·엔티티만 글자로) */
export interface TourNewsItem {
    title: string;
    /** 네이버가 준 주소(네이버 뉴스에 실린 글이면 네이버 뉴스, 아니면 언론사 원문) */
    url: string;
    /** 언론사 주소의 호스트("mk.co.kr") — 어디 글인지 */
    source: string;
    /** 게재 시각(ISO). 못 읽으면 빈 문자열 */
    at: string;
}
export interface TourNewsResult { query: string; items: TourNewsItem[] }

/** 네이버 뉴스 검색 주소 — '더 보기'가 같은 검색어·같은 정렬로 연다 */
export function naverNewsUrl(topic: TourNewsTopic): string {
    const t = TOUR_NEWS[topic];
    return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(t.query)}${t.sort === "date" ? "&sort=1" : ""}`;
}

/** 응답의 강조 태그(<b>)를 떼고 HTML 엔티티를 글자로 — 낱말은 건드리지 않는다 */
export function newsText(s: unknown): string {
    return String(s ?? "").replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").trim();
}
export function hostOf(url: unknown): string {
    try { return new URL(String(url)).hostname.replace(/^(www|m)\./, ""); } catch { return ""; }
}
/** "3시간 전" · "어제" · "10/2" — 화면의 시각 표시 */
export function newsAgo(iso: string, nowMs: number): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const min = Math.floor((nowMs - t) / 60_000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    if (h < 48) return "어제";
    const k = new Date(t + 9 * 3600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}
