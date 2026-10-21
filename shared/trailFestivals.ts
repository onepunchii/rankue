/**
 * 축제가 열리는 둘레길(2026-10-21) — 지금 열리거나 30일 안에 열리는 축제 가운데 코리아둘레길 코스 선에서 5km 안(서울 · 광역시 3km)인 것.
 * 축제마다 가장 가까운 코스 하나, 코스마다 축제 하나(지금 열리는 것 · 먼저 열리는 것). 둘레길 허브의 한 줄(server/routes/modules/trails GET /).
 * 거리는 코스의 줄인 선(coarse)의 점까지 — 선 위 가장 가까운 자리가 아니라 점이라 실제보다 조금 멀게 나온다(넉넉한 쪽).
 */
import type { TrailCourseSummary, TrailRouteId } from "./koreaTrails.js";
import type { TourFestival } from "./tourFestivals.js";

export const FESTIVE_TRAIL_KM = 5;
export const FESTIVE_TRAIL_METRO_KM = 3;
export const FESTIVE_TRAIL_AHEAD_DAYS = 30;
const METRO_ADDR = /^(서울|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시)/;
const dayNo = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86_400_000;
const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };

export interface FestiveTrail {
    route: TrailRouteId; key: string; name: string; km: number; minutes: number | null; coarse: [number, number][];
    festival: { id: string; title: string; start: string; end: string; state: "now" | "soon" };
    /** 축제 자리에서 코스 선까지(km, 소수 하나) */
    dist: number;
}

export function festiveTrails(courses: readonly Pick<TrailCourseSummary, "route" | "key" | "name" | "km" | "minutes" | "coarse">[], festivals: readonly TourFestival[], todayYmd: string, max = 10): FestiveTrail[] {
    const today = dayNo(todayYmd);
    const pairs: FestiveTrail[] = [];
    for (const f of festivals) {
        if (dayNo(f.end) < today || dayNo(f.start) - today > FESTIVE_TRAIL_AHEAD_DAYS || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue;
        const limit = METRO_ADDR.test(f.addr ?? "") ? FESTIVE_TRAIL_METRO_KM : FESTIVE_TRAIL_KM;
        let best: { c: (typeof courses)[number]; d: number } | null = null;
        for (const c of courses) {
            for (const p of c.coarse) { const d = km(f.lat, f.lng, p[0], p[1]); if (d <= limit && (!best || d < best.d)) best = { c, d }; }
        }
        if (!best) continue;
        pairs.push({
            route: best.c.route as TrailRouteId, key: best.c.key, name: best.c.name, km: best.c.km, minutes: best.c.minutes, coarse: best.c.coarse.map((p) => [p[0], p[1]]),
            festival: { id: f.id, title: f.title, start: f.start, end: f.end, state: dayNo(f.start) <= today ? "now" : "soon" },
            dist: Math.round(best.d * 10) / 10,
        });
    }
    // 지금 열리는 것 → 먼저 열리는 것 → 가까운 것, 코스마다 하나
    pairs.sort((a, b) => (a.festival.state === b.festival.state ? 0 : a.festival.state === "now" ? -1 : 1) || a.festival.start.localeCompare(b.festival.start) || a.dist - b.dist);
    const seen = new Set<string>();
    return pairs.filter((p) => { const k = `${p.route}/${p.key}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
}

export interface TrailNear { route: TrailRouteId; key: string; name: string; km: number; minutes: number | null; coarse: [number, number][]; dist: number }
/**
 * 한 자리에서 가까운 코리아둘레길 코스(2026-10-21 — 산 페이지의 '가까운 둘레길'). 코스 선(coarse 점)까지 radiusKm 안, 가까운 max 개.
 * 같은 길의 이웃 코스가 셋 다 차지하지 않게 — 길마다 가장 가까운 것 먼저, 그다음 남은 자리.
 */
export function trailsNear(courses: readonly Pick<TrailCourseSummary, "route" | "key" | "name" | "km" | "minutes" | "coarse">[], lat: number, lng: number, radiusKm = 10, max = 3): TrailNear[] {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const all = courses
        .map((c) => ({ c, d: Math.min(...c.coarse.map((p) => km(lat, lng, p[0], p[1]))) }))
        .filter((x) => Number.isFinite(x.d) && x.d <= radiusKm)
        .sort((a, b) => a.d - b.d);
    const firstOfRoute = all.filter((x, i) => all.findIndex((y) => y.c.route === x.c.route) === i);
    const rest = all.filter((x) => !firstOfRoute.includes(x));
    return [...firstOfRoute, ...rest].slice(0, max).sort((a, b) => a.d - b.d)
        .map(({ c, d }) => ({ route: c.route as TrailRouteId, key: c.key, name: c.name, km: c.km, minutes: c.minutes, coarse: c.coarse.map((p) => [p[0], p[1]] as [number, number]), dist: Math.round(d * 10) / 10 }));
}
