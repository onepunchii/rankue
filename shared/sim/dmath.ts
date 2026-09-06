/**
 * dmath — 결정론적 초월함수 (fdlibm 순수 산술 포팅).
 *
 * 왜 필요한가: iOS JavaScriptCore 와 V8 은 libm 이 달라 `Math.sin` 같은 초월함수가 마지막 비트에서
 * 어긋날 수 있다. 그 1 ulp 가 쿠션 3개를 지나며 수 mm 로 자라 리플레이 해시가 갈린다. 그래서 이 폴더는
 * `+ − × ÷ Math.sqrt Math.floor Math.abs Math.trunc` 와 typed array 비트 접근(모두 IEEE-754 가 정확히
 * 규정)만으로 fdlibm 알고리즘을 그대로 재현한다. 같은 입력이면 어떤 엔진에서도 같은 비트가 나온다.
 *
 * 정확도: fdlibm 이 보장하는 < 1 ulp. 브라우저의 Math.* 와 비교해 ≤ 1 ulp (dmath.test.ts 가 20만 표본으로 검사).
 * 큰 인자(|x| > 2^19·π/2 ≈ 823 549)의 삼각함수는 Payne–Hanek 축소(__kernel_rem_pio2)까지 포팅했으므로
 * 정밀도가 떨어지지 않는다. 엔진은 |x| ≤ 1e4 만 쓴다.
 *
 * 금지 함수 참고(이 폴더의 grep 테스트가 검사하는 이름들은 이 주석 블록 안에만 등장한다):
 *   Math.sin / Math.cos / Math.tan / Math.atan / Math.atan2 / Math.asin / Math.acos / Math.exp / Math.log /
 *   Math.cbrt / Math.pow / Math.hypot 대신 아래의 sin/cos/tan/atan/atan2/asin/acos/exp/log/cbrt/hypot2 를 쓴다.
 *
 * 출처 및 고지 —
 *   fdlibm (http://www.netlib.org/fdlibm), V8 의 src/base/ieee754.cc (fdlibm 기반, 2016 Google 수정판) 을
 *   참고해 TypeScript 로 새로 썼다. 상수(16진 비트 패턴 포함)는 fdlibm 원본 그대로다.
 *   ====================================================
 *   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *   Developed at SunSoft, a Sun Microsystems, Inc. business.
 *   Permission to use, copy, modify, and distribute this
 *   software is freely granted, provided that this notice
 *   is preserved.
 *   ====================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// 비트 접근. fdlibm 의 GET_HIGH_WORD / SET_LOW_WORD 등에 해당한다.
// typed array 는 플랫폼 엔디안을 따르므로 모듈 로드 시 한 번 판별한다(결과는 결정론적).
// ─────────────────────────────────────────────────────────────────────────────
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
f64[0] = 1;
const HI = u32[1] === 0x3ff00000 ? 1 : 0;
const LO = 1 - HI;

/** 상위 32비트 (부호 있는 int32). */
function hiWord(x: number): number {
    f64[0] = x;
    return u32[HI] | 0;
}

/** 하위 32비트 (부호 없는 uint32). */
function loWord(x: number): number {
    f64[0] = x;
    return u32[LO];
}

/** 두 워드로 double 조립. */
function fromWords(hi: number, lo: number): number {
    u32[HI] = hi;
    u32[LO] = lo;
    return f64[0];
}

/** 하위 워드만 바꾼 값 (원본은 변형하지 않는다). */
function withLowWord(x: number, lo: number): number {
    f64[0] = x;
    u32[LO] = lo;
    return f64[0];
}

/** 상위 워드만 바꾼 값. */
function withHighWord(x: number, hi: number): number {
    f64[0] = x;
    u32[HI] = hi;
    return f64[0];
}

/** 2^n (−1022 ≤ n ≤ 1023). scalbn(1, n) 에 해당. 2의 거듭제곱 곱셈은 정확하므로 scalbn(z, n) = z · pow2(n). */
function pow2(n: number): number {
    return fromWords((1023 + n) << 20, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
export const PI = 3.141592653589793;            // 0x400921FB 54442D18
export const TWO_PI = 6.283185307179586;        // 0x401921FB 54442D18
export const HALF_PI = 1.5707963267948966;      // 0x3FF921FB 54442D18

export const sqrt = Math.sqrt;

/** √(x² + y²). 오버플로 보호 없는 단순형 — 엔진의 값 범위(m, m/s)에서는 충분하다. */
export function hypot2(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
}

// ─────────────────────────────────────────────────────────────────────────────
// 인자 축소: x → (y0 + y1) = x − n·π/2, |y0| ≤ π/4.  fdlibm __ieee754_rem_pio2.
// 결과 y0, y1 은 할당을 피하려고 모듈 변수에 담는다(단일 스레드, 재진입 없음).
// ─────────────────────────────────────────────────────────────────────────────
let remY0 = 0;
let remY1 = 0;

/** 2/π 의 396 자리 16진 전개(24비트 청크). Payne–Hanek 용. */
const TWO_OVER_PI = new Int32Array([
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C,
    0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649,
    0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44,
    0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B,
    0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D,
    0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5,
    0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330,
    0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08,
    0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
    0x73A8C9, 0x60E27B, 0xC08C6B,
]);

/** n·π/2 (n = 1..32) 의 상위 워드. 중간 크기 인자에서 상쇄(cancellation) 여부를 빠르게 판별한다. */
const NPIO2_HW = new Int32Array([
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
    0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
    0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
    0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
    0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB,
]);

/** π/2 를 33비트씩 세 조각으로 나눈 것. n·pio2_k 곱이 정확(exact)하도록 하위 비트를 비워 두었다. */
const INVPIO2 = 6.36619772367581382433e-01;   // 0x3FE45F30 6DC9C883  (2/π, 53비트)
const PIO2_1 = 1.57079632673412561417e+00;    // 0x3FF921FB 54400000  (π/2 의 첫 33비트)
const PIO2_1T = 6.07710050650619224932e-11;   // 0x3DD0B461 1A626331  (π/2 − pio2_1)
const PIO2_2 = 6.07710050630396597660e-11;    // 0x3DD0B461 1A600000  (둘째 33비트)
const PIO2_2T = 2.02226624879595063154e-21;   // 0x3BA3198A 2E037073
const PIO2_3 = 2.02226624871116645580e-21;    // 0x3BA3198A 2E000000  (셋째 33비트)
const PIO2_3T = 8.47842766036889956997e-32;   // 0x397B839A 252049C1
const TWO24 = 16777216;                        // 2^24
const TWON24 = 5.96046447753906250000e-08;    // 2^-24

/** Payne–Hanek 용 π/2 의 24비트 조각들. */
const PIO2_CHUNKS = new Float64Array([
    1.57079625129699707031e+00, // 0x3FF921FB 40000000
    7.54978941586159635335e-08, // 0x3E74442D 00000000
    5.39030252995776476554e-15, // 0x3CF84698 80000000
    3.28200341580791294123e-22, // 0x3B78CC51 60000000
    1.27065575308067607349e-29, // 0x39F01B83 80000000
    1.22933308981111328932e-36, // 0x387A2520 40000000
    2.73370053816464559624e-44, // 0x36E38222 80000000
    2.16741683877804819444e-51, // 0x3569F31D 00000000
]);

// __kernel_rem_pio2 작업 버퍼 (재사용, 할당 없음)
const krTx = new Float64Array(3);
const krF = new Float64Array(24);
const krQ = new Float64Array(24);
const krFq = new Float64Array(24);
const krIq = new Int32Array(24);

/**
 * 큰 인자용 Payne–Hanek 축소 (fdlibm __kernel_rem_pio2, prec = 2 고정).
 * x = tx[0..nx) 는 24비트 정수 조각(2^e0 스케일)으로 쪼갠 |x|. 결과 (y0, y1) 은 remY0/remY1 에,
 * 반환값은 n mod 8 (x − n·π/2 의 n). 정수 연산은 int32 범위를 벗어나지 않으므로 `| 0`/Math.trunc 가
 * C 의 static_cast<int32_t> 와 같다.
 */
function kernelRemPio2(nx: number, e0: number): number {
    const jk = 4;   // init_jk[2]
    const jp = jk;
    const jx = nx - 1;
    let jv = Math.trunc((e0 - 3) / 24);
    if (jv < 0) jv = 0;
    let q0 = e0 - 24 * (jv + 1);

    // f[0..jx+jk] = 2/π 의 필요한 청크
    let j = jv - jx;
    const m = jx + jk;
    for (let i = 0; i <= m; i++, j++) {
        krF[i] = j < 0 || j >= TWO_OVER_PI.length ? 0 : TWO_OVER_PI[j];
    }

    // q[0..jk] = Σ x[j]·f[jx+i−j]
    for (let i = 0; i <= jk; i++) {
        let fw = 0;
        for (j = 0; j <= jx; j++) fw += krTx[j] * krF[jx + i - j];
        krQ[i] = fw;
    }

    let jz = jk;
    let n = 0;
    let ih = 0;
    let z = 0;
    for (;;) {
        // q[] 를 24비트 정수 iq[] 로 증류(역순)
        let i = 0;
        z = krQ[jz];
        for (j = jz; j > 0; i++, j--) {
            const fw = Math.trunc(TWON24 * z);
            krIq[i] = Math.trunc(z - TWO24 * fw);
            z = krQ[j - 1] + fw;
        }

        // n 계산
        z = z * pow2(q0);                      // z 의 실제 값
        z -= 8.0 * Math.floor(z * 0.125);      // 8 이상의 정수부 제거
        n = Math.trunc(z);
        z -= n;
        ih = 0;
        if (q0 > 0) {                          // n 을 정하려면 iq[jz−1] 이 필요
            i = krIq[jz - 1] >> (24 - q0);
            n += i;
            krIq[jz - 1] -= i << (24 - q0);
            ih = krIq[jz - 1] >> (23 - q0);
        } else if (q0 === 0) {
            ih = krIq[jz - 1] >> 23;
        } else if (z >= 0.5) {
            ih = 2;
        }

        if (ih > 0) {                          // q > 0.5 → 1 − q 로 뒤집고 n += 1
            n += 1;
            let carry = 0;
            for (i = 0; i < jz; i++) {
                j = krIq[i];
                if (carry === 0) {
                    if (j !== 0) {
                        carry = 1;
                        krIq[i] = 0x1000000 - j;
                    }
                } else {
                    krIq[i] = 0xFFFFFF - j;
                }
            }
            if (q0 > 0) {                      // 드문 경우 (확률 1/12)
                if (q0 === 1) krIq[jz - 1] &= 0x7FFFFF;
                else if (q0 === 2) krIq[jz - 1] &= 0x3FFFFF;
            }
            if (ih === 2) {
                z = 1 - z;
                if (carry !== 0) z -= pow2(q0);
            }
        }

        // 재계산이 필요한지 확인 (모든 유효 비트가 0 이면 정밀도 부족)
        if (z === 0) {
            j = 0;
            for (i = jz - 1; i >= jk; i--) j |= krIq[i];
            if (j === 0) {
                let k = 1;
                for (; jk >= k && krIq[jk - k] === 0; k++) { /* 필요한 항 수 k */ }
                for (i = jz + 1; i <= jz + k; i++) {   // q[jz+1..jz+k] 추가
                    const src = jv + i;
                    krF[jx + i] = src < TWO_OVER_PI.length ? TWO_OVER_PI[src] : 0;
                    let fw = 0;
                    for (j = 0; j <= jx; j++) fw += krTx[j] * krF[jx + i - j];
                    krQ[i] = fw;
                }
                jz += k;
                continue;
            }
        }
        break;
    }

    // 0 항 잘라내기 / z 를 24비트 청크로 쪼개기
    if (z === 0) {
        jz -= 1;
        q0 -= 24;
        while (krIq[jz] === 0) {
            jz--;
            q0 -= 24;
        }
    } else {
        z = z * pow2(-q0);
        if (z >= TWO24) {
            const fw = Math.trunc(TWON24 * z);
            krIq[jz] = Math.trunc(z - TWO24 * fw);
            jz += 1;
            q0 += 24;
            krIq[jz] = fw;
        } else {
            krIq[jz] = Math.trunc(z);
        }
    }

    // 정수 청크 → 부동소수
    let fw = pow2(q0);
    for (let i = jz; i >= 0; i--) {
        krQ[i] = fw * krIq[i];
        fw *= TWON24;
    }

    // PIo2[0..jp] · q[jz..0]
    for (let i = jz; i >= 0; i--) {
        fw = 0;
        for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2_CHUNKS[k] * krQ[i + k];
        krFq[jz - i] = fw;
    }

    // fq[] 를 (y0, y1) 로 압축 (prec = 2)
    fw = 0;
    for (let i = jz; i >= 0; i--) fw += krFq[i];
    remY0 = ih === 0 ? fw : -fw;
    fw = krFq[0] - fw;
    for (let i = 1; i <= jz; i++) fw += krFq[i];
    remY1 = ih === 0 ? fw : -fw;
    return n & 7;
}

/**
 * x rem π/2 (fdlibm __ieee754_rem_pio2). 반환 n, 나머지는 remY0 + remY1.
 *  - |x| ≤ π/4: 축소 불필요
 *  - |x| < 3π/4: n = ±1, 33+53(또는 33+33+53)비트 π 로 충분
 *  - |x| ≤ 2^19·π/2: n = round(x·2/π), π/2 를 최대 3조각(151비트)까지 써서 상쇄 보정
 *  - 그 이상: Payne–Hanek
 */
function remPio2(x: number): number {
    const hx = hiWord(x);
    const ix = hx & 0x7fffffff;
    if (ix <= 0x3fe921fb) {                    // |x| ≤ π/4
        remY0 = x;
        remY1 = 0;
        return 0;
    }
    if (ix < 0x4002d97c) {                     // |x| < 3π/4, n = ±1
        if (hx > 0) {
            let z = x - PIO2_1;
            if (ix !== 0x3ff921fb) {           // 33+53비트 π 면 충분
                remY0 = z - PIO2_1T;
                remY1 = (z - remY0) - PIO2_1T;
            } else {                           // π/2 근처: 33+33+53비트 π
                z -= PIO2_2;
                remY0 = z - PIO2_2T;
                remY1 = (z - remY0) - PIO2_2T;
            }
            return 1;
        }
        let z = x + PIO2_1;
        if (ix !== 0x3ff921fb) {
            remY0 = z + PIO2_1T;
            remY1 = (z - remY0) + PIO2_1T;
        } else {
            z += PIO2_2;
            remY0 = z + PIO2_2T;
            remY1 = (z - remY0) + PIO2_2T;
        }
        return -1;
    }
    if (ix <= 0x413921fb) {                    // |x| ≤ 2^19·π/2, 중간 크기
        const t = Math.abs(x);
        const n = (t * INVPIO2 + 0.5) | 0;
        const fn = n;
        let r = t - fn * PIO2_1;
        let w = fn * PIO2_1T;                  // 1차: 85비트 정확
        let y0: number;
        if (n < 32 && ix !== NPIO2_HW[n - 1]) {
            y0 = r - w;                        // 상쇄 없음, 빠른 경로
        } else {
            const j = ix >> 20;
            y0 = r - w;
            let i = j - ((hiWord(y0) >>> 20) & 0x7ff);
            if (i > 16) {                      // 2차 반복: 118비트
                let tt = r;
                w = fn * PIO2_2;
                r = tt - w;
                w = fn * PIO2_2T - ((tt - r) - w);
                y0 = r - w;
                i = j - ((hiWord(y0) >>> 20) & 0x7ff);
                if (i > 49) {                  // 3차 반복: 151비트, 모든 경우를 덮는다
                    tt = r;
                    w = fn * PIO2_3;
                    r = tt - w;
                    w = fn * PIO2_3T - ((tt - r) - w);
                    y0 = r - w;
                }
            }
        }
        const y1 = (r - y0) - w;
        if (hx < 0) {
            remY0 = -y0;
            remY1 = -y1;
            return -n;
        }
        remY0 = y0;
        remY1 = y1;
        return n;
    }
    // 큰 인자
    if (ix >= 0x7ff00000) {                    // Inf 또는 NaN
        remY0 = remY1 = x - x;
        return 0;
    }
    // z = scalbn(|x|, ilogb(x) − 23): 가수를 24비트 정수 조각 3개로 분해
    const e0 = (ix >> 20) - 1046;
    let z = fromWords(ix - (e0 << 20), loWord(x));
    for (let i = 0; i < 2; i++) {
        krTx[i] = Math.trunc(z);
        z = (z - krTx[i]) * TWO24;
    }
    krTx[2] = z;
    let nx = 3;
    while (krTx[nx - 1] === 0) nx--;           // 0 항 건너뛰기
    const n = kernelRemPio2(nx, e0);
    if (hx < 0) {
        remY0 = -remY0;
        remY1 = -remY1;
        return -n;
    }
    return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// 커널: [−π/4, π/4] 구간의 sin / cos / tan.  x 는 주값, y 는 꼬리(x 의 하위 확장).
// ─────────────────────────────────────────────────────────────────────────────
const S1 = -1.66666666666666324348e-01;   // 0xBFC55555 55555549
const S2 = 8.33333333332248946124e-03;    // 0x3F811111 1110F8A6
const S3 = -1.98412698298579493134e-04;   // 0xBF2A01A0 19C161D5
const S4 = 2.75573137070700676789e-06;    // 0x3EC71DE3 57B1FE7D
const S5 = -2.50507602534068634195e-08;   // 0xBE5AE5E6 8A2B9CEB
const S6 = 1.58969099521155010221e-10;    // 0x3DE5D93A 5ACFD57C

/**
 * sin(x + y), |x| ≲ π/4. 13차 홀수 다항식 (Remez 오차 ≤ 2^-58).
 * sin(x+y) ≈ sin x + (1 − x²/2)·y 이므로 iy=1 이면 꼬리 y 를 보정한다.
 */
function kernelSin(x: number, y: number, iy: number): number {
    const ix = hiWord(x) & 0x7fffffff;
    if (ix < 0x3e400000) return x;             // |x| < 2^-27 → sin x = x
    const z = x * x;
    const v = z * x;
    const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if (iy === 0) return x + v * (S1 + z * r);
    return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02;    // 0x3FA55555 5555554C
const C2 = -1.38888888888741095749e-03;   // 0xBF56C16C 16C15177
const C3 = 2.48015872894767294178e-05;    // 0x3EFA01A0 19CB1590
const C4 = -2.75573143513906633035e-07;   // 0xBE927E4F 809C52AD
const C5 = 2.08757232129817482790e-09;    // 0x3E21EE9E BDB4B1C4
const C6 = -1.13596475577881948265e-11;   // 0xBDA8FAE9 BE8838D4

/**
 * cos(x + y), |x| ≲ π/4. 14차 짝수 다항식. cos(x+y) ≈ cos x − x·y.
 * |x| ≥ 0.3 이면 qx(≈x²/8, 하위 32비트 0) 를 빼서 1 − qx 와 x²/2 − qx 가 정확해지도록 한다.
 */
function kernelCos(x: number, y: number): number {
    const ix = hiWord(x) & 0x7fffffff;
    if (ix < 0x3e400000) return 1;             // |x| < 2^-27 → cos x = 1
    const z = x * x;
    const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if (ix < 0x3fd33333) {                     // |x| < 0.3
        return 1 - (0.5 * z - (z * r - x * y));
    }
    const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);   // x > 0.78125 ? 0.28125 : |x|/4
    const iz = 0.5 * z - qx;
    const a = 1 - qx;
    return a - (iz - (z * r - x * y));
}

const T = new Float64Array([
    3.33333333333334091986e-01,   // 3FD55555 55555563
    1.33333333333201242699e-01,   // 3FC11111 1110FE7A
    5.39682539762260521377e-02,   // 3FABA1BA 1BB341FE
    2.18694882948595424599e-02,   // 3F9664F4 8406D637
    8.86323982359930005737e-03,   // 3F8226E3 E96E8493
    3.59207910759131235356e-03,   // 3F6D6D22 C9560328
    1.45620945432529025516e-03,   // 3F57DBC8 FEE08315
    5.88041240820264096874e-04,   // 3F4344D8 F2F26501
    2.46463134818469906812e-04,   // 3F3026F7 1A8D1068
    7.81794442939557092300e-05,   // 3F147E88 A03792A6
    7.14072491382608190305e-05,   // 3F12B80F 32F0A7E9
    -1.85586374855275456654e-05,  // BEF375CB DB605373
    2.59073051863633712884e-05,   // 3EFB2A70 74BF7AD4
]);
const PIO4 = 7.85398163397448278999e-01;      // 3FE921FB 54442D18
const PIO4LO = 3.06161699786838301793e-17;    // 3C81A626 33145C07

/**
 * tan(x + y) (iy = 1) 또는 −1/tan(x + y) (iy = −1), |x| ≲ π/4.
 * [0, 0.67434] 는 27차 홀수 다항식, 그 위는 tan(π/4 − y) = (1 − tan y)/(1 + tan y) 로 되접는다.
 */
function kernelTan(x: number, y: number, iy: number): number {
    const hx = hiWord(x);
    const ix = hx & 0x7fffffff;
    if (ix < 0x3e300000) {                     // |x| < 2^-28
        if (((ix | loWord(x)) | (iy + 1)) === 0) {
            return 1 / Math.abs(x);            // x = ±0, iy = −1 → −1/0 → +∞ (fdlibm 규약)
        }
        if (iy === 1) return x;
        // −1/(x+y) 를 정밀하게
        const w = x + y;
        const z = withLowWord(w, 0);
        const v = y - (z - x);
        const a = -1 / w;
        const t = withLowWord(a, 0);
        const s = 1 + t * z;
        return t + a * (s + t * v);
    }
    let xx = x;
    let yy = y;
    if (ix >= 0x3fe59428) {                    // |x| ≥ 0.6744 → π/4 − x 로
        if (hx < 0) {
            xx = -xx;
            yy = -yy;
        }
        const z = PIO4 - xx;
        const w = PIO4LO - yy;
        xx = z + w;
        yy = 0;
    }
    const z = xx * xx;
    const w = z * z;
    // x^5·(T1 + x²T2 + …) 를 홀수/짝수 항으로 나눠 평가
    let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
    const v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
    const s = z * xx;
    r = yy + z * (s * (r + v) + yy);
    r += T[0] * s;
    const ww = xx + r;
    if (ix >= 0x3fe59428) {
        const vv = iy;
        return (1 - ((hx >> 30) & 2)) * (vv - 2.0 * (xx - (ww * ww / (ww + vv) - r)));
    }
    if (iy === 1) return ww;
    // −1/(x+r) 를 정밀하게 (단순히 −1/(x+r) 하면 2 ulp 까지 틀린다)
    const zz = withLowWord(ww, 0);
    const vv = r - (zz - xx);                  // zz + vv = r + x
    const a = -1.0 / ww;
    const t = withLowWord(a, 0);
    const ss = 1.0 + t * zz;
    return t + a * (ss + t * vv);
}

// ─────────────────────────────────────────────────────────────────────────────
// 삼각함수
// ─────────────────────────────────────────────────────────────────────────────

/** sin x. |x| ≤ π/4 는 커널 직행, 그 밖은 n·π/2 축소 후 사분면에 따라 ±sin/±cos. */
export function sin(x: number): number {
    const ix = hiWord(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
    if (ix >= 0x7ff00000) return x - x;        // sin(±∞), sin(NaN) = NaN
    const n = remPio2(x);
    switch (n & 3) {
        case 0: return kernelSin(remY0, remY1, 1);
        case 1: return kernelCos(remY0, remY1);
        case 2: return -kernelSin(remY0, remY1, 1);
        default: return -kernelCos(remY0, remY1);
    }
}

/** cos x. */
export function cos(x: number): number {
    const ix = hiWord(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelCos(x, 0);
    if (ix >= 0x7ff00000) return x - x;
    const n = remPio2(x);
    switch (n & 3) {
        case 0: return kernelCos(remY0, remY1);
        case 1: return -kernelSin(remY0, remY1, 1);
        case 2: return -kernelCos(remY0, remY1);
        default: return kernelSin(remY0, remY1, 1);
    }
}

/** tan x. n 이 홀수면 tan(x) = −1/tan(x − n·π/2). */
export function tan(x: number): number {
    const ix = hiWord(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelTan(x, 0, 1);
    if (ix >= 0x7ff00000) return x - x;
    const n = remPio2(x);
    return kernelTan(remY0, remY1, 1 - ((n & 1) << 1));   // n 짝수 → 1, 홀수 → −1
}

// ─────────────────────────────────────────────────────────────────────────────
// 역삼각함수
// ─────────────────────────────────────────────────────────────────────────────
const ATAN_HI = new Float64Array([
    4.63647609000806093515e-01,   // atan(0.5) hi  0x3FDDAC67 0561BB4F
    7.85398163397448278999e-01,   // atan(1.0) hi  0x3FE921FB 54442D18
    9.82793723247329054082e-01,   // atan(1.5) hi  0x3FEF730B D281F69B
    1.57079632679489655800e+00,   // atan(inf) hi  0x3FF921FB 54442D18
]);
const ATAN_LO = new Float64Array([
    2.26987774529616870924e-17,   // 0x3C7A2B7F 222F65E2
    3.06161699786838301793e-17,   // 0x3C81A626 33145C07
    1.39033110312309984516e-17,   // 0x3C700788 7AF0CBBD
    6.12323399573676603587e-17,   // 0x3C91A626 33145C07
]);
const AT = new Float64Array([
    3.33333333333329318027e-01,   // 0x3FD55555 5555550D
    -1.99999999998764832476e-01,  // 0xBFC99999 9998EBC4
    1.42857142725034663711e-01,   // 0x3FC24924 920083FF
    -1.11111104054623557880e-01,  // 0xBFBC71C6 FE231671
    9.09088713343650656196e-02,   // 0x3FB745CD C54C206E
    -7.69187620504482999495e-02,  // 0xBFB3B0F2 AF749A6D
    6.66107313738753120669e-02,   // 0x3FB10D66 A0D03D51
    -5.83357013379057348645e-02,  // 0xBFADDE2D 52DEFD9A
    4.97687799461593236017e-02,   // 0x3FA97B4B 24760DEB
    -3.65315727442169155270e-02,  // 0xBFA2B444 2C6A6C2F
    1.62858201153657823623e-02,   // 0x3F90AD3A E322DA11
]);

/**
 * atan x. |x| 를 [0, 7/16), [7/16, 11/16), [11/16, 19/16), [19/16, 39/16), [39/16, ∞) 로 나눠
 * 각각 atan(0), atan(1/2), atan(1), atan(3/2), atan(∞) 를 기준으로 atan 의 덧셈정리로 옮긴 뒤
 * [−0.4375, 0.4375] 구간 다항식으로 평가한다.
 */
export function atan(x: number): number {
    const hx = hiWord(x);
    const ix = hx & 0x7fffffff;
    if (ix >= 0x44100000) {                    // |x| ≥ 2^66
        if (ix > 0x7ff00000 || (ix === 0x7ff00000 && loWord(x) !== 0)) return x + x;   // NaN
        return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
    }
    let id: number;
    let xr: number;
    if (ix < 0x3fdc0000) {                     // |x| < 0.4375
        if (ix < 0x3e400000) return x;         // |x| < 2^-27
        id = -1;
        xr = x;
    } else {
        xr = Math.abs(x);
        if (ix < 0x3ff30000) {                 // |x| < 1.1875
            if (ix < 0x3fe60000) {             // 7/16 ≤ |x| < 11/16
                id = 0;
                xr = (2.0 * xr - 1) / (2.0 + xr);
            } else {                           // 11/16 ≤ |x| < 19/16
                id = 1;
                xr = (xr - 1) / (xr + 1);
            }
        } else if (ix < 0x40038000) {          // |x| < 2.4375
            id = 2;
            xr = (xr - 1.5) / (1 + 1.5 * xr);
        } else {                               // 2.4375 ≤ |x| < 2^66
            id = 3;
            xr = -1.0 / xr;
        }
    }
    const z = xr * xr;
    const w = z * z;
    // Σ aT[i]·z^(i+1) 을 홀수/짝수 항으로 분리
    const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if (id < 0) return xr - xr * (s1 + s2);
    const zz = ATAN_HI[id] - ((xr * (s1 + s2) - ATAN_LO[id]) - xr);
    return hx < 0 ? -zz : zz;
}

const PI_O_4 = 7.8539816339744827900e-01;     // 0x3FE921FB 54442D18
const PI_O_2 = 1.5707963267948965580e+00;     // 0x3FF921FB 54442D18
const PI_LO = 1.2246467991473531772e-16;      // 0x3CA1A626 33145C07  (π − PI 의 꼬리)
const TINY = 1.0e-300;

/**
 * atan2(y, x). 부호·특수값(±0, ±∞) 처리는 fdlibm/ECMAScript 규약 그대로.
 * 일반 경우 atan(|y/x|) 를 사분면에 맞춰 π 또는 −π 로 옮긴다.
 */
export function atan2(y: number, x: number): number {
    if (x !== x || y !== y) return x + y;      // NaN
    const hx = hiWord(x);
    const lx = loWord(x);
    const ix = hx & 0x7fffffff;
    const hy = hiWord(y);
    const ly = loWord(y);
    const iy = hy & 0x7fffffff;
    if (((hx - 0x3ff00000) | lx) === 0) return atan(y);      // x = 1.0
    const m = ((hy >> 31) & 1) | ((hx >> 30) & 2);          // 2·sign(x) + sign(y)

    if ((iy | ly) === 0) {                     // y = ±0
        switch (m) {
            case 0:
            case 1: return y;                  // atan(±0, +x) = ±0
            case 2: return PI + TINY;          // atan(+0, −x) = π
            default: return -PI - TINY;        // atan(−0, −x) = −π
        }
    }
    if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;   // x = ±0

    if (ix === 0x7ff00000) {                   // x = ±∞
        if (iy === 0x7ff00000) {
            switch (m) {
                case 0: return PI_O_4 + TINY;          // atan(+∞, +∞)
                case 1: return -PI_O_4 - TINY;         // atan(−∞, +∞)
                case 2: return 3.0 * PI_O_4 + TINY;    // atan(+∞, −∞)
                default: return -3.0 * PI_O_4 - TINY;  // atan(−∞, −∞)
            }
        }
        switch (m) {
            case 0: return 0;                  // atan(+y, +∞)
            case 1: return -0;                 // atan(−y, +∞)
            case 2: return PI + TINY;          // atan(+y, −∞)
            default: return -PI - TINY;        // atan(−y, −∞)
        }
    }
    if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;   // y = ±∞

    // y/x 계산
    const k = (iy - ix) >> 20;
    let z: number;
    if (k > 60) {                              // |y/x| > 2^60
        z = PI_O_2 + 0.5 * PI_LO;
        return (m & 1) === 0 ? z : -z;
    } else if (hx < 0 && k < -60) {
        z = 0;                                 // 0 > |y|/x > −2^-60
    } else {
        z = atan(Math.abs(y / x));
    }
    switch (m) {
        case 0: return z;                      // (+, +)
        case 1: return -z;                     // (−, +)
        case 2: return PI - (z - PI_LO);       // (+, −)
        default: return (z - PI_LO) - PI;      // (−, −)
    }
}

const PIO2_HI = 1.57079632679489655800e+00;   // 0x3FF921FB 54442D18
const PIO2_LO = 6.12323399573676603587e-17;   // 0x3C91A626 33145C07
const PIO4_HI = 7.85398163397448278999e-01;   // 0x3FE921FB 54442D18
const PS0 = 1.66666666666666657415e-01;       // 0x3FC55555 55555555
const PS1 = -3.25565818622400915405e-01;      // 0xBFD4D612 03EB6F7D
const PS2 = 2.01212532134862925881e-01;       // 0x3FC9C155 0E884455
const PS3 = -4.00555345006794114027e-02;      // 0xBFA48228 B5688F3B
const PS4 = 7.91534994289814532176e-04;       // 0x3F49EFE0 7501B288
const PS5 = 3.47933107596021167570e-05;       // 0x3F023DE1 0DFDF709
const QS1 = -2.40339491173441421878e+00;      // 0xC0033A27 1C8A2D4B
const QS2 = 2.02094576023350569471e+00;       // 0x40002AE5 9C598AC8
const QS3 = -6.88283971605453293030e-01;      // 0xBFE6066C 1B8D0159
const QS4 = 7.70381505559019352791e-02;       // 0x3FB3B8C5 B12E9282

/** asin/acos 공용 유리 근사 R(t) = P(t)/Q(t): asin(x) ≈ x + x·t·R(t), t = x². */
function asinR(t: number): number {
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    return p / q;
}

/**
 * asin x. |x| < 0.5 는 x + x³R(x²), 0.5 ≤ |x| < 1 은 π/2 − 2·asin(√((1−|x|)/2)).
 * |x| > 1 → NaN, |x| = 1 → ±π/2.
 */
export function asin(x: number): number {
    const hx = hiWord(x);
    const ix = hx & 0x7fffffff;
    if (ix >= 0x3ff00000) {                    // |x| ≥ 1
        if (((ix - 0x3ff00000) | loWord(x)) === 0) return x * PIO2_HI + x * PIO2_LO;   // asin(±1) = ±π/2
        return NaN;
    }
    if (ix < 0x3fe00000) {                     // |x| < 0.5
        if (ix < 0x3e400000) return x;         // |x| < 2^-27
        const t = x * x;
        return x + x * asinR(t);
    }
    // 0.5 ≤ |x| < 1
    const w = 1 - Math.abs(x);
    const t = w * 0.5;
    const r = asinR(t);
    const s = Math.sqrt(t);
    let res: number;
    if (ix >= 0x3fef3333) {                    // |x| > 0.975
        res = PIO2_HI - (2.0 * (s + s * r) - PIO2_LO);
    } else {
        const ws = withLowWord(s, 0);          // s 의 상위 절반 → ws² 이 정확
        const c = (t - ws * ws) / (s + ws);    // s ≈ ws + c
        const p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
        const q = PIO4_HI - 2.0 * ws;
        res = PIO4_HI - (p - q);
    }
    return hx > 0 ? res : -res;
}

/**
 * acos x = π/2 − asin x. |x| < 0.5 는 π/2 − (x + x³R), x > 0.5 는 2·asin(√((1−x)/2)),
 * x < −0.5 는 π − 2·asin(√((1+x)/2)). |x| > 1 → NaN.
 */
export function acos(x: number): number {
    const hx = hiWord(x);
    const ix = hx & 0x7fffffff;
    if (ix >= 0x3ff00000) {                    // |x| ≥ 1
        if (((ix - 0x3ff00000) | loWord(x)) === 0) {
            return hx > 0 ? 0 : PI + 2.0 * PIO2_LO;   // acos(1) = 0, acos(−1) = π
        }
        return NaN;
    }
    if (ix < 0x3fe00000) {                     // |x| < 0.5
        if (ix <= 0x3c600000) return PIO2_HI + PIO2_LO;   // |x| < 2^-57
        const r = asinR(x * x);
        return PIO2_HI - (x - (PIO2_LO - x * r));
    }
    if (hx < 0) {                              // x < −0.5
        const z = (1 + x) * 0.5;
        const r = asinR(z);
        const s = Math.sqrt(z);
        const w = r * s - PIO2_LO;
        return PI - 2.0 * (s + w);
    }
    // x > 0.5
    const z = (1 - x) * 0.5;
    const s = Math.sqrt(z);
    const df = withLowWord(s, 0);
    const c = (z - df * df) / (s + df);
    const r = asinR(z);
    const w = r * s + c;
    return 2.0 * (df + w);
}

// ─────────────────────────────────────────────────────────────────────────────
// exp / log / cbrt
// ─────────────────────────────────────────────────────────────────────────────
const O_THRESHOLD = 7.09782712893383973096e+02;   // 0x40862E42 FEFA39EF
const U_THRESHOLD = -7.45133219101941108420e+02;  // 0xC0874910 D52D3051
const LN2_HI = 6.93147180369123816490e-01;        // 0x3FE62E42 FEE00000
const LN2_LO = 1.90821492927058770002e-10;        // 0x3DEA39EF 35793C76
const INVLN2 = 1.44269504088896338700e+00;        // 0x3FF71547 652B82FE
const EP1 = 1.66666666666666019037e-01;           // 0x3FC55555 5555553E
const EP2 = -2.77777777770155933842e-03;          // 0xBF66C16C 16BEBD93
const EP3 = 6.61375632143793436117e-05;           // 0x3F11566A AF25DE2C
const EP4 = -1.65339022054652515390e-06;          // 0xBEBBBD41 C5D26BF1
const EP5 = 4.13813679705723846039e-08;           // 0x3E663769 72BEA4D0
const E_CONST = 2.718281828459045;                // 0x4005BF0A 8B145769
const HUGE = 1.0e+300;
const TWOM1000 = 9.33263618503218878990e-302;     // 2^-1000
const TWO1023 = 8.988465674311579539e307;         // 2^1023

/**
 * exp x. x = k·ln2 + r (|r| ≤ ½ln2) 로 줄인 뒤 r 의 exp 를 유리 근사
 * exp(r) = 1 + r + r·c/(2 − c), c = r − r²·P(r²) 로 구하고 2^k 를 곱한다.
 * V8 과 마찬가지로 exp(1) 은 E 를 직접 돌려준다(알고리즘이 마지막 비트를 틀리는 특수 케이스).
 */
export function exp(x: number): number {
    let hx = hiWord(x);
    const xsb = (hx >>> 31) & 1;              // 부호 비트
    hx &= 0x7fffffff;

    if (hx >= 0x40862e42) {                    // |x| ≥ 709.78…
        if (hx >= 0x7ff00000) {
            if (((hx & 0xfffff) | loWord(x)) !== 0) return x + x;   // NaN
            return xsb === 0 ? x : 0;          // exp(±∞) = ∞, 0
        }
        if (x > O_THRESHOLD) return HUGE * HUGE;           // 오버플로 → ∞
        if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;   // 언더플로 → 0
    }

    // 인자 축소
    let k = 0;
    let hi = 0;
    let lo = 0;
    let xr = x;
    if (hx > 0x3fd62e42) {                     // |x| > ½ ln2
        if (hx < 0x3ff0a2b2) {                 // |x| < 1.5 ln2
            if (x === 1.0) return E_CONST;
            hi = xsb === 0 ? x - LN2_HI : x + LN2_HI;
            lo = xsb === 0 ? LN2_LO : -LN2_LO;
            k = 1 - xsb - xsb;
        } else {
            k = (INVLN2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;   // 0 방향 절삭
            const t = k;
            hi = x - t * LN2_HI;               // t·ln2HI 는 정확
            lo = t * LN2_LO;
        }
        xr = hi - lo;
    } else if (hx < 0x3e300000) {              // |x| < 2^-28
        return 1 + x;
    }

    // xr 은 이제 기본 구간
    const t = xr * xr;
    const twopk = k >= -1021
        ? fromWords(0x3ff00000 + (k << 20), 0)
        : fromWords(0x3ff00000 + ((k + 1000) << 20), 0);
    const c = xr - t * (EP1 + t * (EP2 + t * (EP3 + t * (EP4 + t * EP5))));
    if (k === 0) return 1 - ((xr * c) / (c - 2.0) - xr);
    const y = 1 - ((lo - (xr * c) / (2.0 - c)) - hi);
    if (k >= -1021) {
        if (k === 1024) return y * 2.0 * TWO1023;
        return y * twopk;
    }
    return y * twopk * TWOM1000;
}

const TWO54 = 1.80143985094819840000e+16;     // 0x43500000 00000000
const LG1 = 6.666666666666735130e-01;         // 3FE55555 55555593
const LG2 = 3.999999999940941908e-01;         // 3FD99999 9997FA04
const LG3 = 2.857142874366239149e-01;         // 3FD24924 94229359
const LG4 = 2.222219843214978396e-01;         // 3FCC71C5 1D8E78AF
const LG5 = 1.818357216161805012e-01;         // 3FC74664 96CB03DE
const LG6 = 1.531383769920937332e-01;         // 3FC39A09 D078C69F
const LG7 = 1.479819860511658591e-01;         // 3FC2F112 DF3E5244

/**
 * 자연로그. x = 2^k·(1+f), √2/2 < 1+f < √2 로 정규화하고
 * log(1+f) = 2s + (2/3)s³ + … (s = f/(2+f)) 를 14차까지 다항식으로 근사한 뒤 k·ln2 를 더한다.
 * log(±0) = −∞, log(x<0) = NaN, log(∞) = ∞.
 */
export function log(x: number): number {
    let hx = hiWord(x);
    const lx = loWord(x);
    let xr = x;
    let k = 0;
    if (hx < 0x00100000) {                     // x < 2^-1022
        if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;   // log(±0)
        if (hx < 0) return NaN;                // log(음수)
        k -= 54;
        xr *= TWO54;                           // 비정규수 → 스케일 업
        hx = hiWord(xr);
    }
    if (hx >= 0x7ff00000) return xr + xr;      // ∞, NaN
    k += (hx >> 20) - 1023;
    hx &= 0x000fffff;
    const i0 = (hx + 0x95f64) & 0x100000;
    xr = withHighWord(xr, hx | (i0 ^ 0x3ff00000));   // x 또는 x/2 로 정규화
    k += i0 >> 20;
    const f = xr - 1.0;
    if ((0x000fffff & (2 + hx)) < 3) {         // −2^-20 ≤ f < 2^-20
        if (f === 0) {
            if (k === 0) return 0;
            return k * LN2_HI + k * LN2_LO;
        }
        const r = f * f * (0.5 - 0.33333333333333333 * f);
        if (k === 0) return f - r;
        return k * LN2_HI - ((r - k * LN2_LO) - f);
    }
    const s = f / (2.0 + f);
    const dk = k;
    const z = s * s;
    let i = hx - 0x6147a;
    const w = z * z;
    const j = 0x6b851 - hx;
    const t1 = w * (LG2 + w * (LG4 + w * LG6));
    const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    const r = t2 + t1;
    if (i > 0) {
        const hfsq = 0.5 * f * f;
        if (k === 0) return f - (hfsq - s * (hfsq + r));
        return dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f);
    }
    if (k === 0) return f - s * (f - r);
    return dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f);
}

const CB_B1 = 715094163;    // (1023 − 1023/3 − 0.03306235651)·2^20
const CB_B2 = 696219795;    // (1023 − 1023/3 − 54/3 − 0.03306235651)·2^20
const CB_P0 = 1.87595182427177009643;     // 0x3FFE03E6 0F61E692
const CB_P1 = -1.88497979543377169875;    // 0xBFFE28E0 92F02420
const CB_P2 = 1.621429720105354466140;    // 0x3FF9F160 4A49D6C2
const CB_P3 = -0.758397934778766047437;   // 0xBFE844CB BEE751D9
const CB_P4 = 0.145996192886612446982;    // 0x3FC2B000 D4E4EDD7

/**
 * 세제곱근. 지수 비트를 정수 나눗셈으로 5비트 근사 → 4차 다항식으로 23비트 → 뉴턴 1회로 53비트 (오차 < 0.667 ulp).
 * cbrt(±0) = ±0, cbrt(±∞) = ±∞, 음수는 부호만 붙여 대칭.
 */
export function cbrt(x: number): number {
    let hx = hiWord(x);
    const low = loWord(x);
    const sign = hx & 0x80000000;              // 부호 (int32 이므로 음수면 −2^31)
    hx ^= sign;
    if (hx >= 0x7ff00000) return x + x;        // cbrt(NaN, ∞) = 자기 자신

    let t: number;
    if (hx < 0x00100000) {                     // 0 또는 비정규수
        if ((hx | low) === 0) return x;        // cbrt(±0) = ±0
        t = TWO54 * x;
        const high = hiWord(t) & 0x7fffffff;
        t = fromWords(sign | (((high / 3) | 0) + CB_B2), 0);
    } else {
        t = fromWords(sign | (((hx / 3) | 0) + CB_B1), 0);
    }

    // 23비트 근사: cbrt(x) = t·cbrt(x/t³) ≈ t·P(t³/x)
    let r = (t * t) * (t / x);
    t = t * ((CB_P0 + r * (CB_P1 + r * CB_P2)) + ((r * r) * r) * (CB_P3 + r * CB_P4));

    // t 를 0 에서 멀어지는 쪽으로 23비트로 반올림: bits = (bits + 2^31) & ~(2^30 − 1)
    f64[0] = t;
    let tl = u32[LO];
    let th = u32[HI];
    if (tl >= 0x80000000) th = (th + 1) | 0;   // 하위 워드 올림
    tl = (tl + 0x80000000) & 0xc0000000;
    t = fromWords(th, tl);

    // 뉴턴 1회: 53비트, 오차 < 0.667 ulp
    const s = t * t;                           // 정확
    r = x / s;                                 // 오차 ≤ 0.5 ulp
    const w = t + t;                           // 정확
    r = (r - t) / (w + r);                     // r − t 정확, w + r ≈ 3t
    return t + t * r;
}
