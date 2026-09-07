/**
 * continuize.ts — 이벤트 스냅샷 사이를 닫힌 식으로 메워 임의 시각·고정 간격의 상태를 만든다 (렌더링용).
 *
 * 출처: pooltool <pooltool/evolution/continuous.py> (continuize) 의 발상. 물리 루프에는 시간 스텝이 없고,
 * 여기서만 dt 가 등장한다(types.ts 머리 주석).
 *
 * stateAt(result, t): t 이하의 마지막 스냅샷(같은 시각이 여럿이면 가장 뒤의 것 — dt = 0 이벤트 뒤의 상태)에서
 * 각 공을 evolveBall(t − t_i) 로 전진시킨다. 다음 스냅샷의 시각이 t 보다 크므로 절대 이벤트를 넘어 외삽하지 않는다.
 * 시작 전(t < history[0].t)은 시작 상태, 끝 이후는 마지막 스냅샷(정지 상태라 그대로)이다.
 * frames(result, dt): history[0].t 부터 마지막 스냅샷 시각까지 dt 간격으로 표본화하고, 끝 시각을 반드시 포함한다.
 *
 * 초월함수 없음. 입력 불변.
 */
import type { BallState, SimResult, Snapshot } from "./types.js";
import type { BallParams } from "./params.js";
import { evolveBall } from "./evolve.js";

/** history 에서 t_i ≤ t 인 마지막 인덱스. t 가 첫 스냅샷보다 앞이면 0. */
function snapshotIndexAt(history: readonly Snapshot[], t: number): number {
    let lo = 0, hi = history.length - 1;
    if (!(history[0].t <= t)) return 0;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (history[mid].t <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function evolveSnapshot(snap: Snapshot, t: number, p: BallParams): readonly BallState[] {
    const dt = t - snap.t;
    const out: BallState[] = new Array(snap.balls.length);
    for (let i = 0; i < snap.balls.length; i++) {
        out[i] = evolveBall(snap.balls[i], dt > 0 ? dt : 0, p);
    }
    return out;
}

/** 시각 t 의 모든 공 상태. 직전 스냅샷에서 evolveBall. history 가 비면 []. */
export function stateAt(result: Pick<SimResult, "history">, t: number, p: BallParams): readonly BallState[] {
    const h = result.history;
    if (h.length === 0) return [];
    return evolveSnapshot(h[snapshotIndexAt(h, t)], t, p);
}

/** frames 가 만들 수 있는 프레임 수 상한. 60 fps 로 46 시간 — 정상 샷(≤ 30 s)의 어떤 dt 도 여기 걸리지 않는다. */
export const MAX_FRAMES = 1e7;

/**
 * history[0].t 부터 마지막 스냅샷 시각까지 dt 간격의 프레임. 마지막 프레임은 항상 끝 시각이다.
 * dt 가 양의 유한수가 아니거나 프레임 수가 MAX_FRAMES 를 넘으면 RangeError.
 * t0 + k·dt 가 t0 에서 움직이지 않을 만큼 dt 가 작으면(dt ≤ ulp(t0)/2) 영원히 돌 수 있으므로,
 * 시각이 엄격히 증가하지 않는 순간 루프를 끊는다(41-determinism-review 2.5).
 */
export function frames(result: Pick<SimResult, "history">, dt: number, p: BallParams): readonly Snapshot[] {
    if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError("frames: dt must be a positive finite number");
    const h = result.history;
    if (h.length === 0) return [];
    const t0 = h[0].t;
    const tEnd = h[h.length - 1].t;
    if ((tEnd - t0) / dt > MAX_FRAMES) throw new RangeError(`frames: (tEnd - t0)/dt exceeds ${MAX_FRAMES}`);
    const out: Snapshot[] = [];
    let idx = 0;
    let prevT = -Infinity;
    for (let k = 0; k <= MAX_FRAMES; k++) {
        const t = t0 + k * dt;
        if (t > tEnd) break;
        if (!(t > prevT)) break;                   // 부동소수점 흡수로 시각이 멈추면 끝 프레임만 남기고 종료
        prevT = t;
        while (idx + 1 < h.length && h[idx + 1].t <= t) idx++;
        out.push({ t, balls: evolveSnapshot(h[idx], t, p) });
    }
    if (out.length === 0 || out[out.length - 1].t < tEnd) {
        out.push({ t: tEnd, balls: evolveSnapshot(h[h.length - 1], tEnd, p) });
    }
    return out;
}
