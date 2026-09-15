/**
 * 비행 한 스텝(반암시적 오일러, DT 1/120). 루프 안 초월함수 0 — sqrt 뿐.
 * a = g + K·V·(−Cd·v_rel + Cl·(ŝ × v_rel)),  v_rel = v − wind(z, t),  S = R·ω/V,  ω ← ω·K_SPIN
 */
import { BALL_R, cdOf, clOf, DT, G, K_AERO, K_SPIN } from "./params.js";
import { windAt } from "./wind.js";
import type { WindEnv } from "./types.js";

/** 가변 상태(엔진 내부 전용 — 바깥엔 불변 BallState3 로 내보낸다) */
export interface MState { px: number; py: number; pz: number; vx: number; vy: number; vz: number; wx: number; wy: number; wz: number; t: number }

export function stepAir(s: MState, env: WindEnv, hasWind: boolean): void {
    let rx = s.vx, ry = s.vy, rz = s.vz;
    if (hasWind) { const w = windAt(env, s.pz, s.t); rx -= w.x; ry -= w.y; rz -= w.z; }
    const V = Math.sqrt(rx * rx + ry * ry + rz * rz);
    let ax = 0, ay = 0, az = -G;
    if (V > 1e-6) {
        const om = Math.sqrt(s.wx * s.wx + s.wy * s.wy + s.wz * s.wz);
        const S = (BALL_R * om) / V;
        const cd = cdOf(S, V), cl = clOf(S);
        const kV = K_AERO * V;
        ax -= kV * cd * rx; ay -= kV * cd * ry; az -= kV * cd * rz;
        if (om > 1e-6) {
            const sx = s.wx / om, sy = s.wy / om, sz = s.wz / om;
            // ŝ × v_rel
            const cx = sy * rz - sz * ry, cy = sz * rx - sx * rz, cz = sx * ry - sy * rx;
            ax += kV * cl * cx; ay += kV * cl * cy; az += kV * cl * cz;
        }
    }
    s.vx += ax * DT; s.vy += ay * DT; s.vz += az * DT;
    s.px += s.vx * DT; s.py += s.vy * DT; s.pz += s.vz * DT;
    s.wx *= K_SPIN; s.wy *= K_SPIN; s.wz *= K_SPIN;
    s.t += DT;
}
