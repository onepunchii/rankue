/**
 * 조과 적기의 '다녀온 곳'(2026-10-26 낚시 탭 리뷰 — 오너 "응"): 빈 글칸이던 것을 고를 수 있게.
 *   · 적는 동안: 내가 전에 적은 곳 → 항구(쉰한 곳) → 낚시터(861곳) 차례로, 글자가 든 것 여섯 곳. 칸이 비었으면 전에 적은 곳만.
 *   · '지금 자리'를 켜면: PLACE_SPOT_KM 안의 낚시터, 없으면 PLACE_PORT_KM 안의 항구 근처로 채운다(부르는 쪽이 칸이 비었을 때만 쓴다).
 * 거리는 낚시 화면의 다른 곳과 같은 어림(경도 1도 88.8km · 위도 1도 111km — 우리 바다의 위도에서).
 * ⚠️ 서버도 부를 수 있게 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */
export interface NamedPoint { name: string; lat?: number | null; lng?: number | null; sub?: string | null }
export type PlaceSuggestion = { name: string; kind: "recent" | "port" | "spot"; sub?: string };

/** 이 거리 안의 낚시터면 그 이름 */
export const PLACE_SPOT_KM = 2;
/** 낚시터가 없으면 이 거리 안의 항구 근처 */
export const PLACE_PORT_KM = 15;
export const PLACE_SUGGEST_MAX = 6;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
export const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);

/** 적는 글자에 맞는 곳 — 전에 적은 곳이 먼저, 같은 이름은 한 번 */
export function placeSuggestions(
    query: string,
    src: { recent: readonly string[]; ports: readonly NamedPoint[]; spots: readonly NamedPoint[] },
    limit = PLACE_SUGGEST_MAX,
): PlaceSuggestion[] {
    const q = norm(query);
    const out: PlaceSuggestion[] = [];
    const seen = new Set<string>();
    const add = (name: string, kind: PlaceSuggestion["kind"], sub?: string | null) => {
        const k = norm(name);
        if (!k || seen.has(k) || out.length >= limit) return;
        if (q && !k.includes(q) && !(sub && norm(sub).includes(q))) return;
        seen.add(k);
        out.push(sub ? { name: name.trim(), kind, sub } : { name: name.trim(), kind });
    };
    for (const r of src.recent) add(r, "recent");
    if (!q) return out;
    for (const p of src.ports) add(p.name, "port", p.sub);
    for (const s of src.spots) add(s.name, "spot", s.sub);
    return out;
}

/** 지금 자리에서 가장 그럴듯한 이름 — 가까운 낚시터, 없으면 항구 '근처'. 둘 다 멀면 null */
export function nearestPlaceName(
    at: { lat: number; lng: number },
    ports: readonly NamedPoint[],
    spots: readonly NamedPoint[],
): { name: string; kind: "spot" | "port"; km: number } | null {
    const nearest = (list: readonly NamedPoint[]) => {
        let best: { p: NamedPoint; km: number } | null = null;
        for (const p of list) {
            if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
            const km = kmBetween(at, { lat: p.lat, lng: p.lng });
            if (!best || km < best.km) best = { p, km };
        }
        return best;
    };
    const s = nearest(spots);
    if (s && s.km <= PLACE_SPOT_KM) return { name: s.p.name, kind: "spot", km: Math.round(s.km * 10) / 10 };
    const p = nearest(ports);
    if (p && p.km <= PLACE_PORT_KM) return { name: `${p.p.name} 근처`, kind: "port", km: Math.round(p.km) };
    return null;
}

/** 내 조과 목록 → 전에 적은 곳(최근 것부터 · 같은 이름 한 번) */
export function recentPlaces(catches: readonly { place?: string | null }[], limit = 8): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const c of catches) {
        const name = (c.place ?? "").trim();
        const k = norm(name);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(name);
        if (out.length >= limit) break;
    }
    return out;
}
