/**
 * 코스 높이의 '0 m 튐' 고치기(2026-10-19) — 받은 코스(한국등산트레킹지원센터)의 8% 남짓(8,959개 중 750개)이 높이를 못 잰 점을 0 m 로 적었다.
 * 그 점이 들어가면 '해발 0~391m'가 되고, 내려갔다 오르는 셈이 오르막에 더해져 5.8km 코스가 오르막 2,095m · 힘든 길이 됐다.
 * 고치는 법: 높이 0 인 점의 앞뒤(0 이 아닌 가장 가까운 점)가 둘 다 20 m 를 넘으면 잴 수 없었던 점으로 보고 앞뒤를 이어 채운다
 * (바닷가에서 진짜로 0 m 에서 떠나는 길은 다음 점이 20 m 를 넘지 않아 그대로 남는다). 고친 점이 있으면 오르막 · 내리막 · 가장 낮은/높은 곳을
 * 고친 선에서 다시 센다 — 깨끗한 코스에서 160점 선으로 센 오르막은 받은 값과 ±10% 안(가운데 1.03)이라 어림으로 충분하다.
 * 데이터는 그대로 두고 읽을 때 고친다. ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import type { LinePoint } from "./hikingGeo.js";

const NEAR_M = 20;

export interface CourseElevation { line: LinePoint[]; gainM: number; lossM: number; minM: number; maxM: number }

export function repairCourseElevation<T extends CourseElevation>(c: T): T {
    const line = c.line;
    if (line.length < 2 || !line.some((p) => p[2] === 0)) return c;
    const ele = line.map((p) => p[2]);
    const prevOk = (i: number) => { for (let k = i - 1; k >= 0; k--) if (ele[k] !== 0) return k; return -1; };
    const nextOk = (i: number) => { for (let k = i + 1; k < ele.length; k++) if (ele[k] !== 0) return k; return -1; };
    let fixed = false;
    const out = line.map((p, i): LinePoint => {
        if (p[2] !== 0) return p;
        const a = prevOk(i), b = nextOk(i);
        const ea = a >= 0 ? ele[a] : null, eb = b >= 0 ? ele[b] : null;
        // 양끝은 한쪽만 본다 — 그쪽이 20 m 를 넘으면 그 값으로
        if (ea == null && eb != null && eb > NEAR_M) { fixed = true; return [p[0], p[1], eb, p[3]]; }
        if (eb == null && ea != null && ea > NEAR_M) { fixed = true; return [p[0], p[1], ea, p[3]]; }
        if (ea == null || eb == null || ea <= NEAR_M || eb <= NEAR_M) return p;
        const ka = line[a][3], kb = line[b][3];
        const t = kb > ka ? (p[3] - ka) / (kb - ka) : 0.5;
        fixed = true;
        return [p[0], p[1], Math.round(ea + (eb - ea) * Math.min(1, Math.max(0, t))), p[3]];
    });
    if (!fixed) return c;
    let gain = 0, loss = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < out.length; i++) {
        const e = out[i][2];
        if (e < lo) lo = e;
        if (e > hi) hi = e;
        if (i) { const d = e - out[i - 1][2]; if (d > 0) gain += d; else loss -= d; }
    }
    return { ...c, line: out, gainM: Math.round(gain), lossM: Math.round(loss), minM: Math.round(lo), maxM: Math.max(Math.round(hi), c.maxM) };
}
