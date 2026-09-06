/**
 * Vec3 순수 함수. 모든 함수는 새 튜플을 만들어 돌려주고 인자는 건드리지 않는다(README 절대 규칙 2).
 * 초월함수는 쓰지 않는다 — 각도가 필요한 angleOf 만 dmath.atan2 를 쓴다(절대 규칙 1).
 */
import type { Vec3 } from "./types";
import { atan2 } from "./dmath";

export function add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 오른손 법칙 외적 a × b. */
export function cross(a: Vec3, b: Vec3): Vec3 {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

export function lengthSq(v: Vec3): number {
    return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

export function length(v: Vec3): number {
    return Math.sqrt(lengthSq(v));
}

/** 단위벡터. 영벡터면 [0, 0, 0] (NaN 을 만들지 않는다). */
export function unit(v: Vec3): Vec3 {
    const n = length(v);
    if (n === 0) return [0, 0, 0];
    return [v[0] / n, v[1] / n, v[2] / n];
}

export function negate(v: Vec3): Vec3 {
    return [-v[0], -v[1], -v[2]];
}

/** k̂ × v = (−v_y, v_x, 0). 위에서 봐서 v 를 반시계 90° 돌린 것. 구르는 공의 ω_xy = upCross(v)/R. */
export function upCross(v: Vec3): Vec3 {
    return [-v[1], v[0], 0];
}

/** 테이블 평면에서 v 가 향하는 각 (rad). +x 축이 0, 반시계 양수, (−π, π]. 영벡터면 0. 결정론을 위해 dmath.atan2. */
export function angleOf(v: Vec3): number {
    return atan2(v[1], v[0]);
}

/** a + (b − a)·t. t=0 이면 a, t=1 이면 b. */
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}
