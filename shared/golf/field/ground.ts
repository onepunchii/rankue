/**
 * 착지·바운스·구름·컵(조사 §6·§7).
 * 바운스: Penner 유효경사(θc = kc·|v_n|, ≤25°) + 속도 의존 COR + 그립/슬립 임펄스 J = min((2/7)M|u|, μ(1+e)M|v_n|).
 * 구름: a = −g∇h − a_roll·v̂ − 0.0046|v|v. 컵: v_cap(d) = (2√(Rh²−d²) − R)·15.16, 립아웃 e 0.3 + 20 % 감속.
 */
import { cos, sin } from "../../sim/dmath.js";
import { BALL_I, BALL_M, BALL_R, CUP_CAPTURE_K, CUP_RH, DEG, DT, G, LIP_DAMP, LIP_E, ROLL_AIR_K, ROLL_STOP_SPEED, type SurfaceParams } from "./params.js";
import type { MState } from "./flight.js";
import type { Vec2 } from "./types.js";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface BounceOut { readonly bounceUp: number }

/** 지면 법선(기울기에서). 위 방향 */
export function normalOf(grad: Vec2): { x: number; y: number; z: number } {
    const nx = -grad.x, ny = -grad.y, nz = 1;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { x: nx / l, y: ny / l, z: nz / l };
}

/** 바운스 1회. s.v·w 를 갱신하고 되튐 속도(법선 방향 +)를 돌려준다 */
export function bounce(s: MState, sp: SurfaceParams, grad: Vec2): BounceOut {
    const n = normalOf(grad);
    const vn = s.vx * n.x + s.vy * n.y + s.vz * n.z;
    if (vn >= 0) return { bounceUp: 0 };
    // 진행 방향(접선) 단위벡터
    let tx = s.vx - vn * n.x, ty = s.vy - vn * n.y, tz = s.vz - vn * n.z;
    let tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl < 1e-6) { tx = 0; ty = 1; tz = 0; tl = 1; }
    tx /= tl; ty /= tl; tz /= tl;
    // 유효경사: 법선을 진행 반대쪽으로 θc 만큼 기울인다
    const thc = Math.min(25, sp.kc * -vn) * DEG;
    const c = cos(thc), si = sin(thc);
    let nx = n.x * c - tx * si, ny = n.y * c - ty * si, nz = n.z * c - tz * si;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
    const vn2 = s.vx * nx + s.vy * ny + s.vz * nz;
    if (vn2 >= 0) { s.vz = Math.abs(s.vz) * 0.1; return { bounceUp: 0 }; }
    const avn = -vn2;
    const e = clamp(0.510 - 0.0375 * avn + 0.000903 * avn * avn, 0.08, 0.95) * sp.eScale;
    // 접선 속도, 접촉점 미끄럼 u = v_t − R·(ω × n')
    const vtx = s.vx - vn2 * nx, vty = s.vy - vn2 * ny, vtz = s.vz - vn2 * nz;
    const wxn_x = s.wy * nz - s.wz * ny, wxn_y = s.wz * nx - s.wx * nz, wxn_z = s.wx * ny - s.wy * nx;
    const ux = vtx - BALL_R * wxn_x, uy = vty - BALL_R * wxn_y, uz = vtz - BALL_R * wxn_z;
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const J = Math.min((2 / 7) * BALL_M * ul, sp.mu * (1 + e) * BALL_M * avn);
    let jx = 0, jy = 0, jz = 0;
    if (ul > 1e-9) { jx = -(ux / ul) * J; jy = -(uy / ul) * J; jz = -(uz / ul) * J; }
    const vtx2 = vtx + jx / BALL_M, vty2 = vty + jy / BALL_M, vtz2 = vtz + jz / BALL_M;
    // ω' = ω + (R/I)·(J × n')
    const k = BALL_R / BALL_I;
    s.wx += k * (jy * nz - jz * ny); s.wy += k * (jz * nx - jx * nz); s.wz += k * (jx * ny - jy * nx);
    const up = e * avn;
    s.vx = vtx2 + up * nx; s.vy = vty2 + up * ny; s.vz = vtz2 + up * nz;
    return { bounceUp: up };
}

/** 구름 한 스텝. 지면 위 2D + 높이. 멈추면 true */
export function stepRoll(s: MState, aRoll: number, grad: Vec2, heightHere: number): boolean {
    const vx = s.vx, vy = s.vy;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const gs = Math.sqrt(grad.x * grad.x + grad.y * grad.y) * G;
    if (speed < ROLL_STOP_SPEED && gs <= aRoll) { s.vx = 0; s.vy = 0; s.vz = 0; return true; }
    let ax = -G * grad.x, ay = -G * grad.y;
    if (speed > 1e-9) {
        const k = aRoll / speed + ROLL_AIR_K * speed;
        ax -= k * vx; ay -= k * vy;
    }
    let nvx = vx + ax * DT, nvy = vy + ay * DT;
    // 감속이 방향을 뒤집으면(오버슛) 정지
    if (speed > 1e-9 && nvx * vx + nvy * vy < 0 && gs <= aRoll) { nvx = 0; nvy = 0; }
    s.vx = nvx; s.vy = nvy; s.vz = 0;
    s.px += nvx * DT; s.py += nvy * DT;
    s.pz = heightHere + BALL_R;
    // 구르는 스핀(렌더용): ω = (ẑ × v)/R
    s.wx = -nvy / BALL_R; s.wy = nvx / BALL_R; s.wz = 0;
    s.t += DT;
    return false;
}

/** 컵 판정. 컵 반지름 안에 들어왔을 때 부른다. 'holed' | 'lip'(속도 갱신) | null */
export function cupCheck(s: MState, cup: Vec2): "holed" | "lip" | null {
    const dx = s.px - cup.x, dy = s.py - cup.y;
    const dc = Math.sqrt(dx * dx + dy * dy);
    if (dc >= CUP_RH) return null;
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    // 궤적 선과 컵 중심의 거리 d(중심을 정면으로 지나면 0)
    let d = 0;
    if (speed > 1e-9) d = Math.abs((s.vx * -dy - s.vy * -dx) / speed);
    d = Math.min(d, CUP_RH);
    const L = 2 * Math.sqrt(Math.max(0, CUP_RH * CUP_RH - d * d)) - BALL_R;
    const vcap = L > 0 ? L * CUP_CAPTURE_K : 0;
    if (speed <= vcap) { s.px = cup.x; s.py = cup.y; s.vx = 0; s.vy = 0; s.vz = 0; return "holed"; }
    // 립아웃: 림 법선으로 반사 + 감속, 컵 밖으로 밀어낸다
    const nx = dc > 1e-9 ? dx / dc : 1, ny = dc > 1e-9 ? dy / dc : 0;
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx = (s.vx - (1 + LIP_E) * vn * nx) * LIP_DAMP; s.vy = (s.vy - (1 + LIP_E) * vn * ny) * LIP_DAMP; }
    s.px = cup.x + nx * (CUP_RH + 0.002); s.py = cup.y + ny * (CUP_RH + 0.002);
    return "lip";
}
