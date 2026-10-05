/**
 * 네이버 검색어 트렌드 — NAVER API HUB(네이버 클라우드). 어드민 '검색 수요'(shared/searchTrend 머리말에 읽는 법).
 * 키: NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET. 운영자가 누를 때만 부른다 — 저장하지 않는다.
 */
import { summarizeTrend, trendRange, type TrendRequest, type TrendResult } from "../../shared/searchTrend.js";

const URL_TREND = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";

export type TrendSearch = { ok: true; result: TrendResult } | { ok: false; reason: "nokey" | "quota" | "error"; detail?: string };

export async function fetchSearchTrend(req: TrendRequest, nowMs = Date.now(), timeoutMs = 8000): Promise<TrendSearch> {
    const id = process.env.NAVER_HUB_CLIENT_ID, secret = process.env.NAVER_HUB_CLIENT_SECRET;
    if (!id || !secret) return { ok: false, reason: "nokey" };
    const { startDate, endDate } = trendRange(req.months, req.unit, nowMs);
    try {
        const r = await fetch(URL_TREND, {
            method: "POST",
            headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret, "Content-Type": "application/json" },
            body: JSON.stringify({ startDate, endDate, timeUnit: req.unit, keywordGroups: req.groups.map((g) => ({ groupName: g.name, keywords: g.keywords })) }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.status === 429) return { ok: false, reason: "quota" };
        const j: any = await r.json().catch(() => null);
        if (!r.ok || !j || !Array.isArray(j.results)) return { ok: false, reason: "error", detail: String(j?.errorMessage ?? j?.error?.message ?? r.status).slice(0, 200) };
        return { ok: true, result: { startDate, endDate, unit: req.unit, groups: summarizeTrend(j.results, req) } };
    } catch (e) {
        return { ok: false, reason: "error", detail: String((e as Error)?.message ?? e).slice(0, 200) };
    }
}
