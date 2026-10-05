/**
 * 네이버 지역 검색 — NAVER API HUB(네이버 클라우드). 골프장 상세 '근처'(shared/golfAround 머리말에 약관·검색어 근거).
 * 키: NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET(없으면 nokey). 하루 25,000회.
 * 여기서는 부르고 모양만 맞춘다 — **아무것도 저장하지 않는다**(메모리에도). 순서도 그대로.
 */
import { nearbyQuery, plainText, type NearbyKind, type NearbyPlace } from "../../shared/golfAround.js";

const URL_LOCAL = "https://naverapihub.apigw.ntruss.com/search/v1/local";

export type NearbySearch =
    | { ok: true; query: string; items: NearbyPlace[] }
    | { ok: false; reason: "nokey" | "quota" | "error" };

export async function searchNearby(courseName: string, kind: NearbyKind, timeoutMs = 3500): Promise<NearbySearch> {
    const id = process.env.NAVER_HUB_CLIENT_ID, secret = process.env.NAVER_HUB_CLIENT_SECRET;
    if (!id || !secret) return { ok: false, reason: "nokey" };
    const query = nearbyQuery(courseName, kind);
    const u = new URL(URL_LOCAL);
    u.searchParams.set("query", query);
    u.searchParams.set("display", "5");   // 지역 검색은 한 번에 다섯 곳이 끝이다
    u.searchParams.set("sort", "random"); // 정확도순 — '근처'에는 리뷰순(comment)보다 가깝게 나온다(실측)
    try {
        const r = await fetch(u, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429) return { ok: false, reason: "quota" };
        if (!r.ok) return { ok: false, reason: "error" };
        const j: any = await r.json().catch(() => null);
        if (!j || !Array.isArray(j.items)) return { ok: false, reason: "error" };
        const items: NearbyPlace[] = j.items.map((it: any) => ({
            name: plainText(it.title), category: plainText(it.category), address: plainText(it.roadAddress || it.address),
        })).filter((x: NearbyPlace) => x.name);
        return { ok: true, query, items };
    } catch {
        return { ok: false, reason: "error" };
    }
}
