/**
 * 코리아둘레길 코스 근처 볼거리(2026-10-21) — 한국관광공사 관광지(TourAPI locationBasedList2 · 관광지 12) 가운데 코스 선 2km 안, 사진이 있는 여섯 곳.
 * 받기는 server/scripts/fetch-trail-spots.ts(파일 server/assets/trails/near-spots.json), 화면은 코스 페이지의 '코스 근처 볼거리'.
 * 사진은 공공누리 1 · 3유형으로 표시된 것만 — 제3유형은 자르지 않는다(화면은 원본 비율). 이름 · 주소는 받은 그대로.
 */
export interface TrailSpot { id: string; title: string; addr: string | null; lat: number; lng: number; image: string; thumb: string | null; lic: "Type1" | "Type3"; dist: number }

export const TRAIL_SPOT_KM = 2;
export const TRAIL_SPOTS_MAX = 6;
const km = (a: number, b: number, c: number, d: number) => { const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t; return Math.sqrt(x * x + y * y) * 6371; };
const https = (v: unknown) => String(v ?? "").trim().replace(/^http:\/\//, "https://");
const TOUR_IMG = /^https:\/\/tong\.visitkorea\.or\.kr\//;

/** 받은 한 줄 → 우리 꼴(코스 선까지의 거리와 함께). 사진 없는 곳 · 표시 없는 사진 · 2km 밖은 null */
function spotOf(x: Record<string, unknown>, coarse: readonly (readonly [number, number])[]): TrailSpot | null {
    const id = String(x.contentid ?? "");
    if (!/^\d+$/.test(id)) return null;
    const lic = String(x.cpyrhtDivCd ?? "");
    const image = https(x.firstimage);
    if ((lic !== "Type1" && lic !== "Type3") || !TOUR_IMG.test(image)) return null;
    const lat = Number(x.mapy), lng = Number(x.mapx);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !coarse.length) return null;
    const dist = Math.min(...coarse.map((p) => km(lat, lng, p[0], p[1])));
    const title = String(x.title ?? "").replace(/\s+/g, " ").trim();
    if (dist > TRAIL_SPOT_KM || !title) return null;
    const thumb = https(x.firstimage2);
    return { id, title, addr: String(x.addr1 ?? "").replace(/\s+/g, " ").trim() || null, lat, lng, image, thumb: TOUR_IMG.test(thumb) ? thumb : null, lic: lic as "Type1" | "Type3", dist: Math.round(dist * 10) / 10 };
}

/**
 * 코스의 시작 · 가운데 · 끝에서 받은 묶음들 → 여섯 곳. 한 끝에 몰리지 않게 묶음마다 차례로 하나씩(각 묶음은 코스 선에 가까운 순),
 * 같은 곳은 한 번. (2026-10-21: 가까운 순으로만 고르면 해파랑길 1코스가 해운대 쪽 여섯으로 차고 시작점 오륙도 · 이기대가 빠졌다)
 */
export function pickTrailSpots(groups: readonly (readonly Record<string, unknown>[])[], coarse: readonly (readonly [number, number])[]): TrailSpot[] {
    const lists = groups.map((g) => g.map((x) => spotOf(x, coarse)).filter((x): x is TrailSpot => !!x).sort((a, b) => a.dist - b.dist));
    const seen = new Set<string>();
    const out: TrailSpot[] = [];
    for (let round = 0; out.length < TRAIL_SPOTS_MAX && lists.some((l) => l.length > round); round++) {
        for (const l of lists) {
            const s = l[round];
            if (!s || seen.has(s.id)) continue;
            seen.add(s.id);
            out.push(s);
            if (out.length >= TRAIL_SPOTS_MAX) break;
        }
    }
    return out;
}

export const TRAIL_SPOT_CREDIT = "관광지 정보 · 사진 한국관광공사 · 공공누리";
