/**
 * detect/ballBall.ts — 두 공의 충돌 시각 (4차 방정식).
 *
 * 출처: Leckie & Greenspan 2005 §4, Kiefl "pooltool-alg" (2020),
 *       pooltool <pooltool/evolution/event_based/detect/ball_ball.py>,
 *       <pooltool/evolution/event_based/detect/quartic_coefficients.py> (Apache-2.0, NOTICE.md).
 *
 * 물리
 *  - 이벤트 사이의 각 공은 r(t) = r0 + r1 t + r2 t² 로 정확히 움직인다(evolve.positionPolynomial).
 *    두 공의 차 p(t) = rA(t) − rB(t) 도 같은 꼴의 2차 다항식 p0 + p1 t + p2 t² 이다.
 *  - 충돌은 중심 거리가 정확히 2R 이 되는 순간: |p(t)|² = (2R)². 양변을 전개해 ½ 을 곱하면
 *      f(t) = ½(|p0|² − 4R²) + (p0·p1) t + (p0·p2 + ½|p1|²) t² + (p1·p2) t³ + ½|p2|² t⁴ = 0
 *    (pooltool parabola_sphere_distance_quartic_coefficients 의 계수 순서 c0..c4, 낮은 차수부터).
 *    우리 solveQuartic(a, b, c, d, e) 는 a t⁴ + … + e 이므로 solveQuartic(c4, c3, c2, c1, c0) 로 넘긴다.
 *  - 두 공의 가속도가 같으면(p2 = 0 — 둘 다 정지/스핀이거나 같은 방향으로 같은 마찰로 감속) c4 = c3 = 0 이라
 *    2차식으로 강등한다(pooltool 의 FIXME 분기와 같다).
 *  - 근 중에서 "접근 중"인 것만 충돌이다: d/dt|p|² = 2 p(t)·p′(t) < 0. 같은 거리 2R 을 멀어지며 지나는
 *    근(충돌 직후 분리)은 버린다.
 *  - 이미 접촉·겹침 상태(|p0| ≤ 2R + 1e-9)에서 멀어지는 중이고 **상대 가속도가 0 이면** Infinity — 곡률이
 *    없으니 다시 만날 수 없고, 방금 해결한 충돌을 다시 잡는 이벤트 폭풍도 막는다. 상대 가속도 p2 ≠ 0 이면
 *    근 탐색으로 넘긴다: 마찰이 만드는 포물선 곡률로 스핀 공이 느리게 멀어지다 같은 이벤트 구간 안에서
 *    되돌아와 다시 닿는 경우(예: 접촉한 채 마세이 스핀으로 살짝 밀어난 공, 40-physics-review Finding 1)가
 *    있고, pooltool 도 이 상태에서 4차식을 그대로 푼다(is_overlapping 은 2R 미만에서만 발동). 방금 해결한
 *    접촉 자신은 t > 1e-9 와 p·p′ < 0 필터가, 겹친 쌍의 탈출 근은 p·p′ > 0 이라 자연히 걸러진다.
 *  - 1e-9 s 이하의 근은 현재 이벤트 자신이므로 버린다(pooltool EPS 와 같은 규약).
 *  - 벡터는 3차원이다(v2.2): 공중 공의 z 다항식(v_z t − ½ g t²)까지 들어가므로 다른 공 위를 지나는 공(xy 에서는 겹치지만
 *    3D 거리 > 2R)은 충돌이 아니고, 위에서 떨어지는 공은 |Δr| = 2R 인 순간 잡힌다. 유효 구간은 착지 시각까지다.
 *
 * 유효 구간(horizon)
 *  다항식은 그 공의 다음 상태 전이까지만 물리적으로 맞다. 그 뒤로 외삽하면 멈춘 구름 공의 포물선이
 *  되돌아와 반대편 쿠션을 "맞히는" 식의 가짜 근이 나온다. simulate 루프에서는 전이 후보가 그런 근보다
 *  항상 먼저(dt 가 작거나, 동률이면 type 순위로) 골라지므로 결과는 같지만, 감지기 단독으로도 의미 있는
 *  값을 돌려주도록 두 공 중 이른 전이 시각(polynomialHorizon)보다 늦은 근은 버린다.
 *  (pooltool 은 이 필터가 없고 전이 이벤트에만 의존한다.)
 * 초월함수는 쓰지 않는다. 입력은 변형하지 않는다.
 */
import type { BallState, Vec3 } from "../types.js";
import type { BallParams } from "../params.js";
import { landingTime, positionPolynomial, rollTime, slideTime } from "../evolve.js";
import { dot, sub, lengthSq } from "../vec.js";
import { solveQuadratic } from "../roots/quadratic.js";
import { solveQuartic } from "../roots/quartic.js";

/** 현재 이벤트 자신(t ≈ 0)을 다음 이벤트로 잡지 않기 위한 최소 시간 (s). */
export const EVENT_EPS = 1e-9;

/**
 * 이 공의 positionPolynomial 이 유효한 시간 상한 = 다음 상태 전이(또는 착지)까지의 시간.
 * sliding → slideTime, rolling → rollTime, airborne → landingTime(착지 뒤에는 포물선이 슬레이트 아래로 외삽된다),
 * 그 외(정지·스핀: 위치가 변하지 않으므로 다항식은 영원히 맞다) → Infinity.
 */
export function polynomialHorizon(b: BallState, p: BallParams): number {
    if (b.state === "sliding") return slideTime(b, p);
    if (b.state === "rolling") return rollTime(b, p);
    if (b.state === "airborne") return landingTime(b, p);
    return Infinity;
}

function isZero(v: Vec3): boolean {
    return v[0] === 0 && v[1] === 0 && v[2] === 0;
}

/**
 * 두 공의 다음 충돌까지의 시간 (s). 충돌하지 않으면 Infinity.
 *  - 둘 다 이동하지 않으면(r1 = r2 = 0) Infinity.
 *  - 이미 접촉·겹침 중이고 멀어지는(또는 접선 방향) 중이며 상대 가속도가 0 이면 Infinity.
 *  - 그 외에는 |p(t)| = 2R 의 근 중 t > 1e-9, 두 공의 유효 구간 안(t ≤ 이른 전이 시각),
 *    그 순간 접근 중(p·p′ < 0)인 가장 작은 것.
 */
export function ballBallTime(b1: BallState, b2: BallState, p: BallParams): number {
    const A = positionPolynomial(b1, p);
    const B = positionPolynomial(b2, p);
    if (isZero(A.r1) && isZero(A.r2) && isZero(B.r1) && isZero(B.r2)) return Infinity;

    // 상대 위치 다항식 p(t) = p0 + p1 t + p2 t²
    const p0 = sub(A.r0, B.r0);
    const p1 = sub(A.r1, B.r1);
    const p2 = sub(A.r2, B.r2);
    const D = 2 * p.R;

    // 이미 닿아 있거나 겹친 상태에서 멀어지는 중: 상대 가속도가 없으면(둘 다 등속·정지) 다시 만날 수 없다.
    // p2 ≠ 0 이면 곡률로 되돌아올 수 있으므로 근 탐색에 맡긴다(파일 머리 주석). 겹친 채 접근 중이면 아래
    // 근 탐색이 (2R 을 접근하며 지나는 미래 근이 없으므로) 자연히 Infinity 를 돌려준다.
    const touching = lengthSq(p0) <= (D + EVENT_EPS) * (D + EVENT_EPS);
    if (touching && dot(p0, p1) >= 0 && isZero(p2)) return Infinity;

    // f(t) = ½(|p|² − D²) 의 계수, 낮은 차수부터 (pooltool quartic_coefficients.py)
    const c0 = 0.5 * (lengthSq(p0) - D * D);
    const c1 = dot(p0, p1);
    const c2 = dot(p0, p2) + 0.5 * lengthSq(p1);
    const c3 = dot(p1, p2);
    const c4 = 0.5 * lengthSq(p2);

    // 가속도 차가 0 이면 2차식 (c4 = 0 ⇒ p2 = 0 ⇒ c3 = 0)
    const roots = c4 === 0 ? solveQuadratic(c2, c1, c0) : solveQuartic(c4, c3, c2, c1, c0);
    const horizon = Math.min(polynomialHorizon(b1, p), polynomialHorizon(b2, p));

    for (let i = 0; i < roots.length; i++) {
        const t = roots[i];
        if (!(t > EVENT_EPS)) continue;
        if (t > horizon) break;                // 오름차순이므로 이후 근도 전부 유효 구간 밖
        // 그 순간 접근 중인가: d/dt |p|² = 2 p(t)·p′(t) < 0
        const px = p0[0] + (p1[0] + p2[0] * t) * t;
        const py = p0[1] + (p1[1] + p2[1] * t) * t;
        const pz = p0[2] + (p1[2] + p2[2] * t) * t;
        const vx = p1[0] + 2 * p2[0] * t;
        const vy = p1[1] + 2 * p2[1] * t;
        const vz = p1[2] + 2 * p2[2] * t;
        if (px * vx + py * vy + pz * vz < 0) return t;
    }
    return Infinity;
}
