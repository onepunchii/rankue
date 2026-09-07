/**
 * sphereHalfSpace.ts — 구–반공간(수직 벽) 마찰 비탄성 충돌의 2D 변형.
 *
 * 출처: pooltool <pooltool/physics/resolve/sphere_half_space_collision.py>,
 *       <pooltool/physics/resolve/ball_cushion/impulse_frictional_inelastic/model.py> (Apache-2.0, NOTICE.md).
 *
 * 모델: 쿠션을 공 중심 높이에 접하는 **수직 벽**으로 본다(코 높이 h 는 무시 — 인자로 받지만 쓰지 않는다).
 * 접촉 법선 n 은 세그먼트의 안쪽 법선(수평)이고 접점은 중심에서 −R n.
 *  - 법선: Δv⊥ = (1 + e)(−v_n) n  (v_n = v · n < 0 이 접근)
 *  - 접점 미끄럼 속도 u = v_t + ω × (−R n)  (n 방향 성분 제거)
 *  - 접선 임펄스는 두 후보 중 작은 것:
 *      Coulomb 미끄럼  Δv∥ = μ_k |Δv⊥| (−û)
 *      무슬립(stick)   Δv∥ = −(2/7) u   (자유 구의 접점 유효질량 2m/7 — 미끄럼을 정확히 0 으로)
 *  - 스핀: 접점 −R n 에서의 임펄스 토크 (−R n) × (m Δv∥) 를 I = (2/5) m R² 로 나눠
 *      Δω = −(2.5/R) n × Δv∥
 *    stick 이면 이것이 ω_t → (2/7) ω_t + (5/7) n × v_t / R 로 정리된다(pooltool 식). n 축 스핀은 보존.
 *
 * 프레임: 법선을 국소 ẑ' 으로 보내는 정규직교 기저 (e₁, e₂, e₃) = (ẑ, n × ẑ, n) 을 삼각함수 없이 만든다.
 *   e₁ × e₂ = ẑ × (n × ẑ) = n = e₃ 로 오른손계. 국소 z' 성분이 법선 성분이다.
 *   물리는 법선 둘레 회전에 불변이라 기저 선택이 결과를 바꾸지 않는다.
 *
 * 벽이 수직이라 구르는 공(ω ⊥ v)의 접점은 벽에서 아래로 미끄러지고, 마찰이 공을 위로 튕긴다.
 * 천 위의 공은 그 테이블 z 속도를 버린다(pooltool *2D 변형과 동일, 슬레이트가 받는다). 상태는 'sliding'.
 * 공중의 공(airborne, v2.2)은 벽을 무한 높이의 수직면으로 보고 자유 구 임펄스 전체(z 성분 포함)를 적용해 v_z 를
 * 남긴다 — Han·Mathavan 도 공중 공은 여기로 보낸다(cushion/index.ts). solveZNormal 은 resolve/ballTable.ts 가
 * 법선 = 테이블 ẑ, μ = μ_s, e = e_t 로 재사용한다(착지도 같은 구–반공간 충돌이다).
 *
 * 에너지: 법선(e ≤ 1)·접선(미끄럼 반대, 크기 ≤ 정지 임펄스) 임펄스 모두 자유 구에 소산적이고, 천 위의 공이
 * 버리는 v_z 도 감소분이라 결과 운동에너지 ≤ 입력. 공중 공은 임펄스 전체를 적용하므로 자유 구 논증 그대로다.
 */
import type { BallState, CushionSegment, Vec3 } from "../../types.js";
import type { BallParams } from "../../params.js";
import { postImpactState } from "../transition.js";

/** 접점 상대속도를 0 으로 보는 문턱 (m/s). pooltool const.EPS 역할. */
const SLIP_EPS = 1e-12;

/** 국소 기저: e1 = ẑ, e2 = n × ẑ = (n_y, −n_x, 0), e3 = n. */
function wallBasis(seg: CushionSegment): { e2: Vec3; e3: Vec3 } {
    const nx = seg.normal[0], ny = seg.normal[1];
    return { e2: [ny, -nx, 0], e3: [nx, ny, 0] };
}

/** 테이블 → 국소 (z, e2, n) 성분. */
function toLocal(v: Vec3, e2: Vec3, e3: Vec3): Vec3 {
    return [v[2], v[0] * e2[0] + v[1] * e2[1], v[0] * e3[0] + v[1] * e3[1]];
}

/** 국소 → 테이블. */
function fromLocal(v: Vec3, e2: Vec3, e3: Vec3): Vec3 {
    return [v[1] * e2[0] + v[2] * e3[0], v[1] * e2[1] + v[2] * e3[1], v[0]];
}

/**
 * 법선이 국소 +ẑ 인 프레임에서의 해결(pooltool resolve_sphere_half_space_collision_z_normal).
 * vi[2] < 0 이어야 한다. 접점은 −R ẑ, 법선 축 스핀 wi[2] 는 보존(접점 마찰은 법선 둘레 토크를 못 준다).
 * 테이블 착지(resolve/ballTable.ts)는 테이블 프레임을 그대로 국소 프레임으로 쓴다(법선이 ẑ 이므로).
 */
export function solveZNormal(vi: Vec3, wi: Vec3, R: number, muK: number, e: number): { v: Vec3; w: Vec3 } {
    const dPerp = (1 + e) * -vi[2];

    // 법선 성분을 뺀 접선 속도·스핀. (스핀의 법선 성분은 임펄스에 영향이 없고 보존된다.)
    const vt: Vec3 = [vi[0], vi[1], 0];
    const wt: Vec3 = [wi[0], wi[1], 0];

    // 접점(−R ẑ) 미끄럼 속도 u = v_t + ω × (−R ẑ) = (v_x − R ω_y, v_y + R ω_x, 0).
    const ux = vt[0] - R * wt[1];
    const uy = vt[1] + R * wt[0];
    const uMag = Math.sqrt(ux * ux + uy * uy);
    const hasSlip = uMag > SLIP_EPS;

    // Coulomb 후보.
    let slipX = 0, slipY = 0, uhx = 0, uhy = 0;
    if (hasSlip) {
        uhx = ux / uMag;
        uhy = uy / uMag;
        slipX = -muK * dPerp * uhx;
        slipY = -muK * dPerp * uhy;
    }
    // 무슬립 후보 (2/7)(R ω × ẑ − v_t) = −(2/7) u.
    const stickX = -(2 / 7) * ux;
    const stickY = -(2 / 7) * uy;

    const stickSq = stickX * stickX + stickY * stickY;
    const slipSq = slipX * slipX + slipY * slipY;

    if (!hasSlip || stickSq <= slipSq) {
        // stick: ω_t' = ω_t + (5/7)(−ω_t + ẑ × v_t / R).  ẑ × v_t = (−v_y, v_x, 0).
        return {
            v: [vi[0] + stickX, vi[1] + stickY, vi[2] + dPerp],
            w: [
                wi[0] + (5 / 7) * (-wt[0] - vt[1] / R),
                wi[1] + (5 / 7) * (-wt[1] + vt[0] / R),
                wi[2],
            ],
        };
    }
    // slip: Δω = (2.5/R)|Δv∥| (ẑ × û) = (2.5/R)|Δv∥| (−û_y, û_x, 0).
    const slipMag = Math.sqrt(slipSq);
    const k = (2.5 / R) * slipMag;
    return {
        v: [vi[0] + slipX, vi[1] + slipY, vi[2] + dPerp],
        w: [wi[0] - k * uhy, wi[1] + k * uhx, wi[2]],
    };
}

/**
 * 구–반공간 쿠션 충돌. cushionHeight 는 시그니처 통일용이며 이 모델은 쓰지 않는다(수직 벽).
 * 천 위의 공: 결과 v_z = 0, state 'sliding'. 공중의 공: 자유 구 임펄스 전체를 적용해 v_z 를 남기고 상태는
 * postImpactState. 공이 쿠션에서 멀어지는 중이면 입력을 그대로 돌려준다.
 */
export function resolveCushionSHS(b: BallState, seg: CushionSegment, p: BallParams, _cushionHeight: number): BallState {
    const { e2, e3 } = wallBasis(seg);
    const vl = toLocal(b.v, e2, e3);
    if (!(vl[2] < 0)) return b;
    const wl = toLocal(b.w, e2, e3);
    const out = solveZNormal(vl, wl, p.R, p.fC, p.eC);
    const w = fromLocal(out.w, e2, e3);
    const r: Vec3 = [b.r[0], b.r[1], b.r[2]];
    if (b.state === "airborne") {
        // 공중의 공(v2.2): 무한 높이 수직 벽, 슬레이트 반력 없음 → 국소 e1(테이블 ẑ) 성분까지 그대로 적용한다.
        const v = fromLocal(out.v, e2, e3);
        return { id: b.id, r, v, w, state: postImpactState(r, v, p.R) };
    }
    // 천 위의 공: 국소 e1 = 테이블 ẑ 성분(튀어오름)은 슬레이트가 받는다고 보고 버린다.
    const v = fromLocal([0, out.v[1], out.v[2]], e2, e3);
    return { id: b.id, r, v, w, state: "sliding" };
}
