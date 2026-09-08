/**
 * 차트 좌표 — 순수 함수. 눈금은 1·2·2.5·5×10ⁿ 의 깔끔한 단계, 막대는 두께 ≤ 24 px 에 2 px 간격, 선은 직선(곡선 보간은 값을 왜곡한다).
 */
export interface XY { readonly x: number; readonly y: number }

const round10 = (v: number): number => Number(v.toFixed(10));

/** range 를 count 칸쯤으로 나누는 깔끔한 단계. */
export function niceStep(range: number, count: number): number {
    const raw = Math.max(range, Number.EPSILON) / Math.max(1, count);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / p;
    const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
    return round10(m * p);
}

/** min..max 를 덮는 깔끔한 눈금 값들(양 끝 포함). max ≤ min 이면 min..min+1. */
export function niceTicks(min: number, max: number, count = 4): number[] {
    if (!(max > min)) max = min + 1;
    const step = niceStep(max - min, count);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out: number[] = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(round10(v));
    return out;
}

/** 선형 스케일. 정의역 폭이 0이면 r0. */
export function scale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
    const span = d1 - d0;
    return (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
}

/** n 개를 x0..x1 에 고르게. 하나면 가운데. */
export function xPositions(n: number, x0: number, x1: number): number[] {
    if (n <= 0) return [];
    if (n === 1) return [(x0 + x1) / 2];
    return Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));
}

export function linePath(pts: readonly XY[]): string {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function areaPath(pts: readonly XY[], baseY: number): string {
    if (pts.length === 0) return "";
    const last = pts[pts.length - 1], first = pts[0];
    return `${linePath(pts)} L${last.x.toFixed(1)} ${baseY.toFixed(1)} L${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

export interface ColumnLayout {
    readonly band: number;
    readonly w: number;
    x(i: number): number;
}

/** 막대 n 개를 width 에 — 두께는 min(maxThick, band − gap), 2 px 이상. */
export function columnLayout(n: number, width: number, gap = 2, maxThick = 24): ColumnLayout {
    const band = n > 0 ? width / n : width;
    const w = Math.max(2, Math.min(maxThick, band - gap));
    return { band, w, x: (i) => i * band + (band - w) / 2 };
}

/** 위만 둥근(4 px) 막대. 높이 0 이면 빈 문자열. */
export function columnPath(x: number, yTop: number, yBase: number, w: number, r = 4): string {
    const h = yBase - yTop;
    if (h <= 0) return "";
    const rr = Math.min(r, w / 2, h);
    const f = (v: number) => v.toFixed(1);
    return `M${f(x)} ${f(yBase)} V${f(yTop + rr)} Q${f(x)} ${f(yTop)} ${f(x + rr)} ${f(yTop)} H${f(x + w - rr)} Q${f(x + w)} ${f(yTop)} ${f(x + w)} ${f(yTop + rr)} V${f(yBase)} Z`;
}

/** x 에 가장 가까운 위치의 인덱스(정렬된 xs). 비어 있으면 -1. */
export function nearestIndex(xs: readonly number[], x: number): number {
    let best = -1, d = Number.POSITIVE_INFINITY;
    for (let i = 0; i < xs.length; i++) {
        const dd = Math.abs(xs[i] - x);
        if (dd < d) { d = dd; best = i; }
    }
    return best;
}
