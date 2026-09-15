/**
 * 공개 API — simulateStroke(pre, input, ctx). 발사 → 비행(착지까지) → 바운스 → 구름 → 컵/정지/물/OB.
 * 결과의 events + final 이 해시 대상. frames 는 120 Hz 위치(렌더용).
 */
import { atan } from "../../sim/dmath.js";
import { gradAt, heightAt, surfaceAt, type FieldHole, type Tree } from "./course.js";
import { stepAir, type MState } from "./flight.js";
import { bounce, cupCheck, stepRoll } from "./ground.js";
import { strokeHash } from "./hash.js";
import { launchFrom, type LieInfo } from "./impact.js";
import { EXPLOSION_IDEAL_TAPY } from "./clubs.js";
import { airDensityRatio, BALL_R, BOUNCE_TO_ROLL_VN, CUP_RH, DEG, greenRollDecel, K_AERO, MAX_AIR_STEPS, MAX_ROLL_STEPS, NO_CONDITIONS, stimpFor, SURFACE, surfaceParamsFor, type Conditions } from "./params.js";
import { gustSeedFor, NO_WIND } from "./wind.js";
import type { BallState3, Phase, Preset, StrokeEvent, StrokeInput, StrokeResult, Vec3, WindEnv } from "./types.js";

export interface StrokeContext {
    readonly hole: FieldHole;
    readonly env?: WindEnv;
    readonly preset: Preset;
    readonly stimp?: number;
    readonly strokeIdx?: number;
    readonly roomSeed?: number;
    /** 고도·기온·단단함·젖음(방 옵션). 없으면 해면 15 °C·보통 */
    readonly conditions?: Conditions;
}

const TRUNK_R_DEFAULT = 0.25;
const TREE_CANOPY_E = 0.2, TREE_CANOPY_KEEP = 0.35, TREE_TRUNK_E = 0.5, TREE_TRUNK_KEEP = 0.5;

/**
 * 나무 충돌(결정론). 캐노피 구 안에 들어오면 표면 법선으로 되튀고 속도 35 %·스핀 30 % 만 남는다(잎이 먹는다),
 * 둥치는 수평 반사 50 %. 부딪혔으면 true. 굴러가는 공은 둥치만 본다
 */
function treeHit(s: MState, trees: readonly Tree[], rolling: boolean): boolean {
    for (const t of trees) {
        const dx = s.px - t.c.x, dy = s.py - t.c.y;
        const d2 = dx * dx + dy * dy;
        const reach = t.r + 1;
        if (d2 > reach * reach) continue;
        const zc = t.h - t.r;
        const trunkR = t.trunkR ?? TRUNK_R_DEFAULT;
        if (!rolling) {
            const dz = s.pz - zc;
            const r2 = d2 + dz * dz;
            if (r2 < t.r * t.r) {
                const rl = Math.sqrt(Math.max(1e-9, r2));
                const nx = dx / rl, ny = dy / rl, nz = dz / rl;
                const vn = s.vx * nx + s.vy * ny + s.vz * nz;
                if (vn < 0) { s.vx -= (1 + TREE_CANOPY_E) * vn * nx; s.vy -= (1 + TREE_CANOPY_E) * vn * ny; s.vz -= (1 + TREE_CANOPY_E) * vn * nz; }
                s.vx *= TREE_CANOPY_KEEP; s.vy *= TREE_CANOPY_KEEP; s.vz *= TREE_CANOPY_KEEP;
                s.wx *= 0.3; s.wy *= 0.3; s.wz *= 0.3;
                s.px = t.c.x + nx * (t.r + 0.01); s.py = t.c.y + ny * (t.r + 0.01); s.pz = zc + nz * (t.r + 0.01);
                return true;
            }
        }
        if (d2 < trunkR * trunkR && s.pz < zc) {
            const dl = Math.sqrt(Math.max(1e-9, d2));
            const nx = dx / dl, ny = dy / dl;
            const vn = s.vx * nx + s.vy * ny;
            if (vn < 0) { s.vx -= (1 + TREE_TRUNK_E) * vn * nx; s.vy -= (1 + TREE_TRUNK_E) * vn * ny; }
            s.vx *= TREE_TRUNK_KEEP; s.vy *= TREE_TRUNK_KEEP; if (!rolling) s.vz *= TREE_TRUNK_KEEP;
            s.px = t.c.x + nx * (trunkR + 0.01); s.py = t.c.y + ny * (trunkR + 0.01);
            return true;
        }
    }
    return false;
}

function snapshot(s: MState, phase: Phase): BallState3 {
    return { p: { x: s.px, y: s.py, z: s.pz }, v: { x: s.vx, y: s.vy, z: s.vz }, w: { x: s.wx, y: s.wy, z: s.wz }, phase, t: s.t };
}
function ev(kind: StrokeEvent["kind"], s: MState): StrokeEvent {
    return { kind, t: s.t, p: { x: s.px, y: s.py, z: s.pz }, speed: Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) };
}

/** 공 위치의 라이(지면 종류 + 조준 방향 경사) */
export function lieAt(hole: FieldHole, x: number, y: number, aimDeg: number, seed: number): LieInfo {
    const surface = surfaceAt(hole, x, y);
    const g = gradAt(hole, x, y);
    // 조준 방향 단위벡터 (sinφ, cosφ) — 여기서만 초월함수 대신 소각 근사를 피하려고 dmath 를 쓴다
    const phi = aimDeg * DEG;
    const dirx = sinApprox(phi), diry = cosApprox(phi);
    const along = g.x * dirx + g.y * diry;
    const side = g.x * diry - g.y * dirx;   // 오른쪽 방향 성분(+ = 오른쪽이 높다 = 공이 발 아래 → 우타는 페이드) → 부호 반전해 '발 위' 를 +
    return { surface, slopeAlongDeg: atan(along) / DEG, slopeSideDeg: -atan(side) / DEG, seed };
}
// 라이 계산의 sin/cos — dmath 로(발사 순간 1회)
import { cos as dcos, sin as dsin } from "../../sim/dmath.js";
function sinApprox(x: number): number { return dsin(x); }
function cosApprox(x: number): number { return dcos(x); }

export function simulateStroke(pre: Vec3, input: StrokeInput, ctx: StrokeContext): StrokeResult {
    const hole = ctx.hole;
    const env = ctx.env ?? NO_WIND;
    const hasWind = env.w10.x !== 0 || env.w10.y !== 0;
    const seed = gustSeedFor(ctx.roomSeed ?? 0, 0, ctx.strokeIdx ?? 0);
    const aimDeg = input.aimDeg10 / 10;
    const lie = lieAt(hole, pre.x, pre.y, aimDeg, seed);
    const launch = launchFrom(input, { preset: ctx.preset, lie, aimDeg });
    const cond = ctx.conditions ?? NO_CONDITIONS;
    const stimp = stimpFor(ctx.stimp ?? 10, cond);
    const kAero = K_AERO * airDensityRatio(cond);
    const trees = hole.trees ?? [];

    const s: MState = {
        px: pre.x, py: pre.y, pz: heightAt(hole, pre.x, pre.y) + BALL_R,
        vx: launch.v.x, vy: launch.v.y, vz: launch.v.z, wx: launch.w.x, wy: launch.w.y, wz: launch.w.z, t: 0,
    };
    const x0 = s.px, y0 = s.py;
    const events: StrokeEvent[] = [ev("launch", s)];
    const frames: number[] = [s.px, s.py, s.pz];
    let phase: Phase = launch.startPhase;
    let apexM = 0, airTime = 0, carryM = 0, truncated = false;
    let steps = 0;

    // ── 비행 + 바운스 ──
    let landed = false;
    while (phase === "air") {
        const prevZ = s.pz, prevX = s.px, prevY = s.py, prevVz = s.vz;
        stepAir(s, env, hasWind, kAero);
        if (trees.length && treeHit(s, trees, false)) events.push(ev("tree", s));
        frames.push(s.px, s.py, s.pz);
        if (prevVz > 0 && s.vz <= 0 && !landed) { apexM = Math.max(apexM, s.pz - heightAt(hole, s.px, s.py)); events.push(ev("apex", s)); }
        const ground = heightAt(hole, s.px, s.py) + BALL_R;
        if (s.pz <= ground && s.vz < 0) {
            // 접촉 시각을 스텝 안에서 선형 보간
            const g0 = heightAt(hole, prevX, prevY) + BALL_R;
            const a = prevZ - g0, b = s.pz - ground;
            const f = a - b > 1e-9 ? a / (a - b) : 1;
            s.px = prevX + (s.px - prevX) * f; s.py = prevY + (s.py - prevY) * f; s.pz = ground;
            const surf = surfaceAt(hole, s.px, s.py);
            if (!landed) { landed = true; airTime = s.t; const dx = s.px - x0, dy = s.py - y0; carryM = Math.sqrt(dx * dx + dy * dy); events.push(ev("land", s)); }
            else events.push(ev("bounce", s));
            if (surf === "water") { phase = "water"; events.push(ev("water", s)); break; }
            if (surf === "ob") { phase = "ob"; events.push(ev("ob", s)); break; }
            const sp = surfaceParamsFor(SURFACE[surf], cond);
            const { bounceUp } = bounce(s, sp, gradAt(hole, s.px, s.py));
            if (bounceUp < BOUNCE_TO_ROLL_VN) { s.vz = 0; phase = "roll"; events.push(ev("roll", s)); }
        }
        if (++steps > MAX_AIR_STEPS) { truncated = true; phase = "rest"; break; }
    }

    // ── 구름 ──
    let rollSteps = 0;
    let lipCooldown = 0;
    while (phase === "roll") {
        const surf = surfaceAt(hole, s.px, s.py);
        if (surf === "water") { phase = "water"; events.push(ev("water", s)); break; }
        if (surf === "ob") { phase = "ob"; events.push(ev("ob", s)); break; }
        const aRoll = surf === "green" ? greenRollDecel(stimp) : surfaceParamsFor(SURFACE[surf], cond).aRoll;
        const grad = gradAt(hole, s.px, s.py);
        const stopped = stepRoll(s, aRoll, grad, heightAt(hole, s.px, s.py));
        if (trees.length && treeHit(s, trees, true)) events.push(ev("tree", s));
        frames.push(s.px, s.py, s.pz);
        if (surf === "green" || surf === "fringe") {
            const dx = s.px - hole.cup.x, dy = s.py - hole.cup.y;
            if (dx * dx + dy * dy < (CUP_RH + 0.05) * (CUP_RH + 0.05) && lipCooldown === 0) {
                const r = cupCheck(s, hole.cup);
                if (r === "holed") { phase = "holed"; events.push(ev("holed", s)); break; }
                if (r === "lip") { events.push(ev("lip", s)); lipCooldown = 12; }
            }
        }
        if (lipCooldown > 0) lipCooldown--;
        if (stopped) { phase = "rest"; events.push(ev("rest", s)); break; }
        if (++rollSteps > MAX_ROLL_STEPS) { truncated = true; phase = "rest"; events.push(ev("rest", s)); break; }
    }
    if (phase === "rest" && events[events.length - 1].kind !== "rest") events.push(ev("rest", s));

    const final = snapshot(s, phase);
    const dx = s.px - x0, dy = s.py - y0;
    return {
        events, final, frames: Float32Array.from(frames), hash: strokeHash(events, final), diag: launch.diag,
        carryM: landed ? carryM : 0, totalM: Math.sqrt(dx * dx + dy * dy), apexM, airTime, truncated,
    };
}

/** '퍼펙트였다면' — 같은 스탠스·파워·볼포지션에 타이밍·흘림·타점 0, 컨택은 모드의 이상값(익스플로전은 모래 진입) */
export function perfectInput(input: StrokeInput): StrokeInput {
    return { ...input, impactMs: 0, padX: 0, tapX: 0, tapY: input.mode === 2 ? EXPLOSION_IDEAL_TAPY : 0 };
}
