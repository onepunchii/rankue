/**
 * 등산 — 코스 선의 셈(2026-10-13). 거리 · 오르막 · 점 줄이기 · 선 위의 자리 찾기.
 * 적재 스크립트(코스 파일 → 저장)와 화면(높낮이 그림 · 산행 중 '길 띠')이 같은 셈을 쓴다.
 *
 * 코스 선의 한 점은 [위도, 경도, 높이(m), 출발점부터의 거리(km)] 다 — 저장할 때 거리를 같이 적어 두면 화면이 다시 재지 않는다.
 * 순수 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

/** [위도, 경도, 높이 m, 누적 거리 km] */
export type LinePoint = readonly [lat: number, lng: number, ele: number, km: number];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
/** 두 점 사이의 거리(m) */
export function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const dp = rad(bLat - aLat), dl = rad(bLng - aLng);
    const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CourseStats {
    km: number;
    /** 오르막 · 내리막의 합(m) — 기록의 잔떨림을 걸러 낸 값 */
    gainM: number;
    lossM: number;
    minM: number;
    maxM: number;
    /** 출발점과 도착점이 가까운가(원점 회귀) */
    loop: boolean;
}
/** 높이의 잔떨림을 이만큼(m)은 무시한다 — 점마다 1~2m 씩 흔들리는 것을 다 더하면 오르막이 부풀려진다 */
export const ELE_NOISE_M = 3;
/** 출발 · 도착이 이 안이면 원점 회귀 */
export const LOOP_WITHIN_M = 200;

/** 원 기록의 점들 → 누적 거리를 단 선 */
export function withKm(points: readonly (readonly [number, number, number])[]): LinePoint[] {
    let m = 0;
    return points.map((p, i) => {
        if (i > 0) m += distM(points[i - 1][0], points[i - 1][1], p[0], p[1]);
        return [p[0], p[1], p[2], m / 1000] as const;
    });
}

export function courseStats(line: readonly LinePoint[]): CourseStats {
    if (line.length === 0) return { km: 0, gainM: 0, lossM: 0, minM: 0, maxM: 0, loop: false };
    let gain = 0, loss = 0, ref = line[0][2], min = line[0][2], max = line[0][2];
    for (const p of line) {
        const e = p[2];
        if (e < min) min = e;
        if (e > max) max = e;
        const d = e - ref;
        if (d >= ELE_NOISE_M) { gain += d; ref = e; } else if (d <= -ELE_NOISE_M) { loss -= d; ref = e; }
    }
    const a = line[0], b = line[line.length - 1];
    return { km: b[3], gainM: Math.round(gain), lossM: Math.round(loss), minM: Math.round(min), maxM: Math.round(max), loop: line.length > 2 && distM(a[0], a[1], b[0], b[1]) <= LOOP_WITHIN_M };
}

/**
 * 점을 줄인다 — 거리로 고르게 뽑되 가장 높은 점 · 가장 낮은 점 · 처음 · 끝은 꼭 남긴다(높낮이 그림의 꼭대기가 깎이지 않게).
 * 저장 · 화면용이다. 원 기록의 거리 · 오르막은 줄이기 **전에** 잰 값을 쓴다.
 */
export function thinLine(line: readonly LinePoint[], max = 160): LinePoint[] {
    if (line.length <= max) return [...line];
    const total = line[line.length - 1][3];
    const keep = new Set<number>([0, line.length - 1]);
    let hi = 0, lo = 0;
    line.forEach((p, i) => { if (p[2] > line[hi][2]) hi = i; if (p[2] < line[lo][2]) lo = i; });
    keep.add(hi); keep.add(lo);
    const step = total / (max - 1);
    let next = step;
    for (let i = 1; i < line.length - 1; i++) if (line[i][3] >= next) { keep.add(i); next += step; }
    return Array.from(keep).sort((a, b) => a - b).map((i) => line[i]);
}

/** 저장할 때의 자리수 — 위경도 5자리(≈1m) · 높이 정수 · 거리 3자리(1m) */
export const packLine = (line: readonly LinePoint[]): number[][] => line.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5, Math.round(p[2]), Math.round(p[3] * 1000) / 1000]);

export interface OnLine {
    /** 가장 가까운 선 위 점의 번호 */
    index: number;
    /** 그 점까지의 누적 거리(km) */
    km: number;
    /** 선에서 떨어진 거리(m) */
    offM: number;
    /** 그 점의 높이(m) */
    ele: number;
}
/** 한 자리(위경도)가 코스 선의 어디쯤인가 — 가장 가까운 점. 선이 비면 null */
export function nearestOnLine(line: readonly LinePoint[], lat: number, lng: number): OnLine | null {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
        const d = distM(lat, lng, line[i][0], line[i][1]);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? null : { index: best, km: line[best][3], offM: bestD, ele: line[best][2] };
}

/** 거리(km) → 선 위의 높이(m) — 두 점 사이는 곧게 잇는다 */
export function eleAtKm(line: readonly LinePoint[], km: number): number {
    if (line.length === 0) return 0;
    if (km <= line[0][3]) return line[0][2];
    for (let i = 1; i < line.length; i++) {
        if (line[i][3] >= km) {
            const a = line[i - 1], b = line[i], span = b[3] - a[3];
            return span > 0 ? a[2] + ((b[2] - a[2]) * (km - a[3])) / span : b[2];
        }
    }
    return line[line.length - 1][2];
}

/** 걷는 시간 어림(분) — 평지 4km/h 에 오르막 600m 마다 한 시간을 더한다(널리 쓰는 어림셈). 쉬는 시간은 넣지 않는다 */
export function walkMinutes(km: number, gainM: number): number {
    return Math.round((km / 4) * 60 + (gainM / 600) * 60);
}
/** "3시간 20분" · "45분" */
export function durationText(min: number): string {
    const h = Math.floor(min / 60), m = Math.round((min % 60) / 5) * 5;
    const hh = m === 60 ? h + 1 : h, mm = m === 60 ? 0 : m;
    return hh > 0 ? (mm > 0 ? `${hh}시간 ${mm}분` : `${hh}시간`) : `${mm || 5}분`;
}
