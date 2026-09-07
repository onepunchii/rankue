/**
 * 4차 방정식 a t⁴ + b t³ + c t² + d t + e = 0 의 실근 — Algorithm 1010 의 이식.
 *
 * Orellana & De Michele, "Algorithm 1010: Boosting Efficiency in Solving Quartic Equations with No
 * Compromise in Accuracy", ACM TOMS 46(2), 2020. 구조는 pooltool ptmath/roots/_quartic_numba.py
 * (Apache-2.0, 원 C 코드의 파이썬 이식) 를 그대로 따른다:
 *
 *   1. 모닉화 후 resolvent 3차식의 최대 절대값 실근 φ₀ 를 구하고 Newton 으로 다듬는다 (calcPhi0).
 *   2. 4차식을 LDLᵀ 로 두 2차식의 곱으로 분해한다. d₂ 의 부호가 두 2차식이 실계수인지(d₂<0),
 *      켤레 복소 계수인지(d₂>0) 정한다. d₂ 후보 세 가지 중 잔차가 가장 작은 것을 고른다.
 *   3. |d₂| 가 반올림 수준이면 (pooltool 의 d2_safety_factor=100 으로 완화한 문턱) 퇴화 분해
 *      (aq = cq = l₁) 를 따로 만들어 두 분해의 잔차를 비교해 작은 쪽을 택한다. 속도가 거의 같은 두 공
 *      (뉴턴의 요람) 에서 중근이 네 개의 서로 다른 근으로 잘못 갈라지는 것을 막는다.
 *   4. 실계수 분해면 계수 넷을 Newton–Raphson 으로 정제(NRabcd) 한 뒤 두 2차식을 푼다.
 *      복소계수 분해면 복소 2차식을 직접 푼다.
 *   5. 결과 복소근 중 isRealRoot(허부 ≤ 1e-9 등) 를 통과한 것만 실근으로 돌려준다.
 *
 * 이 폴더의 절대 규칙(초월함수 금지) 때문에 원 알고리즘의 acos/cos/pow(1/3) 를 다음으로 대체했다:
 *   - 3차식의 세 실근 경우(R² < Q³): 삼각 공식 −2√Q cos(θ/3) 대신 x = 2√Q·s·u 로 두고
 *     체비쇼프 방정식 4u³ − 3u = |R|/Q^{3/2} 의 최대근 u ∈ [√3/2, 1] 을 u=1 에서 Newton 으로 구한다.
 *     f 가 [½, ∞) 에서 볼록·증가이고 최대근은 항상 단근(f′ ≥ 6) 이라 위에서 단조·2차 수렴한다.
 *     원 알고리즘도 이 값을 Newton 으로 다듬으므로 결과는 동일한 정밀도다.
 *   - 세제곱근: dmath.cbrt (fdlibm 순수 산술 포팅, < 1 ulp). 원문의 pow(x, 1/3) 보다 오히려 정확하다.
 *
 * 절대 규칙: 입력 불변, Math.* 초월함수 금지, 결정론(모든 연산이 IEEE 기본 연산).
 */
import { cbrt } from "../dmath.js";
import { isRealRoot, MACHEPS, sortedAscending } from "./common.js";
import { solveQuadratic } from "./quadratic.js";

const CUBIC_RESCAL_FACT = 3.488062113727083e102;
const QUART_RESCAL_FACT = 7.156344627944542e76;
/** pooltool 의 완화 계수. 원 알고리즘은 macheps 그대로였다. */
const D2_SAFETY_FACTOR = 100;

// ---------------------------------------------------------------------------
// 순수 산술 보조
// ---------------------------------------------------------------------------

/** C 의 copysign(mag, s): |mag| 에 s 의 부호(−0 포함)를 붙인다. */
function copysign(mag: number, s: number): number {
    const neg = s < 0 || (s === 0 && 1 / s < 0);
    return neg ? -Math.abs(mag) : Math.abs(mag);
}

/**
 * 4u³ − 3u = m (0 ≤ m ≲ 1) 의 최대 실근. 삼각 공식 cos(acos(m)/3) 과 같은 값이다.
 * u=1 에서 시작하는 Newton: f(1) = 1 − m ≥ 0 이고 f 는 [½, ∞) 에서 볼록·증가라 위에서 단조 수렴.
 * m 이 반올림으로 1 을 살짝 넘어도 (f(1) < 0) 볼록성 덕에 한 번 위로 튄 뒤 단조 수렴한다.
 */
function chebyshevMaxRoot(m: number): number {
    let u = 1;
    for (let i = 0; i < 24; i++) {
        const f = (4 * u * u - 3) * u - m;
        const df = 12 * u * u - 3;
        const step = f / df;
        const next = u - step;
        if (next === u) break;
        u = next;
    }
    return u;
}

// ---------------------------------------------------------------------------
// 복소수 (re, im) 쌍 — 배열 할당을 피하려고 두 수를 따로 다룬다
// ---------------------------------------------------------------------------

function cabs(re: number, im: number): number {
    return Math.sqrt(re * re + im * im);
}

/** 주값 복소 제곱근. 결과는 [re, im]. */
function csqrt(re: number, im: number): [number, number] {
    if (re === 0 && im === 0) return [0, 0];
    const r = cabs(re, im);
    if (re >= 0) {
        const t = Math.sqrt(0.5 * (r + re));
        return [t, im / (2 * t)];
    }
    const t = Math.sqrt(0.5 * (r - re));
    const s = im < 0 ? -t : t;
    return [im / (2 * s), s];
}

/** 복소 나눗셈 (a + bi)/(c + di), Smith 방식. 결과는 [re, im]. */
function cdiv(a: number, b: number, c: number, d: number): [number, number] {
    if (Math.abs(c) >= Math.abs(d)) {
        const r = d / c;
        const den = c + d * r;
        return [(a + b * r) / den, (b - a * r) / den];
    }
    const r = c / d;
    const den = c * r + d;
    return [(a * r + b) / den, (b * r - a) / den];
}

// ---------------------------------------------------------------------------
// resolvent 3차식 x³ + b x + c = 0 의 최대 절대값 실근
// (pooltool oqs_solve_cubic_analytic_depressed / _handle_inf)
// ---------------------------------------------------------------------------

/** Q, R 이 매우 커서 Q³·R² 이 넘칠 때의 경로. */
function solveCubicDepressedHandleInf(b: number, c: number): number {
    const Q = -b / 3;
    const R = 0.5 * c;
    if (R === 0) {
        return b <= 0 ? Math.sqrt(-b) : 0;
    }
    let KK: number;
    if (Math.abs(Q) < Math.abs(R)) {
        const QR = Q / R;
        KK = 1 - Q * (QR * QR);
    } else {
        const RQ = R / Q;
        KK = copysign(1, Q) * ((RQ * RQ) / Q - 1);
    }
    if (KK < 0) {
        // 세 실근: KK < 0 ⇔ R² < Q³ (따라서 Q > 0). 최대 절대값 근 = ±2√Q·u, u = 체비쇼프 최대근
        const sqrtQ = Math.sqrt(Q);
        const m = R / Math.abs(Q) / sqrtQ; // cos θ
        const u = chebyshevMaxRoot(Math.abs(m));
        return (R <= 0 ? 1 : -1) * 2 * sqrtQ * u;
    }
    let A: number;
    if (Math.abs(Q) < Math.abs(R)) {
        A = -copysign(1, R) * cbrt(Math.abs(R) * (1 + Math.sqrt(KK)));
    } else {
        A = -copysign(1, R) * cbrt(Math.abs(R) + Math.sqrt(Math.abs(Q)) * Math.abs(Q) * Math.sqrt(KK));
    }
    const B = A === 0 ? 0 : Q / A;
    return A + B;
}

function solveCubicDepressed(b: number, c: number): number {
    const Q = -b / 3;
    const R = 0.5 * c;
    if (Math.abs(Q) > 1e102 || Math.abs(R) > 1e154) {
        return solveCubicDepressedHandleInf(b, c);
    }
    const Q3 = Q * Q * Q;
    const R2 = R * R;
    if (R2 < Q3) {
        // 세 실근 (Q > 0). 원문: θ = acos(R/√Q³), sol = −2√Q cos(θ/3) (θ<π/2) 또는 −2√Q cos((θ+2π)/3).
        // 두 경우 모두 절대값이 가장 큰 근이며, 부호는 R ≤ 0 이면 +, R > 0 이면 −.
        const m = R / Math.sqrt(Q3);
        const u = chebyshevMaxRoot(Math.abs(m));
        return (R <= 0 ? 1 : -1) * 2 * Math.sqrt(Q) * u;
    }
    const A = -copysign(1, R) * cbrt(Math.abs(R) + Math.sqrt(R2 - Q3));
    const B = A === 0 ? 0 : Q / A;
    return A + B;
}

// ---------------------------------------------------------------------------
// φ₀ — resolvent 3차식의 근 (pooltool oqs_calc_phi0)
// ---------------------------------------------------------------------------

function calcPhi0(a: number, b: number, c: number, d: number, scaled: boolean): number {
    // 평행이동 s 로 3차항을 줄여 계수 오차를 낮춘다
    let diskr = 9 * a * a - 24 * b;
    let s: number;
    if (diskr > 0) {
        diskr = Math.sqrt(diskr);
        s = a > 0 ? (-2 * b) / (3 * a + diskr) : (-2 * b) / (3 * a - diskr);
    } else {
        s = -a / 4;
    }
    const aq = a + 4 * s;
    const bq = b + 3 * s * (a + 2 * s);
    const cq = c + s * (2 * b + s * (3 * a + 4 * s));
    const dq = d + s * (c + s * (b + s * (a + s)));
    const gg = (bq * bq) / 9;
    const hh = aq * cq;

    let g = hh - 4 * dq - 3 * gg;
    let h = ((8 * dq + hh - 2 * gg) * bq) / 3 - cq * cq - dq * aq * aq;
    let rmax = solveCubicDepressed(g, h);
    if (!Number.isFinite(rmax)) {
        rmax = solveCubicDepressedHandleInf(g, h);
        if (!Number.isFinite(rmax) && scaled) {
            // 계수를 큰 상수로 나눠 다시 시도한다
            const rfact = CUBIC_RESCAL_FACT;
            const rfactsq = rfact * rfact;
            const dqss = dq / rfactsq;
            const aqs = aq / rfact;
            const bqs = bq / rfact;
            const cqs = cq / rfact;
            const ggss = (bqs * bqs) / 9;
            const hhss = aqs * cqs;
            g = hhss - 4 * dqss - 3 * ggss;
            h = ((8 * dqss + hhss - 2 * ggss) * bqs) / 3 - cqs * (cqs / rfact) - (dq / rfact) * aqs * aqs;
            rmax = solveCubicDepressed(g, h);
            if (!Number.isFinite(rmax)) {
                rmax = solveCubicDepressedHandleInf(g, h);
            }
            rmax *= rfact;
        }
    }

    // Newton 으로 다듬기: f(x) = x³ + g x + h. 잔차가 줄지 않으면 되돌리고 멈춘다.
    let x = rmax;
    let xsq = x * x;
    const xxx = x * xsq;
    const gx = g * x;
    let f = x * (xsq + g) + h;
    let maxtt = Math.abs(xxx) > Math.abs(gx) ? Math.abs(xxx) : Math.abs(gx);
    maxtt = Math.max(maxtt, Math.abs(h));
    if (Math.abs(f) > MACHEPS * maxtt) {
        for (let iter = 0; iter < 8; iter++) {
            const df = 3 * xsq + g;
            if (df === 0) break;
            const xold = x;
            x += -f / df;
            const fold = f;
            xsq = x * x;
            f = x * (xsq + g) + h;
            if (f === 0) break;
            if (Math.abs(f) >= Math.abs(fold)) {
                x = xold;
                break;
            }
        }
    }
    return x;
}

// ---------------------------------------------------------------------------
// 잔차 함수들 — 분해 후보 사이의 상대 오차 비교용 (pooltool oqs_calc_err_*)
// ---------------------------------------------------------------------------

function relErr(val: number, ref: number): number {
    return ref === 0 ? Math.abs(val) : Math.abs((val - ref) / ref);
}

function errLdlt(b: number, c: number, d: number, d2: number, l1: number, l2: number, l3: number): number {
    return (
        relErr(d2 + l1 * l1 + 2 * l3, b) +
        relErr(2 * d2 * l2 + 2 * l1 * l3, c) +
        relErr(d2 * l2 * l2 + l3 * l3, d)
    );
}

/** 실계수 분해 (t² + aq t + bq)(t² + cq t + dq) 의 네 계수 잔차. */
function errAbcd(a: number, b: number, c: number, d: number, aq: number, bq: number, cq: number, dq: number): number {
    return (
        relErr(bq * dq, d) +
        relErr(bq * cq + aq * dq, c) +
        relErr(bq + aq * cq + dq, b) +
        relErr(aq + cq, a)
    );
}

/** 복소계수 분해의 잔차. 계수는 (re, im) 쌍. 잔차는 복소 절대값. */
function errAbcdCmplx(
    a: number, b: number, c: number, d: number,
    aqr: number, aqi: number, bqr: number, bqi: number,
    cqr: number, cqi: number, dqr: number, dqi: number,
): number {
    // bq·dq
    const p0r = bqr * dqr - bqi * dqi;
    const p0i = bqr * dqi + bqi * dqr;
    // bq·cq + aq·dq
    const p1r = bqr * cqr - bqi * cqi + (aqr * dqr - aqi * dqi);
    const p1i = bqr * cqi + bqi * cqr + (aqr * dqi + aqi * dqr);
    // bq + aq·cq + dq
    const p2r = bqr + (aqr * cqr - aqi * cqi) + dqr;
    const p2i = bqi + (aqr * cqi + aqi * cqr) + dqi;
    // aq + cq
    const p3r = aqr + cqr;
    const p3i = aqi + cqi;
    let sum = d === 0 ? cabs(p0r, p0i) : cabs(p0r - d, p0i) / Math.abs(d);
    sum += c === 0 ? cabs(p1r, p1i) : cabs(p1r - c, p1i) / Math.abs(c);
    sum += b === 0 ? cabs(p2r, p2i) : cabs(p2r - b, p2i) / Math.abs(b);
    sum += a === 0 ? cabs(p3r, p3i) : cabs(p3r - a, p3i) / Math.abs(a);
    return sum;
}

/** 실계수 분해에서 한 계수를 세 가지 식으로 구할 때의 잔차 (d 항 제외). */
function errAbc(a: number, b: number, c: number, aq: number, bq: number, cq: number, dq: number): number {
    return relErr(bq * cq + aq * dq, c) + relErr(bq + aq * cq + dq, b) + relErr(aq + cq, a);
}

// ---------------------------------------------------------------------------
// 실계수 분해의 Newton–Raphson 정제 (pooltool oqs_NRabcd)
// ---------------------------------------------------------------------------

function nrAbcd(
    a: number, b: number, c: number, d: number,
    AQ: number, BQ: number, CQ: number, DQ: number,
): [number, number, number, number] {
    let x0 = AQ, x1 = BQ, x2 = CQ, x3 = DQ;

    let f0 = x1 * x3 - d;
    let f1 = x1 * x2 + x0 * x3 - c;
    let f2 = x1 + x0 * x2 + x3 - b;
    let f3 = x0 + x2 - a;

    const errOf = (): number =>
        (d === 0 ? Math.abs(f0) : Math.abs(f0 / d)) +
        (c === 0 ? Math.abs(f1) : Math.abs(f1 / c)) +
        (b === 0 ? Math.abs(f2) : Math.abs(f2 / b)) +
        (a === 0 ? Math.abs(f3) : Math.abs(f3 / a));

    let errf = errOf();

    for (let iter = 0; iter < 8; iter++) {
        const x02 = x0 - x2;
        const det = x1 * x1 + x1 * (-x2 * x02 - 2 * x3) + x3 * (x0 * x02 + x3);
        if (det === 0) break;

        // 야코비 역행렬 × det 의 닫힌 식
        const J00 = x02;
        const J01 = x3 - x1;
        const J02 = x1 * x2 - x0 * x3;
        const J03 = -x1 * J01 - x0 * J02;
        const J10 = x0 * J00 + J01;
        const J11 = -x1 * J00;
        const J12 = -x1 * J01;
        const J13 = -x1 * J02;
        const J20 = -J00;
        const J21 = -J01;
        const J22 = -J02;
        const J23 = J02 * x2 + J01 * x3;
        const J30 = -x2 * J00 - J01;
        const J31 = J00 * x3;
        const J32 = x3 * J01;
        const J33 = x3 * J02;

        const dx0 = J00 * f0 + J01 * f1 + J02 * f2 + J03 * f3;
        const dx1 = J10 * f0 + J11 * f1 + J12 * f2 + J13 * f3;
        const dx2 = J20 * f0 + J21 * f1 + J22 * f2 + J23 * f3;
        const dx3 = J30 * f0 + J31 * f1 + J32 * f2 + J33 * f3;

        const o0 = x0, o1 = x1, o2 = x2, o3 = x3;
        x0 += -dx0 / det;
        x1 += -dx1 / det;
        x2 += -dx2 / det;
        x3 += -dx3 / det;

        f0 = x1 * x3 - d;
        f1 = x1 * x2 + x0 * x3 - c;
        f2 = x1 + x0 * x2 + x3 - b;
        f3 = x0 + x2 - a;

        const errfold = errf;
        errf = errOf();
        if (errf === 0) break;
        if (errf >= errfold) {
            x0 = o0; x1 = o1; x2 = o2; x3 = o3;
            break;
        }
    }
    return [x0, x1, x2, x3];
}

/** 모닉 2차식 t² + a t + b 의 두 (복소)근을 out[i..i+3] 에 (re, im, re, im) 로 쓴다. (pooltool oqs_solve_quadratic) */
function monicQuadraticInto(a: number, b: number, out: Float64Array, i: number): void {
    const diskr = a * a - 4 * b;
    if (diskr >= 0) {
        const div = a >= 0 ? -a - Math.sqrt(diskr) : -a + Math.sqrt(diskr);
        const zmax = div / 2;
        const zmin = zmax === 0 ? 0 : b / zmax;
        out[i] = zmax; out[i + 1] = 0;
        out[i + 2] = zmin; out[i + 3] = 0;
    } else {
        const sqrtd = Math.sqrt(-diskr);
        out[i] = -a / 2; out[i + 1] = sqrtd / 2;
        out[i + 2] = -a / 2; out[i + 3] = -sqrtd / 2;
    }
}

// ---------------------------------------------------------------------------
// 진짜 4차식 (a ≠ 0) 의 복소근 넷
// ---------------------------------------------------------------------------

/**
 * a ≠ 0 인 4차식의 네 복소근을 (re, im) × 4 = 길이 8 의 Float64Array 로 돌려준다.
 * pooltool `_quartic_numba.solve` 의 본체.
 */
export function quarticComplexRoots(a: number, b: number, c: number, d: number, e: number): Float64Array {
    const roots = new Float64Array(8);

    let a_p = b / a;
    let b_p = c / a;
    let c_p = d / a;
    let d_p = e / a;
    let phi0 = calcPhi0(a_p, b_p, c_p, d_p, false);

    let rfact = 1;
    if (!Number.isFinite(phi0)) {
        // 계수가 너무 커서 넘침 — 근을 rfact 로 스케일한 4차식으로 다시 푼다
        rfact = QUART_RESCAL_FACT;
        a_p /= rfact;
        const rfactsq = rfact * rfact;
        b_p /= rfactsq;
        c_p /= rfactsq * rfact;
        d_p /= rfactsq * rfactsq;
        phi0 = calcPhi0(a_p, b_p, c_p, d_p, true);
    }

    // LDLᵀ 분해의 l₁, l₃, 그리고 d₂·l₂ 후보들
    const l1 = a_p / 2;
    const l3 = b_p / 6 + phi0 / 2;
    const del2 = c_p - a_p * l3;
    const bl311 = (2 * b_p) / 3 - phi0 - l1 * l1;
    const dml3l3 = d_p - l3 * l3;

    let nsol = 0;
    let d2m0 = 0, d2m1 = 0, d2m2 = 0;
    let l2m0 = 0, l2m1 = 0, l2m2 = 0;
    let res0 = 0, res1 = 0, res2 = 0;

    if (bl311 !== 0) {
        d2m0 = bl311;
        l2m0 = del2 / (2 * d2m0);
        res0 = errLdlt(b_p, c_p, d_p, d2m0, l1, l2m0, l3);
        nsol = 1;
    }
    if (del2 !== 0) {
        if (nsol === 0) {
            l2m0 = (2 * dml3l3) / del2;
            if (l2m0 !== 0) {
                d2m0 = del2 / (2 * l2m0);
                res0 = errLdlt(b_p, c_p, d_p, d2m0, l1, l2m0, l3);
                nsol = 1;
            }
        } else if (nsol === 1) {
            l2m1 = (2 * dml3l3) / del2;
            if (l2m1 !== 0) {
                d2m1 = del2 / (2 * l2m1);
                res1 = errLdlt(b_p, c_p, d_p, d2m1, l1, l2m1, l3);
                nsol = 2;
            }
        }
        if (nsol === 1) {
            d2m1 = bl311;
            l2m1 = (2 * dml3l3) / del2;
            res1 = errLdlt(b_p, c_p, d_p, d2m1, l1, l2m1, l3);
            nsol = 2;
        } else if (nsol === 2) {
            d2m2 = bl311;
            l2m2 = (2 * dml3l3) / del2;
            res2 = errLdlt(b_p, c_p, d_p, d2m2, l1, l2m2, l3);
            nsol = 3;
        }
    }

    let d2: number, l2: number;
    if (nsol === 0) {
        d2 = 0; l2 = 0;
    } else if (nsol === 1) {
        d2 = d2m0; l2 = l2m0;
    } else if (nsol === 2) {
        if (res0 <= res1) { d2 = d2m0; l2 = l2m0; } else { d2 = d2m1; l2 = l2m1; }
    } else if (res0 <= res1 && res0 <= res2) {
        d2 = d2m0; l2 = l2m0;
    } else if (res1 <= res2) {
        d2 = d2m1; l2 = l2m1;
    } else {
        d2 = d2m2; l2 = l2m2;
    }

    // realcase: 1 = 실계수 분해, 0 = 복소계수 분해, −1 = 미정(d₂ = 0)
    let whichcase = 0;
    let realcase0 = -1;
    let realcase1 = -1;
    let aq = 0, bq = 0, cq = 0, dq = 0;
    let aq1 = 0, bq1 = 0, cq1 = 0, dq1 = 0;
    let acxr = 0, acxi = 0, bcxr = 0, bcxi = 0, ccxr = 0, ccxi = 0, dcxr = 0, dcxi = 0;
    let acx1r = 0, acx1i = 0, bcx1r = 0, bcx1i = 0, ccx1r = 0, ccx1i = 0, dcx1r = 0, dcx1i = 0;
    let err0 = 0, err1 = 0;

    if (d2 < 0) {
        // 두 실계수 2차식 (t² + aq t + bq)(t² + cq t + dq)
        const gamma = Math.sqrt(-d2);
        aq = l1 + gamma;
        bq = l3 + gamma * l2;
        cq = l1 - gamma;
        dq = l3 - gamma * l2;
        // 상수항은 곱 항등식 bq·dq = d 로 더 정확한 쪽을 다시 계산
        if (Math.abs(dq) < Math.abs(bq)) {
            dq = d_p / bq;
        } else if (Math.abs(dq) > Math.abs(bq)) {
            bq = d_p / dq;
        }
        // 작은 쪽 1차 계수는 세 가지 식 중 잔차가 가장 작은 것으로
        if (Math.abs(aq) < Math.abs(cq)) {
            let v0 = 0, v1 = 0, v2 = 0, e0 = 0, e1 = 0, e2 = 0;
            let n = 0;
            if (dq !== 0) {
                v0 = (c_p - bq * cq) / dq;
                e0 = errAbc(a_p, b_p, c_p, v0, bq, cq, dq);
                n = 1;
            }
            if (cq !== 0) {
                if (n === 0) {
                    v0 = (b_p - dq - bq) / cq;
                    e0 = errAbc(a_p, b_p, c_p, v0, bq, cq, dq);
                    n = 1;
                } else {
                    v1 = (b_p - dq - bq) / cq;
                    e1 = errAbc(a_p, b_p, c_p, v1, bq, cq, dq);
                    n = 2;
                }
            }
            if (n === 0) {
                aq = a_p - cq;
            } else if (n === 1) {
                v1 = a_p - cq;
                e1 = errAbc(a_p, b_p, c_p, v1, bq, cq, dq);
                aq = e0 <= e1 ? v0 : v1;
            } else {
                v2 = a_p - cq;
                e2 = errAbc(a_p, b_p, c_p, v2, bq, cq, dq);
                if (e0 <= e1 && e0 <= e2) aq = v0;
                else if (e1 <= e2) aq = v1;
                else aq = v2;
            }
        } else {
            let v0 = 0, v1 = 0, v2 = 0, e0 = 0, e1 = 0, e2 = 0;
            let n = 0;
            if (bq !== 0) {
                v0 = (c_p - aq * dq) / bq;
                e0 = errAbc(a_p, b_p, c_p, aq, bq, v0, dq);
                n = 1;
            }
            if (aq !== 0) {
                if (n === 0) {
                    v0 = (b_p - bq - dq) / aq;
                    e0 = errAbc(a_p, b_p, c_p, aq, bq, v0, dq);
                    n = 1;
                } else {
                    v1 = (b_p - bq - dq) / aq;
                    e1 = errAbc(a_p, b_p, c_p, aq, bq, v1, dq);
                    n = 2;
                }
            }
            if (n === 0) {
                cq = a_p - aq;
            } else if (n === 1) {
                v1 = a_p - aq;
                e1 = errAbc(a_p, b_p, c_p, aq, bq, v1, dq);
                cq = e0 <= e1 ? v0 : v1;
            } else {
                v2 = a_p - aq;
                e2 = errAbc(a_p, b_p, c_p, aq, bq, v2, dq);
                if (e0 <= e1 && e0 <= e2) cq = v0;
                else if (e1 <= e2) cq = v1;
                else cq = v2;
            }
        }
        realcase0 = 1;
    } else if (d2 > 0) {
        // 켤레 복소계수 2차식 (t² + acx t + bcx)(t² + conj(acx) t + conj(bcx))
        const gamma = Math.sqrt(d2);
        acxr = l1; acxi = gamma;
        bcxr = l3; bcxi = gamma * l2;
        ccxr = acxr; ccxi = -acxi;
        dcxr = bcxr; dcxi = -bcxi;
        realcase0 = 0;
    } else {
        realcase0 = -1;
    }

    // d₂ 가 반올림 수준이면 퇴화 분해(aq = cq = l₁) 도 만들어 잔차가 작은 쪽을 택한다
    if (
        realcase0 === -1 ||
        Math.abs(d2) <= D2_SAFETY_FACTOR * MACHEPS * Math.max(Math.abs((2 * b_p) / 3), Math.abs(phi0), l1 * l1)
    ) {
        const d3 = d_p - l3 * l3;
        if (realcase0 === 1) {
            err0 = errAbcd(a_p, b_p, c_p, d_p, aq, bq, cq, dq);
        } else if (realcase0 === 0) {
            err0 = errAbcdCmplx(a_p, b_p, c_p, d_p, acxr, acxi, bcxr, bcxi, ccxr, ccxi, dcxr, dcxi);
        }
        if (d3 <= 0) {
            realcase1 = 1;
            aq1 = l1;
            bq1 = l3 + Math.sqrt(-d3);
            cq1 = l1;
            dq1 = l3 - Math.sqrt(-d3);
            if (Math.abs(dq1) < Math.abs(bq1)) {
                dq1 = d_p / bq1;
            } else if (Math.abs(dq1) > Math.abs(bq1)) {
                bq1 = d_p / dq1;
            }
            err1 = errAbcd(a_p, b_p, c_p, d_p, aq1, bq1, cq1, dq1);
        } else {
            realcase1 = 0;
            acx1r = l1; acx1i = 0;
            bcx1r = l3; bcx1i = Math.sqrt(d3);
            ccx1r = l1; ccx1i = 0;
            dcx1r = bcx1r; dcx1i = -bcx1i;
            err1 = errAbcdCmplx(a_p, b_p, c_p, d_p, acx1r, acx1i, bcx1r, bcx1i, ccx1r, ccx1i, dcx1r, dcx1i);
        }
        if (realcase0 === -1 || err1 < err0) {
            whichcase = 1;
            if (realcase1 === 1) {
                aq = aq1; bq = bq1; cq = cq1; dq = dq1;
            } else {
                acxr = acx1r; acxi = acx1i; bcxr = bcx1r; bcxi = bcx1i;
                ccxr = ccx1r; ccxi = ccx1i; dcxr = dcx1r; dcxi = dcx1i;
            }
        }
    }

    if ((whichcase === 0 && realcase0 === 1) || (whichcase === 1 && realcase1 === 1)) {
        // 실계수 분해: Newton 정제 후 두 2차식을 푼다
        const nr = nrAbcd(a_p, b_p, c_p, d_p, aq, bq, cq, dq);
        monicQuadraticInto(nr[0], nr[1], roots, 0);
        monicQuadraticInto(nr[2], nr[3], roots, 4);
    } else if (whichcase === 0) {
        // 켤레 복소계수 분해: t² + acx t + bcx 의 두 근과 그 켤레
        // cdiskr = acx²/4 − bcx
        const cdr = (acxr * acxr - acxi * acxi) / 4 - bcxr;
        const cdi = (2 * acxr * acxi) / 4 - bcxi;
        const [sr, si] = csqrt(cdr, cdi);
        const z1r = -acxr / 2 + sr, z1i = -acxi / 2 + si;
        const z2r = -acxr / 2 - sr, z2i = -acxi / 2 - si;
        let zmr: number, zmi: number;
        if (cabs(z1r, z1i) > cabs(z2r, z2i)) { zmr = z1r; zmi = z1i; } else { zmr = z2r; zmi = z2i; }
        const [znr, zni] = cdiv(bcxr, bcxi, zmr, zmi);
        roots[0] = znr; roots[1] = zni;
        roots[2] = znr; roots[3] = -zni;
        roots[4] = zmr; roots[5] = zmi;
        roots[6] = zmr; roots[7] = -zmi;
    } else {
        // 퇴화 복소 분해: (t² + acx t + bcx)(t² + ccx t + dcx) 를 각각 푼다
        {
            const cdr = acxr * acxr - acxi * acxi - 4 * bcxr;
            const cdi = 2 * acxr * acxi - 4 * bcxi;
            const [sr, si] = csqrt(cdr, cdi);
            const z1r = -0.5 * (acxr + sr), z1i = -0.5 * (acxi + si);
            const z2r = -0.5 * (acxr - sr), z2i = -0.5 * (acxi - si);
            let zmr: number, zmi: number;
            if (cabs(z1r, z1i) > cabs(z2r, z2i)) { zmr = z1r; zmi = z1i; } else { zmr = z2r; zmi = z2i; }
            const [znr, zni] = cdiv(bcxr, bcxi, zmr, zmi);
            roots[0] = zmr; roots[1] = zmi;
            roots[2] = znr; roots[3] = zni;
        }
        {
            const cdr = ccxr * ccxr - ccxi * ccxi - 4 * dcxr;
            const cdi = 2 * ccxr * ccxi - 4 * dcxi;
            const [sr, si] = csqrt(cdr, cdi);
            const z1r = -0.5 * (ccxr + sr), z1i = -0.5 * (ccxi + si);
            const z2r = -0.5 * (ccxr - sr), z2i = -0.5 * (ccxi - si);
            let zmr: number, zmi: number;
            if (cabs(z1r, z1i) > cabs(z2r, z2i)) { zmr = z1r; zmi = z1i; } else { zmr = z2r; zmi = z2i; }
            const [znr, zni] = cdiv(dcxr, dcxi, zmr, zmi);
            roots[4] = zmr; roots[5] = zmi;
            roots[6] = znr; roots[7] = zni;
        }
    }

    if (rfact !== 1) {
        for (let k = 0; k < 8; k++) roots[k] *= rfact;
    }
    return roots;
}

// ---------------------------------------------------------------------------
// 3차식 (a = 0, b ≠ 0) — 계약상의 강등 경로. 충돌 감지에서는 a = 0 ⇒ b = 0 이라 실제로는 거의 안 탄다.
// ---------------------------------------------------------------------------

/**
 * b t³ + c t² + d t + e = 0 의 실근, 오름차순.
 * 모닉·평행이동으로 내린 3차식의 최대 절대값 실근을 구해 Newton 으로 다듬고, 후진 수축(backward deflation:
 * 최대 절대값 근을 뺄 때 안정)으로 2차식을 얻어 나머지 근을 구한다. 각 근은 원 3차식에서 한 번 더 다듬는다.
 */
export function solveCubic(b: number, c: number, d: number, e: number): number[] {
    if (b === 0) return solveQuadratic(c, d, e);
    const p = c / b;
    const q = d / b;
    const r = e / b;
    // t = x − p/3 → x³ + P x + Q0 = 0
    const P = q - (p * p) / 3;
    const Q0 = (2 * p * p * p) / 27 - (p * q) / 3 + r;
    const x1 = solveCubicDepressed(P, Q0);
    const f = (t: number): number => ((t + p) * t + q) * t + r;
    const df = (t: number): number => (3 * t + 2 * p) * t + q;
    const polish = (t: number): number => {
        let ft = Math.abs(f(t));
        for (let i = 0; i < 8 && ft !== 0; i++) {
            const der = df(t);
            if (der === 0) break;
            const tn = t - f(t) / der;
            const fn = Math.abs(f(tn));
            if (fn >= ft) break;
            t = tn;
            ft = fn;
        }
        return t;
    };
    const t1 = polish(x1 - p / 3);

    let B: number, C: number;
    if (t1 === 0) {
        B = p;
        C = q;
    } else {
        // (t − t1)(t² + B t + C): C = −r/t1, q = C − B t1 → B = (C − q)/t1
        C = -r / t1;
        B = (C - q) / t1;
    }
    const rest = solveQuadratic(1, B, C).map(polish);
    return sortedAscending([t1, ...rest]);
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * a t⁴ + b t³ + c t² + d t + e = 0 의 실근만, 오름차순. 중근은 중복해서 들어간다.
 * a = 0 이면 3차, a = b = 0 이면 2차, … 로 강등한다. 계수에 NaN/∞ 가 있으면 [].
 */
export function solveQuartic(a: number, b: number, c: number, d: number, e: number): number[] {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d) || !Number.isFinite(e)) {
        return [];
    }
    if (a === 0) return solveCubic(b, c, d, e);
    const z = quarticComplexRoots(a, b, c, d, e);
    const out: number[] = [];
    for (let k = 0; k < 8; k += 2) {
        if (Number.isFinite(z[k]) && isRealRoot(z[k], z[k + 1])) out.push(z[k]);
    }
    return sortedAscending(out);
}

/** eps 보다 큰 근 중 가장 작은 것. 없으면 Infinity. 입력은 건드리지 않는다. */
export function smallestPositiveRoot(roots: readonly number[], eps = 1e-9): number {
    let best = Infinity;
    for (let i = 0; i < roots.length; i++) {
        const r = roots[i];
        if (r > eps && r < best) best = r;
    }
    return best;
}
