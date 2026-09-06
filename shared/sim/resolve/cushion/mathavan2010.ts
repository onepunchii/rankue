/**
 * mathavan2010.ts — Mathavan · Jackson · Parkin (2010) 볼–쿠션 충돌 모델.
 *
 * 출처: S. Mathavan, M. R. Jackson, R. M. Parkin, "A theoretical analysis of billiard ball dynamics under
 *       cushion impacts", Proc. IMechE Part C 224(9), 1863–1873 (2010), doi:10.1243/09544062JMES1964.
 *       pooltool <pooltool/physics/resolve/ball_cushion/mathavan_2010/model.py> (Apache-2.0, NOTICE.md) 의
 *       임펄스 스텝 구조(압축 → 이분 정제 → 복원)를 따르되, 논문 식 (15) 의 구름 조건과 프레임 회전은 여기서 새로 썼다.
 *
 * ── 물리 요약 ───────────────────────────────────────────────────────────────────────────────────────
 * 쿠션 프레임: X 는 쿠션을 따라, Y 는 공에서 쿠션 쪽(입사 시 v_y > 0), Z 위. 쿠션 코는 공 중심보다 높아서
 * 접점 I 의 법선 Z' = (0, cosθ, sinθ) 가 Y 축에서 θ 만큼 위로 기울고, sinθ = (h − R)/R (논문 §2, README).
 * 충돌 중 공은 테이블을 떠나지 않는다(ż_G = 0, 식 3c) → 테이블 접점 C 의 법선 임펄스 P_C = P_I sinθ − P_y'I cosθ (식 3d).
 *
 * 독립 변수는 시간이 아니라 쿠션 법선 임펄스 P_I (Stronge). ΔP_I 를 하나 주면 (식 3a–3b, 4a–4c)
 *   M Δv_x = P_xI + P_xC,   M Δv_y = −P_I cosθ − P_y'I sinθ + P_yC,
 *   (2MR/5) Δω = (P_y'I + P_yC,  P_xI sinθ − P_xC,  −P_xI cosθ)
 * 이고, 마찰 임펄스는 Amontons–Coulomb 로 접점 미끄럼 속도의 반대 방향:
 *   I: u_I = (v_x + R(ω_y sinθ − ω_z cosθ),  −v_y sinθ + R ω_x)      (식 12a, 12b)
 *   C: u_C = (v_x − R ω_y,  v_y + R ω_x)                                (식 13a, 13b)
 * 미끄럼이 0 이면 마찰도 0 (식 15a, 15b — 논문은 "stick 효과는 무시" 라 했지만, 이산화하면 매 스텝
 * 마찰이 미끄럼을 죽인 뒤 다시 살리는 채터가 되고 그 평균이 곧 stick 이다). 여기서는 그 평균을 직접 쓴다:
 * 마찰 임펄스 크기 = min(μ·P_normal, M|u|/κ). κ 는 그 접점·그 방향으로 단위 임펄스가 미끄럼 속도를 얼마나
 * 바꾸는지(유효 역질량·M) 로, 식 (3)(4)(12)(13) 에서 그대로 나온다:
 *   I 의 X 방향 3.5 (= 1 + 5/2), I 의 Y' 방향 sin²θ + 5/2 (Y' 임펄스의 z 성분을 테이블이 받아 주므로),
 *   C 는 두 방향 다 3.5.
 * 이렇게 하면 한 스텝 안에서 마찰이 미끄럼을 뒤집지 못하므로 마찰 일이 항상 ≤ 0 이고, 아래 에너지 논증이 닫힌다.
 *
 * 세 임펄스(법선 I → 마찰 I → 마찰 C)는 한 스텝 안에서 순차 적용한다(Gauss–Seidel). 논문의 동시 적용과의
 * 차이는 O(ΔP²)/스텝으로 1차 정확도 안에서 같고, 순차 적용이라야 아래 일(work) 회계가 정확히 맞는다.
 *
 * 복원 계수는 에너지 정의(Stronge): 압축 구간(v_y > 0)에 법선 임펄스가 한 일 W_c = ∫ v_y cosθ dP_I 를
 * 사다리꼴(식 16a)로 쌓고, 복원 구간은 W_r = e_e² W_c 가 될 때까지(식 16b). 법선 임펄스 한 스텝의 운동에너지
 * 변화는 −ΔP·cosθ·(v_y,전 + v_y,후)/2 로 사다리꼴과 정확히 같으므로(선형 임펄스–운동량),
 *   KE_후 − KE_전 = −W_c + W_r + (마찰 일 ≤ 0) = −(1 − e_e²)W_c + (≤ 0) ≤ 0.
 * 테이블 법선 임펄스 P_C 는 ż_C = 0 이라 일을 하지 않는다.
 *
 * 스텝 크기 ΔP_I = (1 + e_e) M v_y0 / steps (논문 §3.4 의 제안) — 고정 steps 라 결정론적이며 이 모델은
 * 속도에 대해 동차(중력 항 없음)라서 입사 속도를 k 배 하면 결과도 정확히 k 배다.
 *
 * 압축 종료(v_y ≤ 0)는 pooltool 처럼 마지막 스텝을 8 단계 이분 축소로 정제한다(넘지 않는 반 스텝만 채택).
 * 복원 종료는 남은 일 r 에 대해 사다리꼴이 2차식이므로 닫힌 식으로 정확히 맞춘다.
 *
 * 초월함수는 필요 없다: 미끄럼 방향은 cosΦ = u_x/|u| 로, cosθ = √(1 − sin²θ) 로, 프레임 회전은 법선 성분으로.
 * 결과: v_z = 0, 위치·id 유지, state 'sliding'.
 */
import type { BallState, CushionSegment } from "../../types";
import type { BallParams } from "../../params";

/** 한 스텝의 상태 레지스터. 이 모듈 안에서만 쓰는 가변 스크래치 — 입력 BallState 는 절대 건드리지 않는다. */
interface Reg {
    vx: number;
    vy: number;
    wx: number;
    wy: number;
    wz: number;
    /** 이 스텝에서 법선 임펄스가 한 일의 부호 있는 사다리꼴 ΔP cosθ (v_y,전 + v_y,후)/2. 압축에서 +, 복원에서 −. */
    dW: number;
}

/** 스텝마다 다시 계산할 필요 없는 상수. */
interface Consts {
    readonly M: number;
    readonly R: number;
    readonly invM: number;
    /** 5/(2MR): 임펄스 → Δω 계수 (I = 2MR²/5) */
    readonly rot: number;
    readonly s: number;
    readonly c: number;
    readonly muW: number;
    readonly muS: number;
    /** I 접점 Y' 방향의 유효 역질량·M = sin²θ + 5/2 */
    readonly kY: number;
}

/** I 접점 X 방향과 C 접점 양 방향의 유효 역질량·M = 1 + 5/2. */
const KAPPA_TANGENT = 3.5;
/** 압축 종료 정제의 이분 단계 수 (pooltool 과 동일). */
const REFINE_STEPS = 8;

/**
 * 법선 임펄스 dP 하나를 세 부분 임펄스(법선 I → 마찰 I → 마찰 C)로 순차 적용해 a → o 로 전진시킨다.
 * o !== a 여야 한다. 반환 없이 o 에 쓴다(할당 회피).
 */
function stepImpulse(k: Consts, a: Reg, dP: number, o: Reg): void {
    let vx = a.vx, vy = a.vy, wx = a.wx, wy = a.wy, wz = a.wz;

    // 1) 쿠션 법선 임펄스 P_I (공 중심을 지나므로 토크 없음). z 성분 −P_I sinθ 는 테이블 반력이 상쇄(ż_G = 0).
    const vyBefore = vy;
    vy -= dP * k.c * k.invM;
    o.dW = dP * k.c * (vyBefore + vy) * 0.5;

    // 2) 쿠션 접점 I 의 Coulomb 마찰. 미끄럼 (식 12a, 12b) 의 반대 방향, 크기 min(μ_w P_I, M|u_I|/κ).
    const uxI = vx + k.R * (wy * k.s - wz * k.c);
    const uyI = -vy * k.s + wx * k.R;
    const uI2 = uxI * uxI + uyI * uyI;
    let pyI = 0;                                   // P_y'I — 아래 P_C 계산에 필요
    if (uI2 > 0) {
        const uI = Math.sqrt(uI2);
        const kappa = (KAPPA_TANGENT * uxI * uxI + k.kY * uyI * uyI) / uI2;
        const f = Math.min(k.muW * dP, (k.M * uI) / kappa);
        const pxI = (-f * uxI) / uI;
        pyI = (-f * uyI) / uI;
        // 식 3a, 3b: Y' = (0, −sinθ, cosθ) 라서 P_y'I 의 y 성분은 −P_y'I sinθ, z 성분은 테이블이 받는다.
        vx += pxI * k.invM;
        vy -= pyI * k.s * k.invM;
        // 식 4a–4c
        wx += k.rot * pyI;
        wy += k.rot * pxI * k.s;
        wz -= k.rot * pxI * k.c;
    }

    // 3) 테이블 접점 C. 법선 임펄스 P_C = P_I sinθ − P_y'I cosθ (식 3d, 8) 는 일을 하지 않고 마찰만 낳는다.
    //    음수면 공이 떠야 한다는 뜻인데 v2.0 은 z 운동이 없으니 0 으로 자른다.
    const pC = Math.max(0, dP * k.s - pyI * k.c);
    if (pC > 0) {
        const uxC = vx - wy * k.R;
        const uyC = vy + wx * k.R;
        const uC2 = uxC * uxC + uyC * uyC;
        if (uC2 > 0) {
            const uC = Math.sqrt(uC2);
            const f = Math.min(k.muS * pC, (k.M * uC) / KAPPA_TANGENT);
            const pxC = (-f * uxC) / uC;
            const pyC = (-f * uyC) / uC;
            vx += pxC * k.invM;
            vy += pyC * k.invM;
            wx += k.rot * pyC;
            wy -= k.rot * pxC;
        }
    }

    o.vx = vx; o.vy = vy; o.wx = wx; o.wy = wy; o.wz = wz;
}

/** 쿠션 프레임 (v_x, v_y, ω) 에 대해 압축·복원을 적분한 결과. 입력 레지스터를 새로 만들어 돌려준다. */
function solveCushionFrame(k: Consts, e: number, v0: Reg, steps: number): Reg {
    let cur: Reg = { vx: v0.vx, vy: v0.vy, wx: v0.wx, wy: v0.wy, wz: v0.wz, dW: 0 };
    let nxt: Reg = { vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, dW: 0 };
    let tmp: Reg;

    // 논문 §3.4: ΔP_I ≈ (1 + e_e) M V0 sinα / N 이면 N 스텝이 충돌 전체를 덮는다.
    const dP = ((1 + e) * k.M * cur.vy) / steps;
    // 마찰이 아주 커도 v_y 는 스텝당 최소 (cosθ − …)ΔP/M 씩 줄어 유한 스텝에 끝나지만, 병적인 파라미터를 위한 상한.
    const maxIter = 10 * steps + 16;

    // ── 압축: v_y ≤ 0 이 될 때까지. 넘는 스텝은 채택하지 않고 8 단계로 반씩 줄여 경계 직전까지 붙인다.
    let Wc = 0;
    for (let i = 0; i < maxIter; i++) {
        stepImpulse(k, cur, dP, nxt);
        if (nxt.vy <= 0) {
            let h = dP;
            for (let j = 0; j < REFINE_STEPS; j++) {
                h *= 0.5;
                stepImpulse(k, cur, h, nxt);
                if (nxt.vy <= 0) continue;         // 이 반 스텝은 아직 크다
                Wc += nxt.dW;
                tmp = cur; cur = nxt; nxt = tmp;
            }
            break;
        }
        Wc += nxt.dW;
        tmp = cur; cur = nxt; nxt = tmp;
    }

    // ── 복원: 법선 임펄스가 되돌려 주는 일이 e_e² W_c 에 닿을 때까지.
    const target = e * e * Wc;
    let Wr = 0;
    for (let i = 0; i < maxIter; i++) {
        stepImpulse(k, cur, dP, nxt);
        const dw = -nxt.dW;
        if (Wr + dw >= target) {
            // 남은 일 r 을 정확히 채우는 마지막 스텝 h: 사다리꼴 −ΔW(h) = c·a·h + c² h²/(2M), a = −v_y,전.
            // 양의 근 h = 2r / (c (a + √(a² + 2r/M))). a 가 아주 작은 음수(압축 잔차)여도 분모 > 0.
            const r = target - Wr;
            const a = -cur.vy;
            if (r > 0) {
                const h = (2 * r) / (k.c * (a + Math.sqrt(a * a + 2 * r * k.invM)));
                stepImpulse(k, cur, Math.min(h, dP), nxt);
                tmp = cur; cur = nxt; nxt = tmp;
            }
            break;
        }
        Wr += dw;
        tmp = cur; cur = nxt; nxt = tmp;
    }

    // 퇴화(W_c ≈ 0)로 복원이 사실상 없었을 때 압축 잔차 +ε 가 남아 쿠션 쪽으로 계속 가는 일이 없도록.
    if (cur.vy > 0) cur.vy = 0;
    return cur;
}

/**
 * Mathavan 2010 모델로 볼–쿠션 충돌을 해결한다. 입력은 변형하지 않고 새 BallState 를 돌려준다.
 *
 * @param b             충돌 순간의 공 (검출기가 코 라인까지 거리 R 인 시각에 전진시켜 둔 상태)
 * @param seg           맞은 쿠션 세그먼트. normal 은 테이블 안쪽 단위 법선
 * @param p             공 파라미터 — m, R, fC(μ_w), muS(μ_s), eC(e_e) 를 쓴다
 * @param cushionHeight 쿠션 코 높이 h (m). sinθ = (h − R)/R
 * @param steps         충돌 전체를 나누는 임펄스 스텝 수. 고정값이라 결과가 결정론적이다
 */
export function resolveCushionMathavan(
    b: BallState,
    seg: CushionSegment,
    p: BallParams,
    cushionHeight: number,
    steps = 2000,
): BallState {
    // ── 쿠션 프레임: ŷ' 는 공에서 쿠션으로(= −normal), x̂' = ŷ' × ẑ 로 오른손 좌표계. 축 정렬 법선이면 정확한 회전.
    const nx0 = seg.normal[0], ny0 = seg.normal[1];
    const nLen = Math.sqrt(nx0 * nx0 + ny0 * ny0);
    if (!(nLen > 0)) {
        return { id: b.id, r: [b.r[0], b.r[1], b.r[2]], v: [b.v[0], b.v[1], 0], w: [b.w[0], b.w[1], b.w[2]], state: "sliding" };
    }
    const nx = nx0 / nLen, ny = ny0 / nLen;
    const xhx = -ny, xhy = nx;        // x̂'
    const yhx = -nx, yhy = -ny;       // ŷ'

    const v0: Reg = {
        vx: b.v[0] * xhx + b.v[1] * xhy,
        vy: b.v[0] * yhx + b.v[1] * yhy,
        wx: b.w[0] * xhx + b.w[1] * xhy,
        wy: b.w[0] * yhx + b.w[1] * yhy,
        wz: b.w[2],
        dW: 0,
    };

    // 쿠션 쪽으로 움직이지 않으면 충돌이 아니다. 검출기가 걸러 주지만 방어적으로 그대로 돌려준다.
    if (!(v0.vy > 0)) {
        return { id: b.id, r: [b.r[0], b.r[1], b.r[2]], v: [b.v[0], b.v[1], 0], w: [b.w[0], b.w[1], b.w[2]], state: "sliding" };
    }

    // sinθ = (h − R)/R. |sinθ| → 1 이면 cosθ → 0 으로 법선 임펄스가 v_y 를 못 줄여 발산하므로 안전 범위로 자른다.
    const sRaw = (cushionHeight - p.R) / p.R;
    const s = Math.max(-0.99, Math.min(0.99, sRaw));
    const c = Math.sqrt(1 - s * s);
    const k: Consts = {
        M: p.m,
        R: p.R,
        invM: 1 / p.m,
        rot: 5 / (2 * p.m * p.R),
        s,
        c,
        muW: p.fC,
        muS: p.muS,
        kY: s * s + 2.5,
    };
    const n = Math.max(1, Math.floor(steps));
    const out = solveCushionFrame(k, p.eC, v0, n);

    // ── 테이블 프레임으로 되돌리기: v = v_x' x̂' + v_y' ŷ'
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v: [out.vx * xhx + out.vy * yhx, out.vx * xhy + out.vy * yhy, 0],
        w: [out.wx * xhx + out.wy * yhx, out.wx * xhy + out.wy * yhy, out.wz],
        state: "sliding",
    };
}
