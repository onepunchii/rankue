/**
 * resolve/ballBall.ts — 공–공 충돌 해석 (마찰 비탄성, 질량 동일).
 *
 * 출처: pooltool `pooltool/physics/resolve/ball_ball/frictional_inelastic/__init__.py` (FrictionalInelastic2D)
 *       + `pooltool/physics/resolve/ball_ball/friction.py` (AlciatoreBallBallFriction), Apache-2.0, NOTICE.md.
 *       원리는 Alciatore TP A.5 / A.6 / A.14 (두 공 모두 움직이는 경우로 벡터 일반화).
 *
 * 물리 요약 — 접촉 순간 두 공 사이에 작용하는 임펄스를 법선·접선으로 나눈다.
 *  1. 법선(중심선 n̂ 방향): 질량이 같으므로 반발 계수 e 로 바로 닫힌다.
 *       v1n' = ½((1−e)·v1n + (1+e)·v2n),  v2n' = ½((1+e)·v1n + (1−e)·v2n)
 *     ω 의 법선 성분(n̂ 축 스핀)은 마찰 토크가 n̂ 에 수직이므로 변하지 않는다.
 *  2. 접선(접평면): 접점에서의 두 공 표면 상대속도 v_c = (v1−v2)_t + R(ω1+ω2)×n̂ 방향으로 Coulomb 마찰이 작용한다.
 *     임펄스 크기는 두 상한 중 작은 쪽 —
 *       (i)  미끄럼(slip): μ·|ΔV_n|,  방향 −v̂_c            (마찰 임펄스 ≤ μ × 법선 임펄스)
 *       (ii) 무슬립(stick): |v_c|/7,   ΔV1_t = −v_c/7        (접점 상대속도가 0 이 되는 순간 마찰이 멈춘다)
 *     pooltool 방식대로 (i) 를 먼저 적용해 보고, 그 결과 접점 상대속도의 방향이 뒤집혔으면(v_c·v_c' ≤ 0) (ii) 로 바꾼다.
 *  3. 스핀: 임펄스가 접점(중심에서 R·n̂)에 걸리므로 Δω = (R n̂ × m ΔV_t)/I = (2.5/R)·n̂ × ΔV_t.
 *     공 2 는 접점이 −R n̂ 이고 임펄스도 −ΔV_t 라 토크 부호가 같다 → 두 공에 같은 Δω 를 더한다.
 *  4. v2.0 은 평면 운동만 다루므로 결과 속도의 z 성분을 버리고 두 공 모두 'sliding' 으로 둔다
 *     (구름 조건이 깨졌는지는 다음 전이 판정이 결정한다).
 *
 * pooltool 은 n̂ 이 +x 가 되도록 쿼터니언으로 프레임을 돌린 뒤 성분 계산을 하지만, 여기서는 같은 식을
 * 벡터 형태로 직접 쓴다(회전 두 번의 반올림이 빠지고 초월함수도 필요 없다). 결정론을 위해 마찰 계수의
 * exp 만 dmath 를 쓴다.
 */
import type { BallState, Vec3 } from "../types.js";
import type { BallParams } from "../params.js";
import { add, cross, dot, length, scale, sub, unit } from "../vec.js";
import { exp } from "../dmath.js";

/** pooltool `const.EPS` = 100 × DBL_EPSILON. 이보다 작은 접점 상대속도는 0 으로 본다. */
const EPS = 100 * 2.220446049250313e-16;

/**
 * 공–공 마찰 계수 μ(v_rel) = a + b·exp(−c·v_rel). Alciatore TP A.14 의 Marlow 데이터 피팅
 * (pooltool AlciatoreBallBallFriction 수렴값 a=9.951e-3, b=0.108, c=1.088).
 * 표면 상대속도가 느릴수록(얇은 커트·느린 샷) 마찰이 커져 던지기(throw)가 커진다.
 */
export function ballBallFriction(vRel: number, p: BallParams): number {
    const { a, b, c } = p.muBB;
    return a + b * exp(-c * vRel);
}

/**
 * 중심에서 방향 d(단위벡터) 로 R 만큼 떨어진 표면점의 속도: v + ω × (R d).
 * 여기서는 v 와 ω 에서 이미 n̂ 성분을 뺀 값을 넣으므로 결과가 접평면 성분이다
 * (pooltool `surface_velocity_vw` 를 법선 성분을 0 으로 둔 벡터에 적용하는 것과 같다).
 */
function surfaceVelocity(v: Vec3, w: Vec3, d: Vec3, R: number): Vec3 {
    return add(v, cross(w, scale(d, R)));
}

/**
 * 두 공의 충돌을 해석해 새 상태 두 개를 입력 순서대로 돌려준다. 위치는 그대로(접촉 순간이라고 가정).
 * n̂ 은 b1 중심에서 b2 중심을 향하는 단위벡터. 두 중심이 완전히 겹치는 퇴화 입력이면 상대속도 방향을,
 * 그것도 없으면 +x 를 법선으로 쓴다(NaN 을 내지 않기 위한 방어이며 정상 시뮬레이션에서는 오지 않는다).
 */
export function resolveBallBall(b1: BallState, b2: BallState, p: BallParams): readonly [BallState, BallState] {
    const R = p.R;
    const e = p.eB;

    let n = unit(sub(b2.r, b1.r));
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) {
        n = unit(sub(b1.v, b2.v));
        if (n[0] === 0 && n[1] === 0 && n[2] === 0) n = [1, 0, 0];
    }

    // ── 1. 법선 성분: 반발 계수로 닫힌 식 ────────────────────────────────────
    const v1n = dot(b1.v, n);
    const v2n = dot(b2.v, n);
    const w1n = dot(b1.w, n);
    const w2n = dot(b2.w, n);
    const v1nF = 0.5 * ((1 - e) * v1n + (1 + e) * v2n);
    const v2nF = 0.5 * ((1 + e) * v1n + (1 - e) * v2n);
    /** 법선 속도 변화 크기 |ΔV_n| — 마찰 임펄스 상한 μ|ΔV_n| 의 기준. */
    const dVn = Math.abs(v2nF - v1nF);

    // ── 2. 접선 성분만 남긴 v, ω ─────────────────────────────────────────────
    const v1t = sub(b1.v, scale(n, v1n));
    const v2t = sub(b2.v, scale(n, v2n));
    const w1t = sub(b1.w, scale(n, w1n));
    const w2t = sub(b2.w, scale(n, w2n));

    // 접점 표면 상대속도 v_c = v1c − v2c. 공 1 의 접점은 +R n̂, 공 2 의 접점은 −R n̂.
    const v1c = surfaceVelocity(v1t, w1t, n, R);
    const v2c = surfaceVelocity(v2t, w2t, n, -R);
    const v12c = sub(v1c, v2c);
    const v12cLen = length(v12c);
    const mu = ballBallFriction(v12cLen, p);

    // ── 3. 접선 임펄스: slip 을 먼저 시도하고 방향이 뒤집히면 stick ───────────
    let dV1t: Vec3 | null = null;
    if (v12cLen > EPS) {
        // Coulomb 한계: 공 1 의 접선 속도 변화 = −μ|ΔV_n|·v̂_c
        const slip = scale(v12c, -mu * dVn / v12cLen);
        const dWslip = scale(cross(n, slip), 2.5 / R);
        // 이 임펄스를 적용한 뒤의 접점 상대속도. 원래 방향과 같은 쪽이면 미끄럼이 남은 것 → slip 유효.
        const v1cS = surfaceVelocity(add(v1t, slip), add(w1t, dWslip), n, R);
        const v2cS = surfaceVelocity(sub(v2t, slip), add(w2t, dWslip), n, -R);
        if (dot(v12c, sub(v1cS, v2cS)) > 0) dV1t = slip;
    }
    if (dV1t === null) {
        // 무슬립: 접점 상대속도를 정확히 0 으로 만드는 임펄스. 접점 상대속도는 ΔV1_t 의 7배로 변하므로
        // (병진 2배 + 두 공 스핀 5배) ΔV1_t = −v_c/7. pooltool 의 Δω = −(5/14)(n̂×(v1−v2)/R + ω1+ω2) 와 동일.
        dV1t = scale(v12c, -1 / 7);
    }
    const dW = scale(cross(n, dV1t), 2.5 / R);

    // ── 4. 접선 갱신 + 법선 성분 복원, z 속도 제거 ───────────────────────────
    const v1 = add(add(v1t, dV1t), scale(n, v1nF));
    const v2 = add(sub(v2t, dV1t), scale(n, v2nF));
    const w1 = add(add(w1t, dW), scale(n, w1n));
    const w2 = add(add(w2t, dW), scale(n, w2n));

    return [
        { ...b1, v: [v1[0], v1[1], 0], w: w1, state: "sliding" },
        { ...b2, v: [v2[0], v2[1], 0], w: w2, state: "sliding" },
    ];
}
