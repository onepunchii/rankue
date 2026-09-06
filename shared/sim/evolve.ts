/**
 * evolve.ts — 이벤트 사이의 공 운동을 닫힌 식으로 전진시킨다.
 *
 * 출처: Leckie & Greenspan 2005/2006, Alciatore TP A.4 / A.16,
 *       pooltool <pooltool/physics/evolve/__init__.py>, <pooltool/physics/utils.py>,
 *       <pooltool/evolution/event_based/detect/ball_position_polynomial.py> (Apache-2.0, NOTICE.md).
 *
 * 물리 요약 (모두 테이블 프레임, z 는 항상 R 로 고정)
 *  - 접점 미끄럼 속도 u = v + ω × (−R k̂) = (v_x − R ω_y, v_y + R ω_x, 0).
 *  - 미끄럼(sliding): 천이 접점에 −μ_s m g û 의 마찰력을 준다. TP A.4 식 (10) 이 보이듯
 *    du/dt = −(7/2) μ_s g û 라서 미끄럼 방향 û 는 시간이 지나도 돌지 않는다. 따라서
 *      r(t) = r0 + v0 t − ½ μ_s g t² û0,   v(t) = v0 − μ_s g t û0,
 *      ω_xy(t) = ω_xy0 + (5 μ_s g)/(2R) t (k̂ × û0)   ← 토크 (−R k̂) × (−μ m g û) = μ m g R (k̂ × û)
 *    미끄럼이 끝나는 시각 t_s = (2/7)|u0|/(μ_s g). 그 순간 v = (5/7) v0 + (2/7) ω0 × (R k̂) 로 μ_s 와 무관(TP A.4 식 24).
 *  - 구름(rolling): u = 0 을 유지하며 v(t) = v0 − μ_r g t v̂0, ω_xy = (1/R) k̂ × v. 정지 시각 t_r = |v0|/(μ_r g),
 *    정지 거리 |v0|²/(2 μ_r g) (TP A.16).
 *  - 수직축 스핀 ω_z 는 어느 상태에서든 독립적으로 spinDecel(rad/s²) 만큼 0 을 향해 선형 감소하고 0 에서 멈춘다.
 *    pooltool 은 μ_sp 계수로 α = 5 μ_sp g/(2R) 를 만들지만, 우리는 params.ts 의 spinDecel 을 α 로 바로 쓴다.
 *  - 스핀(spinning): 위치·속도 불변, ω_z 만 감소. 정지(stationary): 아무것도 변하지 않는다.
 *
 * 이 모듈은 상태 전이를 하지 않는다. 호출자(simulate.ts)는 nextTransition 이 돌려준 시각까지만 evolveBall 을
 * 부르고, 전이 자체는 resolve/transition.ts 의 applyTransition 이 맡는다. 전이 시각을 넘겨 부르면 식이 그대로
 * 외삽되어(예: 구름 공 속도가 음수로 뒤집힘) 물리적으로 무의미하다 — 계약서(README) 대로 호출자가 지킨다.
 *
 * 초월함수는 전혀 필요 없다: 단위벡터는 sqrt 로만 만든다.
 */
import type { BallState, EventCandidate, Vec3 } from "./types";
import type { BallParams } from "./params";

// ---------------------------------------------------------------------------
// 최소 벡터 도우미. vec.ts 가 생기면 그쪽으로 import 를 바꾼다(같은 이름·같은 의미).
// ---------------------------------------------------------------------------

function add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s];
}

function dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v: Vec3): number {
    return Math.sqrt(dot(v, v));
}

/** 단위벡터. 영벡터면 [0, 0, 0]. */
function unit(v: Vec3): Vec3 {
    const n = length(v);
    if (n === 0) return [0, 0, 0];
    return [v[0] / n, v[1] / n, v[2] / n];
}

/** k̂ × v = (−v_y, v_x, 0). 위에서 봐서 v 를 반시계 90° 돌린 것. */
function upCross(v: Vec3): Vec3 {
    return [-v[1], v[0], 0];
}

// ---------------------------------------------------------------------------
// 접점 미끄럼 속도
// ---------------------------------------------------------------------------

/**
 * 공–천 접점의 천에 대한 상대속도 u = v + ω × (−R k̂). 미끄럼 상태에서만 0 이 아니다.
 * z 성분은 정의상 0 이다(접점은 수직으로 움직이지 않는다).
 */
export function slipVelocity(b: BallState, p: BallParams): Vec3 {
    const R = p.R;
    return [b.v[0] - R * b.w[1], b.v[1] + R * b.w[0], 0];
}

// ---------------------------------------------------------------------------
// ω_z 감쇠 (모든 상태 공통)
// ---------------------------------------------------------------------------

/**
 * 수직축 스핀을 t 초 동안 감쇠시킨다. 부호를 유지하며 0 을 향해 spinDecel 로 선형 감소하고,
 * 0 에 닿으면 정확히 0 을 돌려준다(부동소수점 잔차로 부호가 뒤집히는 일이 없도록 분기로 처리).
 */
function decaySpinZ(wz: number, t: number, p: BallParams): number {
    if (t <= 0 || wz === 0) return wz;
    const alpha = p.spinDecel;
    if (!(alpha > 0)) return wz;               // 감쇠 없음(0 이나 NaN 방어)
    const mag = Math.abs(wz);
    if (t >= mag / alpha) return 0;            // 0 을 지나칠 수 없다
    return wz > 0 ? wz - alpha * t : wz + alpha * t;
}

// ---------------------------------------------------------------------------
// 상태별 전진
// ---------------------------------------------------------------------------

function evolveSliding(b: BallState, t: number, p: BallParams): BallState {
    const mu_g = p.muS * p.g;
    const uHat = unit(slipVelocity(b, p));
    // r = r0 + v0 t − ½ μ_s g t² û0
    const r = add(add(b.r, scale(b.v, t)), scale(uHat, -0.5 * mu_g * t * t));
    // v = v0 − μ_s g t û0
    const v = add(b.v, scale(uHat, -mu_g * t));
    // ω_xy = ω_xy0 + (5 μ_s g)/(2R) t (k̂ × û0)   (마찰 토크 방향, 위 파일 머리 주석 참고)
    const dw = scale(upCross(uHat), (5 * mu_g * t) / (2 * p.R));
    const w: Vec3 = [b.w[0] + dw[0], b.w[1] + dw[1], decaySpinZ(b.w[2], t, p)];
    return { id: b.id, r: [r[0], r[1], p.R], v: [v[0], v[1], 0], w, state: b.state };
}

function evolveRolling(b: BallState, t: number, p: BallParams): BallState {
    const mu_g = p.muR * p.g;
    const vHat = unit(b.v);
    // r = r0 + v0 t − ½ μ_r g t² v̂0
    const r = add(add(b.r, scale(b.v, t)), scale(vHat, -0.5 * mu_g * t * t));
    // v = v0 − μ_r g t v̂0
    const v = add(b.v, scale(vHat, -mu_g * t));
    // 구름 조건: ω_xy = (1/R) k̂ × v
    const wxy = scale(upCross(v), 1 / p.R);
    const w: Vec3 = [wxy[0], wxy[1], decaySpinZ(b.w[2], t, p)];
    return { id: b.id, r: [r[0], r[1], p.R], v: [v[0], v[1], 0], w, state: b.state };
}

function evolveSpinning(b: BallState, t: number, p: BallParams): BallState {
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v: [b.v[0], b.v[1], b.v[2]],
        w: [b.w[0], b.w[1], decaySpinZ(b.w[2], t, p)],
        state: b.state,
    };
}

function copyBall(b: BallState): BallState {
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v: [b.v[0], b.v[1], b.v[2]],
        w: [b.w[0], b.w[1], b.w[2]],
        state: b.state,
    };
}

/**
 * 현재 운동 상태의 닫힌 식으로 dt 초만큼 전진한 새 BallState 를 돌려준다. 상태 전이는 하지 않는다
 * (state 필드는 입력 그대로). 입력은 절대 변형하지 않으며, 반환값의 튜플은 모두 새 배열이다.
 * airborne 은 v2.0 에서 지원하지 않으므로 stationary 처럼 그대로 복사한다.
 */
export function evolveBall(b: BallState, dt: number, p: BallParams): BallState {
    if (dt === 0 || b.state === "stationary" || b.state === "airborne") return copyBall(b);
    switch (b.state) {
        case "sliding": return evolveSliding(b, dt, p);
        case "rolling": return evolveRolling(b, dt, p);
        case "spinning": return evolveSpinning(b, dt, p);
        default: return copyBall(b);
    }
}

// ---------------------------------------------------------------------------
// 전이 시각
// ---------------------------------------------------------------------------

/** 미끄럼 → 구름까지 남은 시간 t_s = (2/7)|u0|/(μ_s g). 미끄럼 상태가 아니거나 μ_s g = 0 이면 Infinity. */
export function slideTime(b: BallState, p: BallParams): number {
    if (b.state !== "sliding") return Infinity;
    const mu_g = p.muS * p.g;
    if (!(mu_g > 0)) return Infinity;
    return (2 * length(slipVelocity(b, p))) / (7 * mu_g);
}

/** 구름 → 정지(또는 스핀)까지 남은 시간 t_r = |v0|/(μ_r g). 구름 상태가 아니거나 μ_r g = 0 이면 Infinity. */
export function rollTime(b: BallState, p: BallParams): number {
    if (b.state !== "rolling") return Infinity;
    const mu_g = p.muR * p.g;
    if (!(mu_g > 0)) return Infinity;
    return length(b.v) / mu_g;
}

/** 스핀 → 정지까지 남은 시간 |ω_z|/spinDecel. 스핀 상태가 아니거나 spinDecel = 0 이면 Infinity. */
export function spinTime(b: BallState, p: BallParams): number {
    if (b.state !== "spinning") return Infinity;
    if (!(p.spinDecel > 0)) return Infinity;
    return Math.abs(b.w[2]) / p.spinDecel;
}

/**
 * 이 공의 다음 상태 전이 후보. 전이가 없으면(정지·airborne·마찰 0) null.
 *  - sliding → rolling (t_s)
 *  - rolling → spinning (구름이 끝난 순간 ω_z 가 남아 있으면) / stationary (아니면)
 *  - spinning → stationary
 * event.t 는 절대 시각이 아니라 dt 와 같은 지연값이다(이 함수는 현재 시각을 모른다). 호출자가 더한다.
 */
export function nextTransition(b: BallState, p: BallParams): EventCandidate | null {
    if (b.state === "sliding") {
        const dt = slideTime(b, p);
        if (!Number.isFinite(dt)) return null;
        return { dt, event: { type: "transition", t: dt, ids: [b.id], from: "sliding", to: "rolling" } };
    }
    if (b.state === "rolling") {
        const dt = rollTime(b, p);
        if (!Number.isFinite(dt)) return null;
        const wzAfter = decaySpinZ(b.w[2], dt, p);
        const to = wzAfter !== 0 ? "spinning" : "stationary";
        return { dt, event: { type: "transition", t: dt, ids: [b.id], from: "rolling", to } };
    }
    if (b.state === "spinning") {
        const dt = spinTime(b, p);
        if (!Number.isFinite(dt)) return null;
        return { dt, event: { type: "transition", t: dt, ids: [b.id], from: "spinning", to: "stationary" } };
    }
    return null;
}

// ---------------------------------------------------------------------------
// 위치 다항식·에너지
// ---------------------------------------------------------------------------

/**
 * 현재 상태에서의 위치 다항식 r(t) = r0 + r1 t + r2 t². r2 는 가속도의 절반이다.
 * pooltool <pooltool/evolution/event_based/detect/ball_position_polynomial.py>
 *  - sliding: r2 = −½ μ_s g û0,  rolling: r2 = −½ μ_r g v̂0,  spinning·stationary: r2 = 0.
 * 이벤트 감지기(detect/*)가 이 계수로 볼–볼(4차)·볼–쿠션(2차) 방정식을 세운다.
 */
export function positionPolynomial(b: BallState, p: BallParams): { r0: Vec3; r1: Vec3; r2: Vec3 } {
    const r0: Vec3 = [b.r[0], b.r[1], b.r[2]];
    const r1: Vec3 = [b.v[0], b.v[1], b.v[2]];
    let r2: Vec3;
    if (b.state === "sliding") {
        r2 = scale(unit(slipVelocity(b, p)), -0.5 * p.muS * p.g);
    } else if (b.state === "rolling") {
        r2 = scale(unit(b.v), -0.5 * p.muR * p.g);
    } else {
        r2 = [0, 0, 0];
    }
    return { r0, r1, r2 };
}

/** 운동에너지 ½ m |v|² + ½ I |ω|², I = (2/5) m R². */
export function kineticEnergy(b: BallState, p: BallParams): number {
    const I = 0.4 * p.m * p.R * p.R;
    return 0.5 * p.m * dot(b.v, b.v) + 0.5 * I * dot(b.w, b.w);
}
