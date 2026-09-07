/**
 * dmath 검증: Math.* 와 ≤ 1 ulp, 특수값 일치, 비트 단위 재현성, 금지 함수 grep, (옵션) 성능.
 * 여기서만 Math.sin 등을 오라클로 부른다 — 소스(dmath.ts)에는 없어야 한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as dm from "./dmath.js";
import { mulberry32 } from "./rng.js";

// ── ulp 거리 ────────────────────────────────────────────────────────────────
const buf = new Float64Array(1);
const bits = new BigInt64Array(buf.buffer);
const words = new Uint32Array(buf.buffer);
buf[0] = 1;
const HI = words[1] === 0x3ff00000 ? 1 : 0;
const LO = 1 - HI;

/** double 을 순서 보존 정수로 (±0 은 둘 다 0). */
function ordered(x: number): bigint {
    buf[0] = x;
    const i = bits[0];
    return i < 0n ? -(i & 0x7fffffffffffffffn) : i;
}

/** 두 double 사이의 ulp 거리. NaN 끼리는 0, NaN 과 수는 Infinity. */
function ulpDiff(a: number, b: number): number {
    const an = a !== a, bn = b !== b;
    if (an && bn) return 0;
    if (an || bn) return Infinity;
    if (a === b) return 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    const d = ordered(a) - ordered(b);
    return Number(d < 0n ? -d : d);
}

function fromWords(hi: number, lo: number): number {
    words[HI] = hi;
    words[LO] = lo;
    return buf[0];
}

const N = 200_000;

interface Worst { maxUlp: number; at: number; got: number; want: number }

function sweep(name: string, f: (x: number) => number, g: (x: number) => number, sample: (r: () => number) => number, seed: number, n = N): Worst {
    const rnd = mulberry32(seed);
    const w: Worst = { maxUlp: 0, at: 0, got: 0, want: 0 };
    for (let i = 0; i < n; i++) {
        const x = sample(rnd);
        const got = f(x);
        const want = g(x);
        const u = ulpDiff(got, want);
        if (u > w.maxUlp) {
            w.maxUlp = u;
            w.at = x;
            w.got = got;
            w.want = want;
        }
        // 비트 단위 재현성
        expect(Object.is(f(x), got), `${name}(${x}) 재현 실패`).toBe(true);
    }
    return w;
}

/** 지수·가수를 비트로 직접 뽑아 만드는 "임의의 유한 double" (지수 범위 [lo, hi], 2^lo … 2^hi). */
function anyDouble(rnd: () => number, expLo: number, expHi: number, signed = true): number {
    const e = 1023 + expLo + Math.floor(rnd() * (expHi - expLo + 1));
    const hi = (e << 20) | Math.floor(rnd() * 0x100000);
    const lo = Math.floor(rnd() * 4294967296);
    const v = fromWords(hi, lo);
    return signed && rnd() < 0.5 ? -v : v;
}

const uniform = (lo: number, hi: number) => (rnd: () => number) => lo + (hi - lo) * rnd();

// ── 1 ulp 이내 ──────────────────────────────────────────────────────────────
describe("dmath ≤ 1 ulp vs Math.*", () => {
    // 삼각: |x| ≤ 1e4 균등 + 크기 로그 균등(0 근방 밀도 확보)
    const trigSample = (rnd: () => number) => (rnd() < 0.5 ? uniform(-1e4, 1e4)(rnd) : anyDouble(rnd, -30, 13));

    it("sin", () => {
        const w = sweep("sin", dm.sin, Math.sin, trigSample, 1);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("cos", () => {
        const w = sweep("cos", dm.cos, Math.cos, trigSample, 2);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("tan", () => {
        const w = sweep("tan", dm.tan, Math.tan, trigSample, 3);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("atan", () => {
        const w = sweep("atan", dm.atan, Math.atan, (rnd) => (rnd() < 0.5 ? uniform(-1e4, 1e4)(rnd) : anyDouble(rnd, -40, 70)), 4);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("asin", () => {
        const w = sweep("asin", dm.asin, Math.asin, (rnd) => (rnd() < 0.7 ? uniform(-1, 1)(rnd) : anyDouble(rnd, -40, -1)), 5);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("acos", () => {
        const w = sweep("acos", dm.acos, Math.acos, (rnd) => (rnd() < 0.7 ? uniform(-1, 1)(rnd) : anyDouble(rnd, -40, -1)), 6);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("exp [-50, 50]", () => {
        const w = sweep("exp", dm.exp, Math.exp, (rnd) => (rnd() < 0.7 ? uniform(-50, 50)(rnd) : anyDouble(rnd, -40, 5)), 7);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("log (0, 1e6]", () => {
        const w = sweep("log", dm.log, Math.log, (rnd) => (rnd() < 0.5 ? 1e6 * rnd() + 1e-300 : anyDouble(rnd, -60, 19, false)), 8);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("cbrt (모든 double)", () => {
        const w = sweep("cbrt", dm.cbrt, Math.cbrt, (rnd) => anyDouble(rnd, -1022, 1023), 9);
        expect(w.maxUlp, JSON.stringify(w)).toBeLessThanOrEqual(1);
    });
    it("atan2 (y, x ∈ [-1e4, 1e4] + 극단 비율)", () => {
        const rnd = mulberry32(10);
        let maxUlp = 0;
        let worst = "";
        for (let i = 0; i < N; i++) {
            const y = rnd() < 0.8 ? uniform(-1e4, 1e4)(rnd) : anyDouble(rnd, -80, 80);
            const x = rnd() < 0.8 ? uniform(-1e4, 1e4)(rnd) : anyDouble(rnd, -80, 80);
            const got = dm.atan2(y, x);
            const want = Math.atan2(y, x);
            const u = ulpDiff(got, want);
            if (u > maxUlp) {
                maxUlp = u;
                worst = `atan2(${y}, ${x}) = ${got}, Math: ${want}`;
            }
            expect(Object.is(dm.atan2(y, x), got)).toBe(true);
        }
        expect(maxUlp, worst).toBeLessThanOrEqual(1);
    });

    // 큰 인자: Payne–Hanek 경로 (엔진은 쓰지 않지만 포팅 검증)
    it("sin/cos/tan 큰 인자 (2^19·π/2 < |x| < 2^1023)", () => {
        const big = (rnd: () => number) => anyDouble(rnd, 20, 1023);
        const ws = sweep("sin", dm.sin, Math.sin, big, 11, 30_000);
        const wc = sweep("cos", dm.cos, Math.cos, big, 12, 30_000);
        const wt = sweep("tan", dm.tan, Math.tan, big, 13, 30_000);
        expect(ws.maxUlp, JSON.stringify(ws)).toBeLessThanOrEqual(1);
        expect(wc.maxUlp, JSON.stringify(wc)).toBeLessThanOrEqual(1);
        expect(wt.maxUlp, JSON.stringify(wt)).toBeLessThanOrEqual(1);
    });
});

// ── 특수값 ──────────────────────────────────────────────────────────────────
describe("dmath 특수값", () => {
    const specials = [0, -0, dm.HALF_PI, -dm.HALF_PI, dm.PI, -dm.PI, 1e-300, -1e-300, Infinity, -Infinity, NaN,
        0.5, -0.5, 1, -1, 2, 1e4, -1e4, 823549.6642, 1e10, 1e22, 5e-324, 1.7976931348623157e308, 0.9999999999999999];

    const fns: Array<[string, (x: number) => number, (x: number) => number]> = [
        ["sin", dm.sin, Math.sin], ["cos", dm.cos, Math.cos], ["tan", dm.tan, Math.tan],
        ["atan", dm.atan, Math.atan], ["asin", dm.asin, Math.asin], ["acos", dm.acos, Math.acos],
        ["exp", dm.exp, Math.exp], ["log", dm.log, Math.log], ["cbrt", dm.cbrt, Math.cbrt],
    ];

    for (const [name, f, g] of fns) {
        it(name, () => {
            for (const x of specials) {
                const got = f(x);
                const want = g(x);
                expect(ulpDiff(got, want), `${name}(${x}) = ${got}, Math: ${want}`).toBeLessThanOrEqual(1);
                // 부호 있는 0 은 정확히 일치해야 한다
                if (want === 0) expect(Object.is(got, want), `${name}(${x}) 0 의 부호`).toBe(true);
            }
        });
    }

    it("홀함수의 0·부호 규약", () => {
        for (const f of [dm.sin, dm.tan, dm.atan, dm.asin, dm.cbrt]) {
            expect(Object.is(f(0), 0)).toBe(true);
            expect(Object.is(f(-0), -0)).toBe(true);
        }
        expect(dm.cos(0)).toBe(1);
        expect(dm.cos(-0)).toBe(1);
        expect(dm.exp(0)).toBe(1);
        expect(dm.exp(-0)).toBe(1);
        expect(dm.log(1)).toBe(0);
        expect(dm.log(0)).toBe(-Infinity);
        expect(dm.log(-0)).toBe(-Infinity);
        expect(dm.log(-1)).toBeNaN();
        expect(dm.asin(2)).toBeNaN();
        expect(dm.acos(-1.0000000000000002)).toBeNaN();
        expect(dm.acos(1)).toBe(0);
        expect(dm.exp(1)).toBe(Math.E);
        expect(dm.exp(710)).toBe(Infinity);
        expect(dm.exp(-750)).toBe(0);
        expect(dm.cbrt(27)).toBe(3);
        expect(dm.cbrt(-8)).toBe(-2);
    });

    it("atan2 특수 조합", () => {
        const vals = [0, -0, 1, -1, Infinity, -Infinity, NaN, 1e-300, -1e-300, 1e300, -1e300, 1e4, -1e4];
        for (const y of vals) {
            for (const x of vals) {
                const got = dm.atan2(y, x);
                const want = Math.atan2(y, x);
                expect(ulpDiff(got, want), `atan2(${y}, ${x}) = ${got}, Math: ${want}`).toBeLessThanOrEqual(1);
                if (want === 0) expect(Object.is(got, want), `atan2(${y}, ${x}) 0 의 부호`).toBe(true);
            }
        }
    });

    it("상수", () => {
        expect(dm.PI).toBe(Math.PI);
        expect(dm.TWO_PI).toBe(2 * Math.PI);
        expect(dm.HALF_PI).toBe(Math.PI / 2);
        expect(dm.sqrt).toBe(Math.sqrt);
        expect(dm.hypot2(3, 4)).toBe(5);
        expect(dm.hypot2(0, 0)).toBe(0);
    });
});

// ── 소스 grep: 초월함수·시각·난수 금지 ───────────────────────────────────────
describe("dmath.ts 는 Math 초월함수를 참조하지 않는다", () => {
    it("주석을 걷어낸 소스에 금지 이름이 없다", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(join(here, "dmath.ts"), "utf8");
        // 블록 주석과 줄 주석 제거 (문자열 리터럴은 소스에 없다)
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        const banned = /Math\.(sin|cos|tan|atan|atan2|asin|acos|exp|log|pow|hypot|cbrt|random|fround|sinh|cosh|tanh|log2|log10|log1p|expm1)\b/g;
        expect(code.match(banned) ?? []).toEqual([]);
        expect(/\b(Date|performance)\b/.test(code)).toBe(false);
        // 금지 이름은 주석 안에는 있어도 된다 (설명용) — 위 검사가 주석을 제거한 뒤 통과했으면 충분
        expect(src.includes("Math.sin")).toBe(true);
    });
});

// ── 성능 (RUN_BENCH=1 일 때만) ──────────────────────────────────────────────
describe("dmath 성능", () => {
    it.skipIf(!process.env.RUN_BENCH)("sin ≥ 5M calls/sec", () => {
        const rnd = mulberry32(99);
        const xs = new Float64Array(1 << 16);
        for (let i = 0; i < xs.length; i++) xs[i] = uniform(-1e4, 1e4)(rnd);
        let acc = 0;
        // 워밍업 (JIT)
        for (let i = 0; i < 1_000_000; i++) acc += dm.sin(xs[i & 0xffff]);
        const calls = 20_000_000;
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < calls; i++) acc += dm.sin(xs[i & 0xffff]);
        const t1 = process.hrtime.bigint();
        const sec = Number(t1 - t0) / 1e9;
        const rate = calls / sec;
        // eslint-disable-next-line no-console
        console.log(`dmath.sin: ${(rate / 1e6).toFixed(1)} M calls/sec (acc=${acc})`);
        expect(rate).toBeGreaterThanOrEqual(5e6);
    });
});
