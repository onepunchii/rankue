/**
 * 공개 API — simulateStroke(pre, input, ctx). 발사 → 비행(착지까지) → 바운스 → 구름 → 컵/정지/물/OB.
 * 결과의 events + final 이 해시 대상. frames 는 120 Hz 위치(렌더용).
 */
import { atan } from "../../sim/dmath.js";
import { gradAt, heightAt, surfaceAt, type FieldHole } from "./course.js";
import { stepAir, type MState } from "./flight.js";
import { bounce, cupCheck, stepRoll } from "./ground.js";
import { strokeHash } from "./hash.js";
import { launchFrom, type LieInfo } from "./impact.js";
import { BALL_R, BOUNCE_TO_ROLL_VN, CUP_RH, DEG, greenRollDecel, MAX_AIR_STEPS, MAX_ROLL_STEPS, SURFACE } from "./params.js";
import { gustSeedFor, NO_WIND } from "./wind.js";
import type { BallState3, Phase, Preset, StrokeEvent, StrokeInput, StrokeResult, Vec3, WindEnv } from "./types.js";

export interface StrokeContext {
    readonly hole: FieldHole;
    readonly env?: WindEnv;
    readonly preset: Preset;
    readonly stimp?: number;
    readonly strokeIdx?: number;
    readonly roomSeed?: number;
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
    const stimp = ctx.stimp ?? 10;

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
        stepAir(s, env, hasWind);
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
            const sp = SURFACE[surf];
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
        const aRoll = surf === "green" ? greenRollDecel(stimp) : SURFACE[surf].aRoll;
        const grad = gradAt(hole, s.px, s.py);
        const stopped = stepRoll(s, aRoll, grad, heightAt(hole, s.px, s.py));
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

/** '퍼펙트였다면' — 같은 입력에 타이밍·흘림·타점 0 */
export function perfectInput(input: StrokeInput): StrokeInput {
    return { ...input, impactMs: 0, padX: 0, tapX: 0 };
}
