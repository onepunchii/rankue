/**
 * 필드 홀 자료형·지형 조회. 좌표 m, x 오른쪽·y 앞·z 위. 고도는 해석적(전체 기울기 + 범프 목록) — 파일 없이 코드로.
 * 지면 종류 우선순위: green → bunker → water → fairway/tee → rough. 홀 사각형(bounds) 밖은 OB.
 */
import { pointInPolygon } from "../course.js";
import type { Surface, Vec2 } from "./types.js";

export interface Bump { readonly c: Vec2; readonly r: number; readonly a: number }   // a<0 이면 구덩이
export interface Tree { readonly c: Vec2; readonly r: number; readonly h: number }
export interface FieldHole {
    readonly id: string;
    readonly name: string;
    readonly par: 3 | 4 | 5;
    readonly lengthM: number;
    readonly hint?: string;
    readonly tee: Vec2;
    readonly cup: Vec2;
    /** 홀 사각형 [xmin, ymin, xmax, ymax] — 밖은 OB */
    readonly bounds: readonly [number, number, number, number];
    readonly green: readonly Vec2[];
    readonly fairway: readonly (readonly Vec2[])[];
    readonly teeBox?: readonly Vec2[];
    readonly fringeM?: number;              // 그린 둘레 프린지 폭(기본 1.5 m) — 단순화: 그린 다각형 안쪽 판정만, 프린지는 미구현
    readonly bunkers?: readonly (readonly Vec2[])[];
    readonly water?: readonly (readonly Vec2[])[];
    readonly deepRough?: readonly (readonly Vec2[])[];
    readonly trees?: readonly Tree[];
    readonly height: { readonly slope: Vec2; readonly bumps: readonly Bump[] };
    /** 홀별 기본 바람(w10, m/s) — 방 옵션이 덮어쓸 수 있다 */
    readonly wind?: Vec2;
}
export interface FieldCourse { readonly id: string; readonly name: string; readonly kind: "field"; readonly holes: readonly FieldHole[]; readonly stimp: number }

export function heightAt(h: FieldHole, x: number, y: number): number {
    let z = h.height.slope.x * x + h.height.slope.y * y;
    for (const b of h.height.bumps) {
        const dx = x - b.c.x, dy = y - b.c.y;
        const q = (dx * dx + dy * dy) / (b.r * b.r);
        if (q < 1) { const s = 1 - q; z += b.a * s * s; }
    }
    return z;
}

/** ∂h/∂x, ∂h/∂y (해석적) */
export function gradAt(h: FieldHole, x: number, y: number): Vec2 {
    let gx = h.height.slope.x, gy = h.height.slope.y;
    for (const b of h.height.bumps) {
        const dx = x - b.c.x, dy = y - b.c.y;
        const r2 = b.r * b.r;
        const q = (dx * dx + dy * dy) / r2;
        if (q < 1) { const k = -4 * b.a * (1 - q) / r2; gx += k * dx; gy += k * dy; }
    }
    return { x: gx, y: gy };
}

export function surfaceAt(h: FieldHole, x: number, y: number): Surface {
    const [x0, y0, x1, y1] = h.bounds;
    if (x < x0 || x > x1 || y < y0 || y > y1) return "ob";
    const p = { x, y };
    if (pointInPolygon(p, h.green)) return "green";
    for (const b of h.bunkers ?? []) if (pointInPolygon(p, b)) return "bunker";
    for (const w of h.water ?? []) if (pointInPolygon(p, w)) return "water";
    if (h.teeBox && pointInPolygon(p, h.teeBox)) return "tee";
    for (const f of h.fairway) if (pointInPolygon(p, f)) return "fairway";
    for (const d of h.deepRough ?? []) if (pointInPolygon(p, d)) return "deeprough";
    return "rough";
}

/** 홀 데이터 불변식 — 테스트가 모든 홀에 돌린다 */
export function validateHole(h: FieldHole): string[] {
    const errs: string[] = [];
    const [x0, y0, x1, y1] = h.bounds;
    const inside = (p: Vec2) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    if (!inside(h.tee)) errs.push("tee outside bounds");
    if (!inside(h.cup)) errs.push("cup outside bounds");
    if (surfaceAt(h, h.cup.x, h.cup.y) !== "green") errs.push("cup not on green");
    if (h.green.length < 3) errs.push("green polygon too small");
    if (!h.fairway.length) errs.push("no fairway");
    const s = surfaceAt(h, h.tee.x, h.tee.y);
    if (s !== "tee" && s !== "fairway") errs.push(`tee surface ${s}`);
    const dx = h.cup.x - h.tee.x, dy = h.cup.y - h.tee.y;
    const straight = Math.sqrt(dx * dx + dy * dy);
    if (h.lengthM < straight * 0.98) errs.push(`lengthM ${h.lengthM} shorter than straight ${straight.toFixed(0)}`);
    if (h.par === 3 && h.lengthM > 240) errs.push("par3 too long");
    if (h.par === 5 && h.lengthM < 400) errs.push("par5 too short");
    return errs;
}

/** 드라이빙 레인지 — 평지 페어웨이 한 판(테스트·연습장). 그린은 멀리(사용 안 함) */
export const RANGE: FieldHole = {
    id: "range", name: "드라이빙 레인지", par: 4, lengthM: 400, tee: { x: 0, y: 0 }, cup: { x: 0, y: 400 },
    bounds: [-150, -20, 150, 450],
    green: [{ x: -15, y: 385 }, { x: 15, y: 385 }, { x: 15, y: 415 }, { x: -15, y: 415 }],
    // 타석은 티 박스: 우드는 티 위(잔디 없음), 아이언은 잔디 위 모델. 매트 위 연습장과 같다
    teeBox: [{ x: -6, y: -6 }, { x: 6, y: -6 }, { x: 6, y: 6 }, { x: -6, y: 6 }],
    fairway: [[{ x: -150, y: -20 }, { x: 150, y: -20 }, { x: 150, y: 450 }, { x: -150, y: 450 }]],
    height: { slope: { x: 0, y: 0 }, bumps: [] },
};

/** 퍼팅 그린 한 판(테스트) — 반지름 30 m 그린, 컵 (0, 0) */
export function flatGreen(stimpDummy = 10, slope: Vec2 = { x: 0, y: 0 }): FieldHole {
    void stimpDummy;
    const g: Vec2[] = [];
    for (let i = 0; i < 24; i++) {
        // 초월함수 없이 24각형: 미리 계산한 단위원 좌표(cos/sin 15° 배수)
        const ang = UNIT_24[i];
        g.push({ x: ang[0] * 30, y: ang[1] * 30 });
    }
    return {
        id: "green", name: "연습 그린", par: 3, lengthM: 100, tee: { x: 0, y: -45 }, cup: { x: 0, y: 0 },
        bounds: [-60, -60, 60, 60], green: g, fairway: [[{ x: -60, y: -60 }, { x: 60, y: -60 }, { x: 60, y: 60 }, { x: -60, y: 60 }]],
        height: { slope, bumps: [] },
    };
}
const UNIT_24: readonly (readonly [number, number])[] = [
    [1, 0], [0.9659258262890683, 0.25881904510252074], [0.8660254037844387, 0.5], [0.7071067811865476, 0.7071067811865476],
    [0.5, 0.8660254037844387], [0.25881904510252074, 0.9659258262890683], [0, 1], [-0.25881904510252074, 0.9659258262890683],
    [-0.5, 0.8660254037844387], [-0.7071067811865476, 0.7071067811865476], [-0.8660254037844387, 0.5], [-0.9659258262890683, 0.25881904510252074],
    [-1, 0], [-0.9659258262890683, -0.25881904510252074], [-0.8660254037844387, -0.5], [-0.7071067811865476, -0.7071067811865476],
    [-0.5, -0.8660254037844387], [-0.25881904510252074, -0.9659258262890683], [0, -1], [0.25881904510252074, -0.9659258262890683],
    [0.5, -0.8660254037844387], [0.7071067811865476, -0.7071067811865476], [0.8660254037844387, -0.5], [0.9659258262890683, -0.25881904510252074],
];
