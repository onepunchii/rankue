/**
 * 미니골프 공 물리(2026-09-14). 고정 스텝(1/120 s), 구름 마찰, 벽(선분)·범퍼(원) 반사, 컵 포획, OB 복귀.
 * 사람끼리 공이 부딪히지 않으므로 각자 자기 공만 돌리고 서버는 타수만 모은다 — 당구 대전보다 훨씬 가볍다.
 * 난수·시각을 쓰지 않는다(같은 입력이면 같은 결과 — 나중에 리플레이·고스트 공에 쓴다).
 */
import { BALL_R, CUP_R, COURSE_H, COURSE_W, wallsOf, type Circle, type Hole, type Segment, type Vec } from "./course.js";

export const DT = 1 / 120;
/** 구름 감속(단위/s²). 잔디 위 공이 40 단위/s 로 출발하면 약 2.2초 뒤에 선다 */
export const FRICTION = 18;
export const STOP_SPEED = 0.35;
export const MAX_POWER = 42;          // 최대 발사 속도(단위/s)
export const MAX_DRAG = 14;           // 이만큼 당기면 최대 파워
export const WALL_E = 0.72;           // 벽 반발
export const BUMPER_E = 0.95;         // 범퍼 반발(더 튄다)
export const CUP_CAPTURE_SPEED = 13;  // 이보다 빠르면 컵을 지나친다(립아웃)
export const MAX_STROKES = 8;         // 여기 닿으면 강제 마감(+1)

export interface BallState {
    x: number; y: number; vx: number; vy: number;
    moving: boolean;
    inCup: boolean;
    /** 마지막으로 멈춘 자리(OB 복귀점) */
    restX: number; restY: number;
}

export interface StepEvent { readonly kind: "wall" | "bumper" | "cup" | "ob" | "stop"; readonly speed: number }

export function initBall(h: Hole): BallState {
    return { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0, moving: false, inCup: false, restX: h.tee.x, restY: h.tee.y };
}

/** 당김 벡터(공 → 손가락 방향의 반대로 나간다) → 발사 */
export function shoot(b: BallState, dragX: number, dragY: number): BallState {
    const len = Math.hypot(dragX, dragY);
    if (len < 0.3 || b.moving || b.inCup) return b;
    const power = Math.min(1, len / MAX_DRAG) * MAX_POWER;
    return { ...b, vx: (-dragX / len) * power, vy: (-dragY / len) * power, moving: true };
}

export function powerRatio(dragX: number, dragY: number): number {
    return Math.min(1, Math.hypot(dragX, dragY) / MAX_DRAG);
}

function reflectSegment(b: BallState, s: Segment, e: number): boolean {
    const abx = s.b.x - s.a.x, aby = s.b.y - s.a.y;
    const len2 = abx * abx + aby * aby || 1e-9;
    let t = ((b.x - s.a.x) * abx + (b.y - s.a.y) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.a.x + abx * t, py = s.a.y + aby * t;
    let nx = b.x - px, ny = b.y - py;
    const d = Math.hypot(nx, ny);
    if (d >= BALL_R) return false;
    if (d < 1e-6) { nx = -aby; ny = abx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; } else { nx /= d; ny /= d; }
    const vn = b.vx * nx + b.vy * ny;
    // 밀어내기(겹침 해소)
    const push = BALL_R - d + 1e-4;
    b.x += nx * push; b.y += ny * push;
    if (vn >= 0) return false;   // 이미 멀어지는 중
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    return true;
}

function reflectCircle(b: BallState, c: Circle, e: number): boolean {
    let nx = b.x - c.c.x, ny = b.y - c.c.y;
    const d = Math.hypot(nx, ny);
    const minD = c.r + BALL_R;
    if (d >= minD) return false;
    if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
    const push = minD - d + 1e-4;
    b.x += nx * push; b.y += ny * push;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return false;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    return true;
}

/**
 * 한 스텝. 반환은 이번 스텝에 일어난 일(소리·연출용). 컵에 들어가면 moving=false, inCup=true.
 * OB(코스 밖)는 마지막 멈춘 자리로 되돌리고 'ob' 를 알린다(타수 +1 은 게임 층이 한다).
 */
export function step(b: BallState, h: Hole, walls: readonly Segment[] = wallsOf(h)): StepEvent[] {
    const ev: StepEvent[] = [];
    if (!b.moving || b.inCup) return ev;
    const speed0 = Math.hypot(b.vx, b.vy);
    // 이동(빠를 때 터널링을 막기 위해 잘게)
    const sub = speed0 * DT > BALL_R * 0.5 ? 3 : 1;
    const dt = DT / sub;
    for (let i = 0; i < sub; i++) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        for (const s of walls) if (reflectSegment(b, s, WALL_E)) ev.push({ kind: "wall", speed: Math.hypot(b.vx, b.vy) });
        for (const c of h.bumpers ?? []) if (reflectCircle(b, c, BUMPER_E)) ev.push({ kind: "bumper", speed: Math.hypot(b.vx, b.vy) });
        // 컵
        const dc = Math.hypot(b.x - h.cup.x, b.y - h.cup.y);
        const sp = Math.hypot(b.vx, b.vy);
        if (dc < CUP_R * 0.9 && sp < CUP_CAPTURE_SPEED) {
            b.x = h.cup.x; b.y = h.cup.y; b.vx = 0; b.vy = 0; b.moving = false; b.inCup = true;
            ev.push({ kind: "cup", speed: sp });
            return ev;
        }
    }
    // 마찰
    const speed = Math.hypot(b.vx, b.vy);
    const ns = Math.max(0, speed - FRICTION * DT);
    if (ns <= STOP_SPEED) {
        b.vx = 0; b.vy = 0; b.moving = false;
        // 멈춘 자리가 코스 밖이면 OB
        if (b.x < 0 || b.y < 0 || b.x > COURSE_W || b.y > COURSE_H) {
            b.x = b.restX; b.y = b.restY; ev.push({ kind: "ob", speed: 0 });
        } else {
            b.restX = b.x; b.restY = b.y; ev.push({ kind: "stop", speed: 0 });
        }
        return ev;
    }
    b.vx *= ns / speed; b.vy *= ns / speed;
    // 코스 밖으로 튀어나갔으면(벽 사이로 새어 나간 경우) 즉시 OB
    if (b.x < -2 || b.y < -2 || b.x > COURSE_W + 2 || b.y > COURSE_H + 2) {
        b.x = b.restX; b.y = b.restY; b.vx = 0; b.vy = 0; b.moving = false; ev.push({ kind: "ob", speed: 0 });
    }
    return ev;
}

/** 샷 미리보기 — 같은 물리로 앞을 돌려 점 자취를 만든다(벽 반사까지). 최대 maxSteps 스텝, 매 stride 스텝마다 점 하나 */
export function predictPath(b: BallState, h: Hole, dragX: number, dragY: number, maxSteps = 240, stride = 6): Vec[] {
    const sim = shoot({ ...b }, dragX, dragY);
    if (!sim.moving) return [];
    const walls = wallsOf(h);
    const pts: Vec[] = [];
    for (let i = 0; i < maxSteps && sim.moving; i++) {
        step(sim, h, walls);
        if (i % stride === 0) pts.push({ x: sim.x, y: sim.y });
    }
    return pts;
}

/** 멈출 때까지 전부 돌린다(테스트·AI용). 최대 30초 */
export function runToRest(b: BallState, h: Hole): { events: StepEvent[]; steps: number } {
    const walls = wallsOf(h);
    const events: StepEvent[] = [];
    let steps = 0;
    while (b.moving && steps < 30 * 120) { events.push(...step(b, h, walls)); steps++; }
    return { events, steps };
}
