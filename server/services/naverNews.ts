/**
 * 네이버 뉴스 검색 — NAVER API HUB(네이버 클라우드). 투어 소식(shared/tourNews 머리말에 검색어·약관 근거).
 * 키: NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET(없으면 nokey). 검색 API 하루 25,000회(지역 검색과 같이 센다).
 * 부르고 모양만 맞춘다 — **아무것도 저장하지 않고, 걸러 내거나 다시 줄 세우지 않는다.**
 */
import { TOUR_NEWS, TOUR_NEWS_COUNT, hostOf, newsText, type TourNewsItem, type TourNewsTopic } from "../../shared/tourNews.js";

const URL_NEWS = "https://naverapihub.apigw.ntruss.com/search/v1/news";

export type TourNewsSearch =
    | { ok: true; query: string; items: TourNewsItem[] }
    | { ok: false; reason: "nokey" | "quota" | "error" };

export async function searchTourNews(topic: TourNewsTopic, timeoutMs = 3500): Promise<TourNewsSearch> {
    const id = process.env.NAVER_HUB_CLIENT_ID, secret = process.env.NAVER_HUB_CLIENT_SECRET;
    if (!id || !secret) return { ok: false, reason: "nokey" };
    const t = TOUR_NEWS[topic];
    const u = new URL(URL_NEWS);
    u.searchParams.set("query", t.query);
    u.searchParams.set("display", String(TOUR_NEWS_COUNT));
    u.searchParams.set("sort", t.sort);
    try {
        const r = await fetch(u, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429) return { ok: false, reason: "quota" };
        if (!r.ok) return { ok: false, reason: "error" };
        const j: any = await r.json().catch(() => null);
        if (!j || !Array.isArray(j.items)) return { ok: false, reason: "error" };
        const items: TourNewsItem[] = j.items.map((it: any) => {
            const at = Date.parse(it.pubDate);
            const url = /^https?:\/\//i.test(String(it.link ?? "")) ? String(it.link) : String(it.originallink ?? "");
            return { title: newsText(it.title), url, source: hostOf(it.originallink || it.link), at: Number.isFinite(at) ? new Date(at).toISOString() : "" };
        }).filter((x: TourNewsItem) => x.title && /^https?:\/\//i.test(x.url));
        return { ok: true, query: t.query, items };
    } catch {
        return { ok: false, reason: "error" };
    }
}
