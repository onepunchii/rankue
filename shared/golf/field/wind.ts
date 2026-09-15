/**
 * 바람 — 10 m 기준풍 w10 에 높이 프로파일(표 보간) × 결정론 돌풍(120점 LUT, 위상은 시드).
 * 같은 (방·홀·타수) 시드면 전원 같은 바람 → 공정·재현 가능.
 */
import { sin, TWO_PI } from "../../sim/dmath.js";
import { GUST_AMPLITUDE, GUST_PERIOD_S, WIND_PROFILE_F, WIND_PROFILE_H } from "./params.js";
import type { Vec2, Vec3, WindEnv } from "./types.js";

const GUST_N = 120;
const GUST_LUT: readonly number[] = (() => {
    const out: number[] = [];
    for (let i = 0; i < GUST_N; i++) out.push(sin((TWO_PI * i) / GUST_N));   // 모듈 로드 때 dmath 로 1회
    return out;
})();

export function profileAt(z: number): number {
    const h = Math.max(0, z);
    if (h <= WIND_PROFILE_H[0]) return WIND_PROFILE_F[0];
    const n = WIND_PROFILE_H.length;
    if (h >= WIND_PROFILE_H[n - 1]) return WIND_PROFILE_F[n - 1];
    for (let i = 1; i < n; i++) {
        if (h <= WIND_PROFILE_H[i]) {
            const t = (h - WIND_PROFILE_H[i - 1]) / (WIND_PROFILE_H[i] - WIND_PROFILE_H[i - 1]);
            return WIND_PROFILE_F[i - 1] + t * (WIND_PROFILE_F[i] - WIND_PROFILE_F[i - 1]);
        }
    }
    return WIND_PROFILE_F[n - 1];
}

/** 돌풍 배율 1 + A·G[(t/6s + 위상) mod 1]. gustSeed 0 = 돌풍 없음 */
export function gustAt(seed: number, t: number): number {
    if (!seed) return 1;
    const phase = (seed >>> 0) % GUST_N;
    const idx = (Math.floor((t / GUST_PERIOD_S) * GUST_N) + phase) % GUST_N;
    return 1 + GUST_AMPLITUDE * GUST_LUT[idx];
}

export function windAt(env: WindEnv, z: number, t: number): Vec3 {
    const f = profileAt(z) * gustAt(env.gustSeed, t);
    return { x: env.w10.x * f, y: env.w10.y * f, z: 0 };
}

/** (방 시드, 홀, 타수) → 돌풍 위상 시드. 32비트 정수 섞기(fnv 유사) */
export function gustSeedFor(roomSeed: number, holeIndex: number, strokeIdx: number): number {
    let h = (roomSeed ^ 0x811c9dc5) >>> 0;
    h = Math.imul(h ^ (holeIndex + 1), 16777619) >>> 0;
    h = Math.imul(h ^ (strokeIdx + 1), 16777619) >>> 0;
    return h || 1;
}

export const NO_WIND: WindEnv = { w10: { x: 0, y: 0 }, gustSeed: 0 };
export function steadyWind(w10: Vec2): WindEnv { return { w10, gustSeed: 0 }; }
