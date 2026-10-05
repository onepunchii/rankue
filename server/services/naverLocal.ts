/**
 * 네이버 지역 검색 — NAVER API HUB(네이버 클라우드). 골프장 상세 '근처'(shared/golfAround 머리말에 약관·검색어 근거).
 * 키: NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET(없으면 nokey). 하루 25,000회.
 * 여기서는 부르고 모양만 맞춘다 — **아무것도 저장하지 않는다**(메모리에도). 순서도 그대로.
 *
 * 이름을 바꿔 다시 묻기(2026-10-05 오너 신고: "스카이72는 음식점이 안 나온다"):
 *   골프장 이름 그대로는 다섯 곳 중 한 곳꼴로 안 잡힌다(490곳 중 0건 69곳 · 엉뚱한 동네 22곳 — 괄호·점·긴 법인 이름·바뀐 이름).
 *   그래서 부르는 쪽이 준 이름들(shared/golfAround nearbySearchNames)을 차례로 묻고, **처음으로 쓸 만한 답**을 그대로 돌려준다.
 *   '쓸 만하다' = 결과가 있고, 골프장 자리를 알 때는 그 가운데 둘 이상이 가까이 있다(이름이 비슷한 다른 동네 가게를 막는다).
 *   주소로 만든 이름(시군 + 읍면동)의 답은 거리로 의심하지 않는다 — 우리 좌표가 틀린 골프장이 있다.
 *   답은 통째로 쓰거나 통째로 버린다. 한 줄씩 거르거나 다시 줄 세우지 않고, 좌표는 재는 데만 쓰고 내보내지 않는다.
 */
import { NEARBY_WORD, nearbyWordQuery, plainText, type NearbyKind, type NearbyName, type NearbyPlace } from "../../shared/golfAround.js";

const URL_LOCAL = "https://naverapihub.apigw.ntruss.com/search/v1/local";
/** 이름을 바꿔 묻는 데 쓰는 시간의 뚜껑 — 화면은 이 안에 답을 받아야 한다 */
const TOTAL_BUDGET_MS = 6000;

export type NearbySearch =
    | { ok: true; query: string; items: NearbyPlace[] }
    | { ok: false; reason: "nokey" | "quota" | "error" };

/** 누구 근처를 찾나 — 물어볼 이름들과(차례대로), 알고 있으면 그 자리 */
export interface NearbyTarget {
    names: readonly NearbyName[];
    /** 골프장 자리와 '가깝다'의 반경. 모르면 거리로 가리지 않는다 */
    at?: { lat: number; lng: number; radiusKm: number } | null;
}
const targetOf = (t: string | NearbyTarget): NearbyTarget => (typeof t === "string" ? { names: [{ name: t }] } : t);

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

type Once = { ok: true; items: NearbyPlace[]; near: number | null } | { ok: false; reason: "quota" | "error" };
/** 한 번 묻는다. near = 반경 안에 든 곳의 수(자리를 모르면 null) — 답을 쓸지 정하는 데만 쓴다 */
async function once(query: string, id: string, secret: string, at: NearbyTarget["at"], timeoutMs: number): Promise<Once> {
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
        const raw = (j.items as any[]).filter((it) => plainText(it.title));
        const items: NearbyPlace[] = raw.map((it) => ({ name: plainText(it.title), category: plainText(it.category), address: plainText(it.roadAddress || it.address) }));
        let near: number | null = null;
        if (at) {
            near = 0;
            for (const it of raw) {
                const lat = Number(it.mapy) / 1e7, lng = Number(it.mapx) / 1e7;
                if (Number.isFinite(lat) && Number.isFinite(lng) && km(at, { lat, lng }) <= at.radiusKm) near++;
            }
        }
        return { ok: true, items, near };
    } catch {
        return { ok: false, reason: "error" };
    }
}

/** 정해 둔 칩(맛집·해장국 …)으로 찾는다 */
export function searchNearby(target: string | NearbyTarget, kind: NearbyKind, timeoutMs = 3500): Promise<NearbySearch> {
    return searchNearbyWord(target, NEARBY_WORD[kind], timeoutMs);
}

/**
 * 낱말 하나로 찾는다 — 이 동네 대표 메뉴(shared/golfLocalDish)가 이 길로 온다.
 * 낱말은 **부르는 쪽이 사전에서 꺼낸 것**이어야 한다(라우트가 findLocalDish 로 거른다) — 손님이 친 말을 그대로 넣지 않는다.
 * target 이 글자면 그 이름 하나로만 묻는다. 이름 여럿이면 차례로 묻고 처음으로 쓸 만한 답을 돌려준다.
 */
export async function searchNearbyWord(target: string | NearbyTarget, word: string, timeoutMs = 3500): Promise<NearbySearch> {
    const id = process.env.NAVER_HUB_CLIENT_ID, secret = process.env.NAVER_HUB_CLIENT_SECRET;
    if (!id || !secret) return { ok: false, reason: "nokey" };
    const t = targetOf(target);
    const first = nearbyWordQuery(t.names[0]?.name ?? "", word);
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    let tried = 0;
    for (const n of t.names) {
        const left = deadline - Date.now();
        if (tried > 0 && left < 500) break;
        const query = nearbyWordQuery(n.name, word);
        const r = await once(query, id, secret, n.area ? null : t.at, tried > 0 ? Math.min(timeoutMs, left) : timeoutMs);
        tried++;
        // 첫 물음이 막히면 그대로 알린다. 다시 묻다가 막힌 것은 '못 찾음'으로 끝낸다(첫 물음은 답이 왔었다).
        if (!r.ok) { if (tried === 1) return r; break; }
        const enough = r.near == null || r.near >= Math.min(2, r.items.length);
        if (r.items.length > 0 && enough) return { ok: true, query, items: r.items };
    }
    return { ok: true, query: first, items: [] };
}
