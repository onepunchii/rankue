/**
 * 내 근처의 산(2026-10-13 오너: "홈에 내 근처 기능으로 근처 산 · 근처 명산", "내 근처를 시각화해서 어떤 산인지 보이면 좋겠네").
 *
 * **셈은 기기에서 한다.** 서버는 산의 자리 표(GET /api/hiq/hiking/points — 누구에게나 같은 답)를 줄 뿐이고, 내 위치는 서버로 가지 않는다.
 * 그래서 이 파일은 순수 함수만 — 화면(client/src/hiking/components/NearMe)과 시험이 같이 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { distM } from "./hikingGeo.js";
import { HIKING_REGIONS } from "./hikingMountains.js";

/**
 * 산 한 곳의 자리 — 표를 가볍게 하려고 배열로 준다.
 * [주소(slug), 이름, 위도, 경도, 높이(m · 모르면 null), 표시(1 = 명산 · 2 = 산림청 100대 명산 · 더한 값), 코스 수, 권역의 순번(HIKING_REGIONS · 모르면 -1)]
 */
export type MountainPoint = readonly [slug: string, name: string, lat: number, lng: number, heightM: number | null, flags: number, courses: number, region: number];
export const POINT_FAMOUS = 1;
export const POINT_KFS = 2;

export function toMountainPoint(m: { slug: string; name: string; lat: number | null; lng: number | null; heightM: number | null; tier: number; lists: readonly string[]; courses: number; region?: string | null }): MountainPoint | null {
    if (m.lat == null || m.lng == null || !Number.isFinite(m.lat) || !Number.isFinite(m.lng)) return null;
    const flags = (m.tier === 1 ? POINT_FAMOUS : 0) | (m.lists.includes("kfs100") ? POINT_KFS : 0);
    // 소수 넷째 자리(11m쯤)면 '어느 산이 가까운가'에는 넉넉하다
    return [m.slug, m.name, Math.round(m.lat * 1e4) / 1e4, Math.round(m.lng * 1e4) / 1e4, m.heightM ?? null, flags, m.courses, HIKING_REGIONS.findIndex((r) => r.id === m.region)];
}

export interface NearMountain {
    slug: string; name: string; lat: number; lng: number; heightM: number | null;
    famous: boolean; kfs: boolean; courses: number;
    /** 권역의 id(HIKING_REGIONS) — 모르면 null */
    region: string | null;
    /** 내 자리에서의 직선 거리(km) */
    km: number;
    /** 내 자리에서 본 방향 — 0 = 북, 90 = 동(도) */
    bearing: number;
}

/** 내 자리에서 본 방향(도) — 0 북 · 90 동 · 180 남 · 270 서 */
export function bearingDeg(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
    const r = Math.PI / 180;
    const y = Math.sin((toLng - fromLng) * r) * Math.cos(toLat * r);
    const x = Math.cos(fromLat * r) * Math.sin(toLat * r) - Math.sin(fromLat * r) * Math.cos(toLat * r) * Math.cos((toLng - fromLng) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
}
const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;
/** 여덟 방위의 말 — '북동쪽'의 '북동' */
export const compass8 = (deg: number): (typeof COMPASS)[number] => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** 이보다 먼 산은 '근처'라고 하지 않는다(km) — 바다 건너 · 나라 밖에서 열었을 때 엉뚱한 산을 가깝다고 하지 않게 */
export const NEAR_MAX_KM = 120;

/** 가까운 순으로 — famousOnly 면 명산만 */
export function nearestMountains(points: readonly MountainPoint[], me: { lat: number; lng: number }, opts: { limit: number; famousOnly?: boolean; maxKm?: number }): NearMountain[] {
    const max = opts.maxKm ?? NEAR_MAX_KM;
    const out: NearMountain[] = [];
    // 위도 1도 = 111km — 먼 산은 정밀한 거리 셈 전에 걸러 낸다
    const dLat = max / 111;
    for (const p of points) {
        if (opts.famousOnly && !(p[5] & POINT_FAMOUS)) continue;
        if (Math.abs(p[2] - me.lat) > dLat) continue;
        const km = distM(me.lat, me.lng, p[2], p[3]) / 1000;
        if (km > max) continue;
        out.push({ slug: p[0], name: p[1], lat: p[2], lng: p[3], heightM: p[4], famous: !!(p[5] & POINT_FAMOUS), kfs: !!(p[5] & POINT_KFS), courses: p[6], region: HIKING_REGIONS[p[7]]?.id ?? null, km, bearing: bearingDeg(me.lat, me.lng, p[2], p[3]) });
    }
    return out.sort((a, b) => a.km - b.km).slice(0, Math.max(0, opts.limit));
}

/** 거리의 말 — 1km 아래는 100m 단위, 10km 아래는 소수 한 자리, 그 위는 km */
export function nearKmText(km: number): string {
    if (!Number.isFinite(km) || km < 0) return "";
    if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)}m`;
    if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)}km`;
    return `${Math.round(km)}km`;
}

/**
 * 근처 그림(동그란 판)의 반지름(km) — 그릴 산들이 다 들어가는 가장 작은 '읽기 좋은' 값.
 * 가장 먼 산이 판의 86% 자리에 오게 잡고, 눈금은 5 · 10 · 20 · 30 · 50 · 80 · 120 가운데서 고른다.
 */
const RADII = [2, 5, 10, 20, 30, 50, 80, 120] as const;
export function nearRadiusKm(kms: readonly number[]): number {
    const far = kms.reduce((m, k) => Math.max(m, k), 0);
    return RADII.find((r) => far <= r * 0.86) ?? RADII[RADII.length - 1];
}

/** 판 위의 자리 — 가운데가 나, 위가 북. 반지름 1 인 판에서의 [x, y](y 는 아래로 +). 판 밖이면 가장자리로 당긴다 */
export function nearSpot(m: Pick<NearMountain, "km" | "bearing">, radiusKm: number): [number, number] {
    const d = Math.min(1, radiusKm > 0 ? m.km / radiusKm : 1);
    const a = (m.bearing * Math.PI) / 180;
    return [Math.sin(a) * d, -Math.cos(a) * d];
}
