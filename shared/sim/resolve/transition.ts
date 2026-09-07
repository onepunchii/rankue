/**
 * resolve/transition.ts — 운동 상태 전이의 정준(canonical) 처리.
 *
 * 출처: pooltool <pooltool/physics/resolve/transition/__init__.py> (CanonicalTransition, _TOLERANCE = 1e-12,
 *       Apache-2.0, NOTICE.md).
 *
 * 물리
 *  - 전이 시각은 evolve.ts 가 닫힌 식으로 정확히 구하지만, 그 시각까지 전진한 상태에는 부동소수점 잔차가 남는다
 *    (미끄럼 끝의 접점 속도 u ≈ 1e-17, 구름 끝의 v ≈ 1e-17). 잔차를 그대로 두면 다음 전이 시각이 1e-18 s 같은
 *    쓰레기 값이 되어 이벤트가 무의미하게 늘어나므로, 전이 순간에 새 상태의 정의를 정확히 강제한다.
 *  - rolling 진입: 구름 조건 ω_xy = (1/R) k̂ × v 를 정확히 세운다. 접점 속도가 0 이 되어 slipVelocity 가 정확히 0.
 *  - spinning 진입: 병진 속도와 ω_xy 는 0, 수직축 스핀 ω_z 만 남는다.
 *  - stationary 진입: 모두 0.
 *  - sliding 진입(충돌 직후 등): 값은 그대로 두고 상태만 바꾼다.
 *  절댓값 1e-12 미만 성분은 0 으로 스냅한다(pooltool _TOLERANCE). 천 위 상태(rolling·sliding·spinning·stationary)의
 *  v_z 는 0 이고 airborne 만 v_z 를 지닌다. postImpactState 는 충돌 해석 직후 'airborne' 과 'sliding' 을 가른다.
 *
 * 초월함수 없음. 입력 불변, 반환 튜플은 모두 새 배열.
 */
import type { BallState, MotionState, Vec3 } from "../types.js";
import type { BallParams } from "../params.js";

/** 이 값 미만의 속도·각속도 성분은 0 으로 본다 (pooltool CanonicalTransition._TOLERANCE). */
export const SNAP_TOLERANCE = 1e-12;

function snap(x: number): number {
    return Math.abs(x) < SNAP_TOLERANCE ? 0 : x;
}

function snapVec(v: Vec3): Vec3 {
    return [snap(v[0]), snap(v[1]), snap(v[2])];
}

/**
 * 공 b 를 상태 to 로 전이시킨 새 BallState. 위치는 그대로, 속도·각속도는 새 상태의 정의대로 정리한다.
 * 계약: README "resolve/transition.ts".
 */
export function applyTransition(b: BallState, to: MotionState, p: BallParams): BallState {
    const r: Vec3 = [b.r[0], b.r[1], b.r[2]];
    switch (to) {
        case "rolling": {
            // 구름 조건: ω_xy = (1/R) k̂ × v = (−v_y, v_x, 0)·(1/R). evolve.ts 의 evolveRolling 과 같은 식
            // (× (1/R), ÷ R 가 아님)이라 전이 직후와 그 뒤 전진 결과가 비트 단위로 일치한다. 수직축 스핀은 독립 유지.
            // snap 을 한 번 더 거쳐 −0 이 나오지 않게 한다(해시가 −0 과 +0 을 구분한다).
            const vx = snap(b.v[0]);
            const vy = snap(b.v[1]);
            const invR = 1 / p.R;
            return {
                id: b.id,
                r,
                v: [vx, vy, 0],
                w: [snap(-vy * invR), snap(vx * invR), snap(b.w[2])],
                state: "rolling",
            };
        }
        case "spinning":
            return { id: b.id, r, v: [0, 0, 0], w: [0, 0, snap(b.w[2])], state: "spinning" };
        case "stationary":
            return { id: b.id, r, v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
        case "sliding": {
            const v = snapVec(b.v);
            return { id: b.id, r, v: [v[0], v[1], 0], w: snapVec(b.w), state: "sliding" };
        }
        default:
            // airborne: 값은 스냅만 하고 상태를 붙인다(공중에서는 v_z 가 있으므로 0 으로 만들지 않는다).
            return { id: b.id, r, v: snapVec(b.v), w: snapVec(b.w), state: to };
    }
}

/**
 * 충돌 해석 직후의 상태 분류 (pooltool ball_table/core.py final_ball_motion_state 의 앞 두 분기):
 * v_z ≠ 0 이거나 중심이 천 높이(z === R — 착지가 정확히 스냅한 값)가 아니면 'airborne', 아니면 'sliding'
 * (구름·정지 여부는 다음 전이 판정이 정한다). 공중 공이 낀 볼–볼·쿠션 해석이 쓴다. v_z 가 아주 작은 airborne 은
 * simulate 의 즉시 스윕이 1e-9 s 안의 착지로 잡아 정착시킨다.
 */
export function postImpactState(r: Vec3, v: Vec3, R: number): "airborne" | "sliding" {
    return v[2] !== 0 || r[2] !== R ? "airborne" : "sliding";
}
