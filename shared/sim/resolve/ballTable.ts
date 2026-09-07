/**
 * resolve/ballTable.ts — 공중 공의 착지(공–슬레이트) 해석. 마찰 비탄성 구–반공간 충돌.
 *
 * 출처: pooltool <pooltool/physics/resolve/ball_table/frictional_inelastic/__init__.py>,
 *       <pooltool/physics/resolve/ball_table/core.py> (make_kiss, bounce_height, final_ball_motion_state,
 *       min_bounce_height = 0.005; Apache-2.0, NOTICE.md), Alciatore TP A.14.
 *
 * 물리
 *  - 법선(테이블 ẑ, 접점 −R ẑ): v_z' = −e_t v_z (e_t = BallParams.eT).
 *  - 접선: cushion/sphereHalfSpace.ts 의 solveZNormal 그대로 — Coulomb μ_s (1+e_t)|v_z| 와 무슬립 −(2/7)u 중 작은 것,
 *    Δω_xy = (2.5/R) ẑ × Δv∥. ω_z 는 보존한다(접점 마찰은 법선 둘레 토크를 못 준다. pooltool 의 코드는 무슬립 분기에서
 *    ω 전체에 (5/7)(−ω + ẑ×v/R) 를 더해 ω_z 까지 2/7 로 깎지만, 물리에 근거가 없어 따르지 않는다 — 의도된 차이).
 *  - make_kiss: 해석 전에 z 를 정확히 R 로 스냅한다(감지기 근의 반올림 잔차 제거). 천 위의 공은 z === R 이 불변이다.
 *  - 정착: 튕긴 뒤 정점 높이 v_z'²/(2g) < MIN_BOUNCE_HEIGHT(5 mm) 면 v_z = 0, state 'sliding' 으로 천에 붙인다
 *    (구름 전이는 evolve 가 판정). 아니면 state 'airborne' 으로 z = R 에서 다시 날아오른다. 튕김마다 정점이 e_t² 배로 줄어
 *    착지 이벤트 수는 유한하다(0.5 m 에서 시작해도 4번).
 *  - v_z ≥ 0 인 공(즉시 스윕이 "1e-9 s 안에 착지"로 넘긴 v_z ≈ +0 의 공)은 임펄스 없이 정착시킨다.
 *
 * 에너지: 법선(e_t ≤ 1)·접선(미끄럼 반대, 크기 ≤ 정지 임펄스) 임펄스 모두 자유 구에 소산적이고 위치(z = R)는 변하지
 * 않으므로 KE + PE 는 늘지 않는다. 정착으로 버리는 v_z 도 감소분이다. 초월함수 없음, 입력 불변.
 */
import type { BallState, Vec3 } from "../types.js";
import type { BallParams } from "../params.js";
import { solveZNormal } from "./cushion/sphereHalfSpace.js";
import { applyTransition } from "./transition.js";

/** 이보다 낮게 튀어오를 공은 천에 붙인다 (m, 공 바닥 기준 정점 높이). pooltool min_bounce_height. */
export const MIN_BOUNCE_HEIGHT = 0.005;

/** 위로 v_z 로 떠난 공의 정점 높이 v_z²/(2g) (m). g ≤ 0 이면 Infinity(내려오지 않는다). */
export function bounceHeight(vz: number, g: number): number {
    if (!(g > 0)) return Infinity;
    return (0.5 * vz * vz) / g;
}

/**
 * 착지 해석. 감지기가 z ≈ R 로 전진시킨 airborne 공을 받아 튕김(airborne) 또는 정착(sliding) 상태의 새 BallState 를 돌려준다.
 * 계약: README "resolve/ballTable.ts".
 */
export function resolveBallTable(b: BallState, p: BallParams): BallState {
    const R = p.R;
    const r: Vec3 = [b.r[0], b.r[1], R];
    let v: Vec3;
    let w: Vec3;
    if (b.v[2] < 0) {
        // 테이블 프레임이 곧 국소 프레임(법선 ẑ, 접점 −R ẑ). μ = μ_s(공–천 미끄럼), e = e_t.
        const out = solveZNormal(b.v, b.w, R, p.muS, p.eT);
        v = out.v;
        w = out.w;
    } else {
        v = [b.v[0], b.v[1], 0];
        w = [b.w[0], b.w[1], b.w[2]];
    }
    if (!(v[2] > 0) || bounceHeight(v[2], p.g) < MIN_BOUNCE_HEIGHT) {
        // 정착: v_z = 0, 'sliding' (applyTransition 이 1e-12 미만 잔차를 스냅한다)
        return applyTransition({ id: b.id, r, v: [v[0], v[1], 0], w, state: "airborne" }, "sliding", p);
    }
    return { id: b.id, r, v: [v[0], v[1], v[2]], w: [w[0], w[1], w[2]], state: "airborne" };
}
