/**
 * 미니골프 코스 자료형(2026-09-14 오너: "골프도 온라인게임 — A(미니골프) 먼저").
 *
 * 좌표는 홀마다 세로 화면 기준 논리 단위(가로 W=36, 세로 H=60). 화면이 실제 픽셀로 늘린다.
 * 페어웨이는 단순 다각형 하나, 장애물은 안쪽 다각형(블록)이나 원(범퍼). 벽은 다각형의 변이다 —
 * 물리는 "선분 목록 + 원 목록"만 본다(shared/golf/physics).
 */
export interface Vec { readonly x: number; readonly y: number }
export interface Segment { readonly a: Vec; readonly b: Vec }
export interface Circle { readonly c: Vec; readonly r: number }

export interface Hole {
    readonly id: string;
    readonly name: string;
    readonly par: number;
    readonly tee: Vec;
    readonly cup: Vec;
    /** 페어웨이 외곽(시계/반시계 무관, 단순 다각형) */
    readonly fairway: readonly Vec[];
    /** 안쪽 장애물 블록(다각형) — 벽으로 친다 */
    readonly blocks?: readonly (readonly Vec[])[];
    /** 원형 범퍼 */
    readonly bumpers?: readonly Circle[];
    /** 한 줄 힌트 */
    readonly hint?: string;
}

export interface Course { readonly id: string; readonly name: string; readonly holes: readonly Hole[] }

export const COURSE_W = 36;
export const COURSE_H = 60;
export const BALL_R = 0.6;
export const CUP_R = 1.0;

export const v = (x: number, y: number): Vec => ({ x, y });

/** 다각형 → 변 목록 */
export function polygonSegments(pts: readonly Vec[]): Segment[] {
    const out: Segment[] = [];
    for (let i = 0; i < pts.length; i++) out.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
    return out;
}

/** 홀의 벽 전부(외곽 + 블록) */
export function wallsOf(h: Hole): Segment[] {
    return [...polygonSegments(h.fairway), ...(h.blocks ?? []).flatMap(polygonSegments)];
}

/** 점이 다각형 안인가(짝홀 규칙) */
export function pointInPolygon(p: Vec, poly: readonly Vec[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const pi = poly[i], pj = poly[j];
        const hit = (pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
        if (hit) inside = !inside;
    }
    return inside;
}

/** 페어웨이 안이면서 블록·범퍼 밖인가 */
export function onFairway(p: Vec, h: Hole): boolean {
    if (!pointInPolygon(p, h.fairway)) return false;
    for (const b of h.blocks ?? []) if (pointInPolygon(p, b)) return false;
    for (const c of h.bumpers ?? []) if ((p.x - c.c.x) ** 2 + (p.y - c.c.y) ** 2 < c.r * c.r) return false;
    return true;
}

export function parLabel(strokes: number, par: number): string {
    if (strokes === 1) return "홀인원";
    const d = strokes - par;
    if (d <= -3) return "알바트로스";
    if (d === -2) return "이글";
    if (d === -1) return "버디";
    if (d === 0) return "파";
    if (d === 1) return "보기";
    if (d === 2) return "더블 보기";
    return `+${d}`;
}

/** 합계를 파 대비로 "-2" / "E" / "+3" */
export function toParLabel(strokes: number, par: number): string {
    const d = strokes - par;
    return d === 0 ? "E" : d > 0 ? `+${d}` : String(d);
}
