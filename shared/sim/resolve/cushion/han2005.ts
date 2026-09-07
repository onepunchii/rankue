/**
 * han2005.ts — Han 2005 공–쿠션 충돌 모델 (순간 임펄스, 강체 쿠션, 닫힌 식).
 *
 * 출처: Han, "Dynamics in carom and three cushion billiards", J. Mech. Sci. Tech. 19 (2005);
 *       pooltool <pooltool/physics/resolve/ball_cushion/han_2005/model.py> (Apache-2.0, NOTICE.md).
 *       e, μ 는 pooltool 과 같이 상수(eC, fC)를 쓴다 — Han 의 속도 의존 e 피팅은 두 상류 구현 모두 버렸다.
 *
 * 기하 (쿠션 프레임)
 *  - pooltool 의 Han 프레임: 공→쿠션 방향(= 우리 세그먼트의 안쪽 법선 n 의 반대, −n)이 +x̂,
 *    ŷ = ẑ × x̂, ẑ 는 테이블 위쪽. 공은 v_x > 0 으로 쿠션을 향해 다가온다.
 *    법선이 축 정렬이든 아니든 x̂ = −n, ŷ = (n_y, −n_x) 로 삼각함수 없이 프레임을 만든다(오른손계: x̂ × ŷ = ẑ).
 *  - 쿠션 코 높이 h 가 공 중심보다 높아(h > R) 접촉 법선이 기울어진다: sin θ = (h − R)/R, cos θ = √(1 − sin²θ).
 *    공 중심에서 접점으로 향하는 단위벡터 d = (cos θ, 0, sin θ).
 *  - 접점 프레임: 접선 t₁ = (sin θ, 0, −cos θ), t₂ = (0, −1, 0), 접촉 법선(쿠션→공) n_c = −d = (−cos θ, 0, −sin θ).
 *    t₁ × t₂ = n_c 로 오른손계. 접점 미끄럼 속도 s = (v + ω × R d) 의 접선 성분:
 *      s_x = v_x sin θ − v_z cos θ + R ω_y,   s_y = −v_y − R ω_z cos θ + R ω_x sin θ   (Han 식 14)
 *    법선 방향 속도 c = v · n_c = −v_x cos θ  (v_z = 0 인 2D 가정).
 *
 * 임펄스 (Han 식 16–23)
 *  - 법선 임펄스는 공 중심을 지나므로 토크가 없다: P_zE = m (1 + e)(−c) = m (1 + e) v_x cos θ.
 *  - 자유 구의 접점 유효질량은 2m/7 (접점 접선 임펄스 J 가 접점 속도를 (7/2m) J 만큼 바꾼다).
 *    미끄럼을 완전히 멈추는 데 필요한 접선 임펄스 크기 P_zS = (2m/7)|s|.
 *  - grip(정지 마찰로 멈춤): P_zS ≤ μ P_zE 이면 접선 임펄스 = (2m/7) s (미끄럼 반대 방향으로 정확히 0 이 됨).
 *    slip(운동 마찰): 그렇지 않으면 Coulomb 상한 μ P_zE 만큼 미끄럼 반대 방향.
 *  - 공에 작용하는 임펄스 P = −P_xE t₁ − P_yE t₂ + P_zE n_c 를 쿠션 프레임으로 풀면
 *      P_X = −P_xE sin θ − P_zE cos θ,   P_Y = P_yE,   P_Z = P_xE cos θ − P_zE sin θ
 *    Δv = P/m (단 v_z 는 2D 라 버린다 — 실제로는 코가 공을 아래로 눌러 튀어오르는 성분),
 *    Δω = (R/I) d × P = (R/I)(−P_Y sin θ, P_X sin θ − P_Z cos θ, P_Y cos θ), I = (2/5) m R².
 *
 * 에너지: 법선 임펄스(e ≤ 1)와 접선 임펄스(미끄럼을 줄이는 방향, 크기 ≤ 정지 임펄스) 모두 자유 구에 대해
 * 소산적이고, 버리는 v_z 도 에너지를 줄이므로 결과 운동에너지는 입력 이하다(테스트가 5000 개 무작위 상태로 검사).
 *
 * 초월함수 없음: 프레임은 법선 성분으로, θ 는 sqrt 로 만든다.
 */
import type { BallState, CushionSegment, Vec3 } from "../../types.js";
import type { BallParams } from "../../params.js";

export type HanRegime = "grip" | "slip";

/** 접촉 기울기. sin θ = (h − R)/R. |sin θ| ≥ 1 이면 코가 공에 닿을 수 없는 높이다. */
export function noseAngle(R: number, cushionHeight: number): { sinT: number; cosT: number } {
    const sinT = (cushionHeight - R) / R;
    if (!(Math.abs(sinT) < 1)) {
        throw new RangeError(`cushionHeight ${cushionHeight} out of range for R=${R}`);
    }
    return { sinT, cosT: Math.sqrt(1 - sinT * sinT) };
}

/**
 * 쿠션 프레임 기저. x̂ = −n (공→쿠션), ŷ = ẑ × x̂ = (n_y, −n_x, 0). 두 벡터 모두 테이블 평면 안이라
 * ẑ 는 그대로이고, ω 는 z 축 둘레의 고유 회전이라 벡터처럼 변환한다.
 */
function cushionBasis(seg: CushionSegment): { ex: Vec3; ey: Vec3 } {
    const nx = seg.normal[0], ny = seg.normal[1];
    return { ex: [-nx, -ny, 0], ey: [ny, -nx, 0] };
}

function toFrame(v: Vec3, ex: Vec3, ey: Vec3): Vec3 {
    return [v[0] * ex[0] + v[1] * ex[1], v[0] * ey[0] + v[1] * ey[1], v[2]];
}

function fromFrame(v: Vec3, ex: Vec3, ey: Vec3): Vec3 {
    return [v[0] * ex[0] + v[1] * ey[0], v[0] * ex[1] + v[1] * ey[1], v[2]];
}

interface HanSolution {
    readonly regime: HanRegime;
    /** 쿠션 프레임 속도·각속도 (v_z 는 아직 버리기 전). */
    readonly v: Vec3;
    readonly w: Vec3;
}

/** 쿠션 프레임(v_x > 0 이 접근)에서 Han 임펄스를 적용한다. 접근하지 않으면(v_x ≤ 0) null. */
function solveHan(v: Vec3, w: Vec3, p: BallParams, cushionHeight: number): HanSolution | null {
    if (!(v[0] > 0)) return null;
    const { sinT, cosT } = noseAngle(p.R, cushionHeight);
    const m = p.m, R = p.R;
    const e = p.eC, mu = p.fC;

    // Han 식 14 — 접점 미끄럼 속도(접선 두 성분)와 법선 접근 속도.
    const sx = v[0] * sinT - v[2] * cosT + R * w[1];
    const sy = -v[1] - R * w[2] * cosT + R * w[0] * sinT;
    const c = -v[0] * cosT;

    // 식 16: I = (2/5) m R², A = 7/(2m) (접점 유효질량의 역수), B = 1/m.
    const I = 0.4 * m * R * R;
    const A = 3.5 / m;
    const B = 1 / m;

    // 식 17, 20: 복원까지의 법선 임펄스와 미끄럼 정지 임펄스.
    const PzE = -(1 + e) * c / B;
    const absS = Math.sqrt(sx * sx + sy * sy);
    const PzS = absS / A;

    let PxE: number, PyE: number, regime: HanRegime;
    if (PzS <= mu * PzE) {
        // 식 18: 접선 임펄스가 미끄럼을 정확히 0 으로 만든다(grip).
        regime = "grip";
        PxE = sx / A;
        PyE = sy / A;
    } else {
        // 식 19: Coulomb 상한. absS > 0 은 이 분기에서 보장된다(PzS > μ PzE ≥ 0).
        regime = "slip";
        PxE = mu * PzE * sx / absS;
        PyE = mu * PzE * sy / absS;
    }

    // 식 21–22: 접점 프레임 → 쿠션 프레임.
    const PX = -PxE * sinT - PzE * cosT;
    const PY = PyE;
    const PZ = PxE * cosT - PzE * sinT;

    // 식 23.
    const vOut: Vec3 = [v[0] + PX / m, v[1] + PY / m, v[2]];
    const k = R / I;
    const wOut: Vec3 = [
        w[0] - k * PY * sinT,
        w[1] + k * (PX * sinT - PZ * cosT),
        w[2] + k * PY * cosT,
    ];
    return { regime, v: vOut, w: wOut };
}

/**
 * Han 2005 가 고를 마찰 분기. 테스트·진단용. 공이 쿠션 쪽으로 움직이지 않으면 null.
 * 주의: e, μ 가 상수라 grip/slip 판정은 속도 크기가 아니라 (스핀/속도, 입사각) 비율로만 정해진다.
 */
export function hanRegime(b: BallState, seg: CushionSegment, p: BallParams, cushionHeight: number): HanRegime | null {
    const { ex, ey } = cushionBasis(seg);
    const sol = solveHan(toFrame(b.v, ex, ey), toFrame(b.w, ex, ey), p, cushionHeight);
    return sol ? sol.regime : null;
}

/**
 * Han 2005 쿠션 충돌 해결. 결과는 v_z = 0, state 'sliding' 인 새 BallState.
 * 공이 쿠션에서 멀어지는 중이면(감지기가 부르지 않는 경우) 입력을 그대로 돌려준다.
 */
export function resolveCushionHan(b: BallState, seg: CushionSegment, p: BallParams, cushionHeight: number): BallState {
    const { ex, ey } = cushionBasis(seg);
    const sol = solveHan(toFrame(b.v, ex, ey), toFrame(b.w, ex, ey), p, cushionHeight);
    if (!sol) return b;
    const v = fromFrame([sol.v[0], sol.v[1], 0], ex, ey);
    const w = fromFrame(sol.w, ex, ey);
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v,
        w,
        state: "sliding",
    };
}
