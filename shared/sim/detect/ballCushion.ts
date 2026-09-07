/**
 * detect/ballCushion.ts — 공과 선형 쿠션 세그먼트의 충돌 시각 (2차 방정식).
 *
 * 출처: Leckie & Greenspan 2005 §4, pooltool <pooltool/evolution/event_based/detect/ball_cushion.py>
 *       (ball_vertical_plane_collision_time, Apache-2.0, NOTICE.md).
 *
 * 물리
 *  - 캐롬 테이블의 쿠션은 4개의 직선(코 라인)이고 천 위의 공은 z = R 평면에서 움직인다. 따라서 쿠션은
 *    수직 평면이고, 공 중심의 코 라인까지 부호 거리 s(t) = n·(r(t) − p1) (n 은 테이블 안쪽 단위 법선) 가
 *    정확히 R 이 되는 순간이 충돌이다.
 *  - r(t) = r0 + r1 t + r2 t² (evolve.positionPolynomial) 이므로
 *      s(t) − R = (n·r2) t² + (n·r1) t + (n·(r0 − p1) − R) = 0
 *    2차식이다. 스핀·정지 상태면 r1 = r2 = 0 이라 해가 없다 → Infinity.
 *  - 근 중에서 (1) t > 1e-9, (2) 다항식 유효 구간 안 t ≤ polynomialHorizon (다음 전이 시각 — 멈춘 뒤
 *    되돌아오는 외삽 근을 버린다), (3) 그 순간 쿠션 쪽으로 이동 중 n·v(t) < 0 (v(t) = r1 + 2 r2 t —
 *    방금 튕겨 나온 쿠션을 다시 잡지 않는다), (4) 접점(공 중심)의 세그먼트 축 투영이 [−R, L + R] 안 —
 *    을 모두 만족하는 가장 작은 것.
 *    (4) 의 R 여유는 코너를 정확히 향할 때 인접한 두 세그먼트 모두가 같은 t 를 돌려주게 해서
 *    (README 테스트 B "코너 정확 입사 → 쿠션 이벤트 2개") nextEvent 의 동률 규칙이 결정하게 한다.
 *  - 공중의 공(v2.2): 쿠션을 무한 높이의 수직 벽으로 본다 — xy 는 등속이라 2차식이 1차로 강등되고, 유효 구간은
 *    착지 시각(polynomialHorizon → landingTime)까지다. 중심이 코보다 높아도(z > h + R) 벽에 맞는다: 레일을 넘어
 *    날아가는 점프와 코 위를 스치는 접촉은 v2.2 에서 재현하지 않는다(문서화된 한계).
 *
 * 초월함수 없음. 입력 불변.
 */
import type { BallState, CushionSegment } from "../types.js";
import type { BallParams } from "../params.js";
import { positionPolynomial } from "../evolve.js";
import { solveQuadratic } from "../roots/quadratic.js";
import { EVENT_EPS, polynomialHorizon } from "./ballBall.js";

/**
 * 공이 세그먼트 seg 에 닿을 때까지의 시간 (s). 닿지 않으면 Infinity.
 * 세그먼트 범위 밖을 지나거나, 쿠션에서 멀어지는 중이거나, 이동하지 않으면 Infinity.
 */
export function ballCushionTime(b: BallState, seg: CushionSegment, p: BallParams): number {
    const { r0, r1, r2 } = positionPolynomial(b, p);
    if (r1[0] === 0 && r1[1] === 0 && r2[0] === 0 && r2[1] === 0) return Infinity;

    const nx = seg.normal[0], ny = seg.normal[1];
    const R = p.R;

    // s(t) − R = a t² + b t + c
    const a = nx * r2[0] + ny * r2[1];
    const bq = nx * r1[0] + ny * r1[1];
    const c = nx * (r0[0] - seg.p1[0]) + ny * (r0[1] - seg.p1[1]) - R;

    const roots = solveQuadratic(a, bq, c);
    if (roots.length === 0) return Infinity;

    // 세그먼트 축 (p2 − p1), 길이 제곱
    const ex = seg.p2[0] - seg.p1[0], ey = seg.p2[1] - seg.p1[1];
    const L2 = ex * ex + ey * ey;
    const L = Math.sqrt(L2);
    const horizon = polynomialHorizon(b, p);

    for (let i = 0; i < roots.length; i++) {
        const t = roots[i];
        if (!(t > EVENT_EPS)) continue;
        if (t > horizon) break;                // 오름차순 — 이후 근도 유효 구간 밖
        // 쿠션 쪽으로 이동 중인가
        const vx = r1[0] + 2 * r2[0] * t;
        const vy = r1[1] + 2 * r2[1] * t;
        if (!(nx * vx + ny * vy < 0)) continue;
        // 접점의 세그먼트 축 투영 (m). 양 끝에 R 여유.
        const cx = r0[0] + (r1[0] + r2[0] * t) * t;
        const cy = r0[1] + (r1[1] + r2[1] * t) * t;
        const along = L2 === 0 ? 0 : ((cx - seg.p1[0]) * ex + (cy - seg.p1[1]) * ey) / L;
        if (along < -R || along > L + R) continue;
        return t;
    }
    return Infinity;
}
