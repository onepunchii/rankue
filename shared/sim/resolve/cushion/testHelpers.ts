/**
 * 쿠션 모델 테스트 공용 도우미. 테스트 파일에서만 import 한다.
 * 초월함수 금지 규칙은 이 폴더 전체에 걸리므로 각도는 dmath 로 만든다.
 */
import type { BallState, CushionSegment, Vec3 } from "../../types";
import type { BallParams } from "../../params";
import { TABLES, cushionSegments } from "../../params";
import { atan2, cos, sin, PI } from "../../dmath";
import { kineticEnergy } from "../../evolve";

export const P: BallParams = TABLES.DAEDAE.ball;
export const R = P.R;
export const H = TABLES.DAEDAE.cushionHeight;
export const SEGS = cushionSegments(TABLES.DAEDAE);
export const LEFT = SEGS.find((s) => s.id === "left")!;

export function ball(v: Vec3, w: Vec3 = [0, 0, 0], id = "cue"): BallState {
    return { id, r: [R, 1.0, R], v, w, state: "sliding" };
}

/** 시드 PRNG (mulberry32). rng.ts 가 아직 없어 테스트 안에 둔다. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 법선에서 잰 입사각 α(rad, 양수는 세그먼트의 ŷ = (n_y, −n_x) 쪽으로 진행)와 속력으로 쿠션을 향하는 속도.
 * 진행 방향 = −n cos α + ŷ sin α.
 */
export function incidentVelocity(seg: CushionSegment, speed: number, alpha: number): Vec3 {
    const nx = seg.normal[0], ny = seg.normal[1];
    const c = cos(alpha), s = sin(alpha);
    return [speed * (-nx * c + ny * s), speed * (-ny * c - nx * s), 0];
}

/** 자연 구름 각속도 ω = (1/R) k̂ × v. */
export function rollingSpin(v: Vec3): Vec3 {
    return [-v[1] / R, v[0] / R, 0];
}

/** 법선 방향 속도 성분 v·n (음수 = 접근). */
export function normalComponent(v: Vec3, seg: CushionSegment): number {
    return v[0] * seg.normal[0] + v[1] * seg.normal[1];
}

/** 세그먼트 접선(ŷ = (n_y, −n_x)) 방향 속도 성분. */
export function tangentComponent(v: Vec3, seg: CushionSegment): number {
    return v[0] * seg.normal[1] - v[1] * seg.normal[0];
}

/** 법선에서 잰 각 (rad, 항상 0 이상). 입사·반사 모두 |v_n| 기준. */
export function angleFromNormal(v: Vec3, seg: CushionSegment): number {
    return Math.abs(atan2(tangentComponent(v, seg), Math.abs(normalComponent(v, seg))));
}

export function deg(rad: number): number {
    return (rad * 180) / PI;
}

export function rad(d: number): number {
    return (d * PI) / 180;
}

export function ke(b: BallState): number {
    return kineticEnergy(b, P);
}

/** 왼쪽 쿠션(법선 +x) 기준 y 거울상: v_y, ω_x, ω_z 부호 반전. */
export function mirrorY(b: BallState): BallState {
    return {
        ...b,
        v: [b.v[0], -b.v[1], b.v[2]],
        w: [-b.w[0], b.w[1], -b.w[2]],
    };
}

export function deepFreeze(b: BallState): BallState {
    Object.freeze(b.r); Object.freeze(b.v); Object.freeze(b.w);
    return Object.freeze(b);
}

export function expectVecClose(a: Vec3, b: Vec3, tol = 1e-9): void {
    for (let i = 0; i < 3; i++) {
        if (Math.abs(a[i] - b[i]) > tol) {
            throw new Error(`vec mismatch at ${i}: ${a.join(",")} vs ${b.join(",")}`);
        }
    }
}

/** 시드 고정 무작위 입사 상태 생성기. 4면 쿠션을 돌아가며, |v| 0.2–8, 입사각 ±89°, ω ±300. */
export function randomIncident(rng: () => number, i: number): { b: BallState; seg: CushionSegment } {
    const seg = SEGS[i % SEGS.length];
    const speed = 0.2 + 7.8 * rng();
    const alpha = rad(-89 + 178 * rng());
    const w: Vec3 = [600 * rng() - 300, 600 * rng() - 300, 600 * rng() - 300];
    return { b: ball(incidentVelocity(seg, speed, alpha), w), seg };
}
