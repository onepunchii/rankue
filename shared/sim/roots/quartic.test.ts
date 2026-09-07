import { describe, expect, it } from "vitest";
import { quarticComplexRoots, smallestPositiveRoot, solveCubic, solveQuartic } from "./quartic.js";
import { mulberry32 } from "../rng.js";

// ---------------------------------------------------------------------------
// 도우미 — 시드 PRNG, 근 → 계수 전개, 근 대조. 내장 난수·거듭제곱 함수는 쓰지 않는다(절대 규칙 1·3).
// ---------------------------------------------------------------------------

const POW10 = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 1e1, 1e2, 1e3];

/** 부호 있는 로그균등 난수: ±m·10^k, m ∈ [1, 10), k ∈ [−6, 3]. */
function logUniformSigned(rnd: () => number): number {
    const k = Math.floor(rnd() * POW10.length);
    const m = 1 + rnd() * 9;
    const sign = rnd() < 0.5 ? -1 : 1;
    return sign * m * POW10[k];
}

/** lead·∏(t − r_i) 를 내림차순 계수 [a, b, c, d, e] 로 전개. */
function expand(roots: readonly number[], lead = 1): number[] {
    let coef = [lead];
    for (const r of roots) {
        const next = new Array<number>(coef.length + 1).fill(0);
        for (let i = 0; i < coef.length; i++) {
            next[i] += coef[i];
            next[i + 1] -= coef[i] * r;
        }
        coef = next;
    }
    return coef;
}

/** (t − α)² + β² = t² − 2α t + (α² + β²) 를 곱한다 (켤레 복소근 α ± iβ). */
function mulComplexPair(coef: readonly number[], alpha: number, beta: number): number[] {
    const q = [1, -2 * alpha, alpha * alpha + beta * beta];
    const out = new Array<number>(coef.length + 2).fill(0);
    for (let i = 0; i < coef.length; i++) {
        for (let j = 0; j < 3; j++) out[i + j] += coef[i] * q[j];
    }
    return out;
}

function evalPoly(coef: readonly number[], t: number): number {
    let v = 0;
    for (const c of coef) v = v * t + c;
    return v;
}

/** 정렬된 두 근 목록의 최대 상대 오차. */
function maxRelErr(found: readonly number[], truth: readonly number[]): number {
    const a = [...found].sort((x, y) => x - y);
    const b = [...truth].sort((x, y) => x - y);
    let worst = 0;
    for (let i = 0; i < b.length; i++) {
        const rel = Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-300);
        if (rel > worst) worst = rel;
    }
    return worst;
}

// ---------------------------------------------------------------------------

describe("solveQuartic — 알려진 실근에서 만든 무작위 4차식", () => {
    it("1만 개: 실근 넷을 모두 1e-9 상대 오차 안에서 되찾는다 (근 범위 1e-6..1e3, 근접 중근 포함)", () => {
        const rnd = mulberry32(20260907);
        let worst = 0;
        let failures = 0;
        for (let i = 0; i < 10000; i++) {
            const roots = [logUniformSigned(rnd), logUniformSigned(rnd), logUniformSigned(rnd), logUniformSigned(rnd)];
            if (rnd() < 0.3) {
                // 근접 중근: 상대 간격 1e-3 .. 1e-2
                const sep = 1e-3 * (1 + 9 * rnd());
                roots[1] = roots[0] * (1 + sep);
            }
            const lead = logUniformSigned(rnd);
            const [a, b, c, d, e] = expand(roots, lead);
            const found = solveQuartic(a, b, c, d, e);
            if (found.length !== 4) {
                failures++;
                continue;
            }
            const err = maxRelErr(found, roots);
            if (err > worst) worst = err;
            if (err > 1e-9) failures++;
        }
        expect(failures).toBe(0);
        expect(worst).toBeLessThan(1e-9);
    });

    it("근을 오름차순으로 돌려준다", () => {
        const [a, b, c, d, e] = expand([3, -1, 7, 0.5]);
        const r = solveQuartic(a, b, c, d, e);
        expect(r).toHaveLength(4);
        for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
        expect(r[0]).toBeCloseTo(-1, 12);
        expect(r[3]).toBeCloseTo(7, 12);
    });
});

describe("solveQuartic — 켤레 복소근이 있는 4차식", () => {
    /**
     * 켤레쌍 α ± iβ 의 허부. β² 이 ε·α² 에 묻히면 (t−α)² 과 계수가 구별되지 않아 어떤 해법도 실근 쌍과
     * 복소쌍을 가릴 수 없으므로, β 는 |α| 에 비례해(상대 1e-3 이상) 잡는다.
     */
    function imagPart(rnd: () => number, alpha: number): number {
        return Math.abs(logUniformSigned(rnd)) * 1000 * Math.max(1, Math.abs(alpha));
    }

    it("실근 2 + 복소쌍 1: 가짜 실근 없이 실근 둘만", () => {
        const rnd = mulberry32(7);
        for (let i = 0; i < 5000; i++) {
            const r1 = logUniformSigned(rnd);
            const r2 = logUniformSigned(rnd);
            const alpha = logUniformSigned(rnd);
            const beta = imagPart(rnd, alpha);
            const coef = mulComplexPair(expand([r1, r2]), alpha, beta);
            const found = solveQuartic(coef[0], coef[1], coef[2], coef[3], coef[4]);
            expect(found).toHaveLength(2);
            expect(maxRelErr(found, [r1, r2])).toBeLessThan(1e-8);
        }
    });

    it("복소쌍 2: 실근 없음", () => {
        const rnd = mulberry32(99);
        for (let i = 0; i < 5000; i++) {
            const a1 = logUniformSigned(rnd), b1 = imagPart(rnd, a1);
            const a2 = logUniformSigned(rnd), b2 = imagPart(rnd, a2);
            const coef = mulComplexPair(mulComplexPair([1], a1, b1), a2, b2);
            expect(solveQuartic(coef[0], coef[1], coef[2], coef[3], coef[4])).toEqual([]);
        }
        expect(solveQuartic(1, 0, 0, 0, 1)).toEqual([]); // t⁴ + 1
        expect(solveQuartic(1, 0, 2, 0, 1)).toEqual([]); // (t² + 1)²
    });

    it("quarticComplexRoots 는 켤레쌍을 (re, im) 로 돌려준다", () => {
        // (t² + 1)(t² − 4) = t⁴ − 3t² − 4
        const z = quarticComplexRoots(1, 0, -3, 0, -4);
        const pts: [number, number][] = [];
        for (let k = 0; k < 8; k += 2) pts.push([z[k], z[k + 1]]);
        pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
        expect(pts[0][0]).toBeCloseTo(-2, 12);
        expect(pts[0][1]).toBeCloseTo(0, 12);
        expect(pts[1][0]).toBeCloseTo(0, 12);
        expect(Math.abs(pts[1][1])).toBeCloseTo(1, 12);
        expect(pts[2][0]).toBeCloseTo(0, 12);
        expect(Math.abs(pts[2][1])).toBeCloseTo(1, 12);
        expect(pts[3][0]).toBeCloseTo(2, 12);
    });
});

describe("solveQuartic — 중근·특이 계수", () => {
    /**
     * 중근은 계수 반올림 ε 에 √ε ≈ 1.5e-8 만큼 갈라지는 것이 본질적 조건수라, 실근 쌍(간격 ~3e-8)으로도
     * 켤레 복소쌍(허부 ~1e-8 .. 1e-7)으로도 나올 수 있다. 후자는 pooltool 과 같은 1e-9 실근 판정에 걸러진다.
     * 아래 케이스들은 pooltool `_quartic_numba.solve` 와 비트 단위로 같은 결과임을 확인했다.
     * 그래서 여기서는 복소근 넷 자체를 검사한다: 실부는 진짜 근에 √ε 수준으로, 허부는 그 이하로.
     */
    function expectComplexRootsNear(coef: readonly number[], truth: readonly number[], tol: number): void {
        const z = quarticComplexRoots(coef[0], coef[1], coef[2], coef[3], coef[4]);
        const re: number[] = [];
        for (let k = 0; k < 8; k += 2) {
            re.push(z[k]);
            expect(Math.abs(z[k + 1])).toBeLessThan(tol);
        }
        re.sort((x, y) => x - y);
        const t = [...truth].sort((x, y) => x - y);
        for (let i = 0; i < 4; i++) expect(Math.abs(re[i] - t[i])).toBeLessThan(tol);
        // 실근으로 판정된 것들은 진짜 근 근방에만 있고 (가짜 근 없음), 단근은 정확하다
        for (const r of solveQuartic(coef[0], coef[1], coef[2], coef[3], coef[4])) {
            expect(Math.min(...t.map((x) => Math.abs(x - r)))).toBeLessThan(tol);
        }
    }

    it("정확한 중근 (t−1)²(t−2)(t−3): 중근은 √ε 수준, 단근은 정확", () => {
        const coef = expand([1, 1, 2, 3]);
        expectComplexRootsNear(coef, [1, 1, 2, 3], 1e-7);
        const r = solveQuartic(coef[0], coef[1], coef[2], coef[3], coef[4]);
        expect(r[r.length - 2]).toBeCloseTo(2, 10);
        expect(r[r.length - 1]).toBeCloseTo(3, 10);
    });

    it("4중근 (t−1)⁴ 와 두 쌍의 중근 (t−1)²(t−2)²", () => {
        // (t−1)⁴ 는 정확히 1,1,1,1 로 나온다 (perfect square 분기)
        expect(solveQuartic(1, -4, 6, -4, 1)).toEqual([1, 1, 1, 1]);
        expectComplexRootsNear(expand([1, 1, 2, 2]), [1, 1, 2, 2], 1e-7);
    });

    it("완전제곱 (½)(−t²/16 + t − ½)² — 정확한 스침: 접촉 시각 근방에만 근이 있고 가짜 근은 없다", () => {
        // 아래 '당구' 테스트의 정확한 스침 계수와 같은 꼴. 진짜 근: (1 ± √0.875)/0.125
        const s = Math.sqrt(0.875);
        const t1 = (1 - s) / 0.125, t2 = (1 + s) / 0.125;
        expectComplexRootsNear([0.001953125, -0.0625, 0.53125, -0.5, 0.125], [t1, t1, t2, t2], 1e-6);
    });

    it("선행계수가 극히 작은 4차식: 유한한 두 근은 정확하고 나머지는 복소(버려짐)", () => {
        // 1e-30 t⁴ + t² − 3t + 2: 근 1, 2 와 ±1e15 i 근방의 복소쌍
        const r = solveQuartic(1e-30, 0, 1, -3, 2);
        expect(r).toHaveLength(2);
        expect(r[0]).toBeCloseTo(1, 12);
        expect(r[1]).toBeCloseTo(2, 12);
    });

    it("계수 크기 극단: 1e100 배·1e-100 배 스케일에도 같은 근", () => {
        const [a, b, c, d, e] = expand([-2, 0.5, 3, 40]);
        for (const s of [1e100, 1e-100, 1e200, 1e-200]) {
            const r = solveQuartic(a * s, b * s, c * s, d * s, e * s);
            expect(r).toHaveLength(4);
            expect(maxRelErr(r, [-2, 0.5, 3, 40])).toBeLessThan(1e-10);
        }
    });

    it("근이 매우 큰 4차식 (근 ~1e150): 넘침 재스케일 경로", () => {
        const roots = [1e150, -2e150, 3e150, 5e149];
        const [a, b, c, d, e] = expand(roots);
        // 계수는 1e600 까지 커져 Infinity 가 되므로, 모닉 계수를 직접 만든다 (a=1)
        if (!Number.isFinite(e)) {
            // e = ∏roots = 3e600 → 넘침. 근을 줄여 유한 범위에서만 확인
            const small = [1e75, -2e75, 3e75, 5e74];
            const [a2, b2, c2, d2, e2] = expand(small);
            const r = solveQuartic(a2, b2, c2, d2, e2);
            expect(r).toHaveLength(4);
            expect(maxRelErr(r, small)).toBeLessThan(1e-9);
        } else {
            const r = solveQuartic(a, b, c, d, e);
            expect(r).toHaveLength(4);
            expect(maxRelErr(r, roots)).toBeLessThan(1e-9);
        }
    });

    it("NaN/∞ 계수는 빈 배열", () => {
        expect(solveQuartic(NaN, 1, 1, 1, 1)).toEqual([]);
        expect(solveQuartic(1, 1, 1, Infinity, 1)).toEqual([]);
    });
});

describe("solveQuartic — 당구: 포물선 궤적 두 개의 접촉 시각", () => {
    /**
     * pooltool parabola_sphere_distance_quartic_coefficients: 상대 위치 p(t) = p0 + p1 t + p2 t² 에 대해
     * (|p(t)|² − D²)/2 = 0 의 계수 [e, d, c, b, a] (여기서는 내림차순 [a, b, c, d, e] 로 돌려준다).
     */
    function contactCoefficients(
        p0: readonly number[], p1: readonly number[], p2: readonly number[], D: number,
    ): [number, number, number, number, number] {
        const dot = (u: readonly number[], v: readonly number[]): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        return [
            dot(p2, p2) / 2,
            dot(p1, p2),
            dot(p0, p2) + dot(p1, p1) / 2,
            dot(p0, p1),
            (dot(p0, p0) - D * D) / 2,
        ];
    }

    // 정확히 표현되는 값들로 계수 산술을 무오차로 만든다:
    // R = 1/32, 공 1 은 원점에서 +y 로 v=1, 감속 μg=1/8 (r2 = −μg/2 = −1/16). 공 2 는 (2R+δ, 1/2) 정지.
    const R = 0.03125;
    const y0 = 0.5;
    const v = 1;
    const halfDecel = 0.0625;

    function coefsFor(delta: number): [number, number, number, number, number] {
        const p0 = [-(2 * R + delta), -y0, 0];
        const p1 = [0, v, 0];
        const p2 = [0, -halfDecel, 0];
        return contactCoefficients(p0, p1, p2, 2 * R);
    }

    /** 해석해: (v t − μg t²/2 − y0)² = 4R² − (2R+δ)² =: m. m<0 이면 접촉 없음. */
    function analyticContact(delta: number): number {
        const m = 4 * R * R - (2 * R + delta) * (2 * R + delta);
        if (m < 0) return Infinity;
        const s = Math.sqrt(m);
        // −halfDecel t² + v t − (y0 − s) = 0 의 작은 양근 (먼저 닿는 시각)
        const disc = v * v - 4 * halfDecel * (y0 - s);
        return (v - Math.sqrt(disc)) / (2 * halfDecel);
    }

    it("정확히 2R 스침: 중근 (접촉 시각) 을 잃지 않는다", () => {
        const [a, b, c, d, e] = coefsFor(0);
        const r = solveQuartic(a, b, c, d, e);
        const t = analyticContact(0);
        expect(r.length).toBeGreaterThanOrEqual(2);
        expect(Math.abs(smallestPositiveRoot(r) - t)).toBeLessThan(1e-7);
    });

    it("살짝 가까움 (2R − 1e-6): 두 실근, 작은 쪽이 접촉 시각", () => {
        const [a, b, c, d, e] = coefsFor(-1e-6);
        const r = solveQuartic(a, b, c, d, e);
        expect(r).toHaveLength(4);
        const t = analyticContact(-1e-6);
        expect(Math.abs(smallestPositiveRoot(r) - t) / t).toBeLessThan(1e-9);
        // 뒤에서 공을 통과해 나가는 시각(두 번째 근)도 해석해와 일치
        const m = 4 * R * R - (2 * R - 1e-6) * (2 * R - 1e-6);
        const s = Math.sqrt(m);
        const disc = v * v - 4 * halfDecel * (y0 + s);
        const tExit = (v - Math.sqrt(disc)) / (2 * halfDecel);
        expect(Math.abs(r[1] - tExit) / tExit).toBeLessThan(1e-9);
    });

    it("살짝 멂 (2R + 1e-6): 실근 없음 → Infinity", () => {
        const [a, b, c, d, e] = coefsFor(1e-6);
        const r = solveQuartic(a, b, c, d, e);
        expect(r).toEqual([]);
        expect(smallestPositiveRoot(r)).toBe(Infinity);
    });

    it("실제 대대 치수(비표현 수)의 스침: 가짜 원거리 근 없이 접촉 시각 근방이거나 빈 결과", () => {
        const Rr = 0.03075;
        const p0 = [-2 * Rr, -0.8, 0];
        const p1 = [0, 2.5, 0];
        const p2 = [0, -0.5 * 0.01 * 9.81, 0];
        const [a, b, c, d, e] = contactCoefficients(p0, p1, p2, 2 * Rr);
        const r = solveQuartic(a, b, c, d, e);
        // 접선 시각: 2.5 t − 0.04905 t² = 0.8
        const tTan = (2.5 - Math.sqrt(2.5 * 2.5 - 4 * 0.04905 * 0.8)) / (2 * 0.04905);
        for (const t of r) {
            const dt = Math.min(Math.abs(t - tTan), Math.abs(t - (2.5 / 0.04905 - tTan)));
            expect(dt).toBeLessThan(1e-6);
        }
    });

    it("정면 충돌: 접촉 시각이 해석해와 1e-12 안에서 일치하고, 통과·되돌아오는 근은 뒤에 온다", () => {
        // 공 1: 원점, +y 로 2 m/s, 구름 감속 0.0981. 공 2: (0, 0.6) 정지. 접촉: 2t − 0.04905 t² = 0.6 − 2R
        const Rr = 0.03075;
        const p0 = [0, -0.6, 0];
        const p1 = [0, 2, 0];
        const p2 = [0, -0.04905, 0];
        const [a, b, c, d, e] = contactCoefficients(p0, p1, p2, 2 * Rr);
        const r = solveQuartic(a, b, c, d, e);
        const q = (target: number, sign: number): number =>
            (2 + sign * Math.sqrt(4 - 4 * 0.04905 * target)) / (2 * 0.04905);
        const tHit = q(0.6 - 2 * Rr, -1);
        const tExit = q(0.6 + 2 * Rr, -1);
        expect(Math.abs(smallestPositiveRoot(r) - tHit) / tHit).toBeLessThan(1e-12);
        // 포물선이 되돌아오므로 근 넷이 모두 양수: 접촉, 통과, (되돌아와) 재통과, 재접촉
        expect(r).toHaveLength(4);
        expect(r[0]).toBe(smallestPositiveRoot(r));
        expect(Math.abs(r[1] - tExit) / tExit).toBeLessThan(1e-12);
        expect(Math.abs(r[2] - q(0.6 + 2 * Rr, 1))).toBeLessThan(1e-9);
        expect(Math.abs(r[3] - q(0.6 - 2 * Rr, 1))).toBeLessThan(1e-9);
    });
});

describe("solveQuartic — 계수 퇴화", () => {
    it("a = 0: 3차로 강등", () => {
        const [b, c, d, e] = expand([-4, 0.25, 9]);
        const r = solveQuartic(0, b, c, d, e);
        expect(r).toHaveLength(3);
        expect(maxRelErr(r, [-4, 0.25, 9])).toBeLessThan(1e-12);
        // 실근 하나 + 복소쌍
        const cc = mulComplexPair(expand([2]), -1, 3);
        expect(solveQuartic(0, cc[0], cc[1], cc[2], cc[3])).toHaveLength(1);
        expect(solveQuartic(0, cc[0], cc[1], cc[2], cc[3])[0]).toBeCloseTo(2, 12);
    });

    it("solveCubic 무작위 5천 개", () => {
        const rnd = mulberry32(3);
        for (let i = 0; i < 5000; i++) {
            const roots = [logUniformSigned(rnd), logUniformSigned(rnd), logUniformSigned(rnd)];
            const [b, c, d, e] = expand(roots, logUniformSigned(rnd));
            const r = solveCubic(b, c, d, e);
            expect(r).toHaveLength(3);
            expect(maxRelErr(r, roots)).toBeLessThan(1e-9);
        }
    });

    it("a = b = 0: 2차로 강등, a = b = c = 0: 1차, 전부 0: 빈 배열", () => {
        expect(solveQuartic(0, 0, 1, -3, 2)).toEqual([1, 2]);
        expect(solveQuartic(0, 0, 0, 2, -5)).toEqual([2.5]);
        expect(solveQuartic(0, 0, 0, 0, 1)).toEqual([]);
        expect(solveQuartic(0, 0, 0, 0, 0)).toEqual([]);
    });
});

describe("smallestPositiveRoot", () => {
    it("eps 보다 큰 최소 근, 없으면 Infinity", () => {
        expect(smallestPositiveRoot([-1, 0, 1e-12, 0.5, 2])).toBe(0.5);
        expect(smallestPositiveRoot([-1, 0])).toBe(Infinity);
        expect(smallestPositiveRoot([])).toBe(Infinity);
        expect(smallestPositiveRoot([1e-12, 3], 1e-13)).toBe(1e-12);
        expect(smallestPositiveRoot([1e-9])).toBe(Infinity); // 경계값은 제외
    });

    it("입력 배열을 바꾸지 않는다", () => {
        const roots = [3, -1, 2];
        smallestPositiveRoot(roots);
        expect(roots).toEqual([3, -1, 2]);
    });
});

describe("벤치마크 (RUN_BENCH=1 일 때만)", () => {
    it.skipIf(!process.env.RUN_BENCH)("4차식 100만 개 풀이 속도", () => {
        const rnd = mulberry32(1);
        const N = 1_000_000;
        const coefs = new Float64Array(N * 5);
        for (let i = 0; i < N; i++) {
            const roots = [logUniformSigned(rnd), logUniformSigned(rnd), logUniformSigned(rnd), logUniformSigned(rnd)];
            const c = expand(roots, 1);
            for (let k = 0; k < 5; k++) coefs[i * 5 + k] = c[k];
        }
        // 워밍업
        for (let i = 0; i < 20000; i++) solveQuartic(coefs[i * 5], coefs[i * 5 + 1], coefs[i * 5 + 2], coefs[i * 5 + 3], coefs[i * 5 + 4]);
        const t0 = process.hrtime.bigint();
        let acc = 0;
        for (let i = 0; i < N; i++) {
            const r = solveQuartic(coefs[i * 5], coefs[i * 5 + 1], coefs[i * 5 + 2], coefs[i * 5 + 3], coefs[i * 5 + 4]);
            acc += r.length;
        }
        const t1 = process.hrtime.bigint();
        const sec = Number(t1 - t0) / 1e9;
        // eslint-disable-next-line no-console
        console.log(`solveQuartic: ${N} solves in ${sec.toFixed(3)} s → ${(N / sec / 1e6).toFixed(2)} M solves/s (roots ${acc})`);
        expect(acc).toBeGreaterThan(0);
    });
});
