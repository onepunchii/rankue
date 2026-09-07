/**
 * detect/index.ts — 다음 이벤트 하나를 고른다.
 *
 * 출처: pooltool <pooltool/evolution/event_based/detect/ball_ball.py>, <.../ball_cushion.py>,
 *       <pooltool/evolution/event_based/simulate.py> (get_next_event, Apache-2.0, NOTICE.md).
 *       pooltool 은 쌍별 캐시로 재계산을 아끼지만, 캐롬은 공 3–4개 × 쿠션 4개라 이벤트당 후보가
 *       25개 안팎이다. 캐시 없이 전부 다시 계산하는 편이 단순하고 결정론 검증도 쉽다.
 *
 * 후보
 *  - 각 공의 상태 전이 (evolve.nextTransition)
 *  - 모든 공 쌍의 충돌 (ballBallTime)
 *  - 모든 공 × 세그먼트의 쿠션 충돌 (ballCushionTime)
 * dt ≤ 0 이거나 유한하지 않은 후보는 버린다.
 *
 * 동률 (README 절대 규칙 5)
 *  최소 dt 후보와 1e-9 s 이내인 후보들을 모아 (type 순위: transition < ball-cushion < ball-ball) →
 *  ids 사전순 → cushion id 사전순으로 정렬해 첫 번째를 고른다. 이 순서가 리플레이를 두 기기에서
 *  같은 이벤트 열로 재현하게 만든다. 문자열 비교는 UTF-16 코드 단위 `<` 로 — 로케일에 의존하지 않는다.
 *
 * 반환 후보의 event.t 는 절대 시각이 아니라 dt 와 같은 지연값이다(nextTransition 과 같은 규약).
 * 호출자(simulate)가 현재 시각을 더한다.
 */
import type { BallState, CushionSegment, EventCandidate, SimEvent } from "../types.js";
import type { BallParams } from "../params.js";
import { nextTransition } from "../evolve.js";
import { ballBallTime } from "./ballBall.js";
import { ballCushionTime } from "./ballCushion.js";

export { ballBallTime, EVENT_EPS, polynomialHorizon } from "./ballBall.js";
export { ballCushionTime } from "./ballCushion.js";

/** 동률로 보는 dt 차이 (s). README 절대 규칙 5. */
export const TIE_EPS = 1e-9;

const TYPE_RANK: Record<SimEvent["type"], number> = {
    "transition": 0,
    "ball-cushion": 1,
    "ball-ball": 2,
};

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** ids 배열 사전순: 원소별 비교, 접두사가 같으면 짧은 쪽이 먼저. */
function compareIds(a: readonly string[], b: readonly string[]): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const c = compareStrings(a[i], b[i]);
        if (c !== 0) return c;
    }
    return a.length - b.length;
}

/**
 * 동률 후보 사이의 순서. 음수면 a 가 먼저. dt 는 보지 않는다(호출자가 이미 동률로 묶었다).
 *  type 순위 → ids 사전순 → cushion id 사전순.
 */
export function compareTied(a: EventCandidate, b: EventCandidate): number {
    const ra = TYPE_RANK[a.event.type], rb = TYPE_RANK[b.event.type];
    if (ra !== rb) return ra - rb;
    const ci = compareIds(a.event.ids, b.event.ids);
    if (ci !== 0) return ci;
    const ca = a.event.type === "ball-cushion" ? a.event.cushion : "";
    const cb = b.event.type === "ball-cushion" ? b.event.cushion : "";
    return compareStrings(ca, cb);
}

/**
 * 후보 목록에서 다음 이벤트를 고른다. dt ≤ 0 · 비유한 후보 제외, 최소 dt 로부터 TIE_EPS 안의 후보들을
 * compareTied 로 정렬해 첫 번째. 없으면 null. 입력 배열은 건드리지 않는다.
 */
export function pickEvent(candidates: readonly EventCandidate[]): EventCandidate | null {
    let minDt = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const dt = candidates[i].dt;
        if (!(dt > 0) || !Number.isFinite(dt)) continue;
        if (dt < minDt) minDt = dt;
    }
    if (!Number.isFinite(minDt)) return null;

    const limit = minDt + TIE_EPS;
    let best: EventCandidate | null = null;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const dt = c.dt;
        if (!(dt > 0) || !Number.isFinite(dt) || dt > limit) continue;
        if (best === null || compareTied(c, best) < 0) best = c;
    }
    return best;
}

/**
 * 모든 후보(전이·볼–볼·볼–쿠션) 중 가장 이른 이벤트. 전부 정지면 null.
 * balls 의 순서는 결과에 영향을 주지 않는다(동률 규칙이 id 로 결정하므로).
 */
export function nextEvent(
    balls: readonly BallState[],
    segs: readonly CushionSegment[],
    p: BallParams,
): EventCandidate | null {
    const candidates: EventCandidate[] = [];

    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const tr = nextTransition(b, p);
        if (tr !== null) candidates.push(tr);

        for (let k = 0; k < segs.length; k++) {
            const dt = ballCushionTime(b, segs[k], p);
            if (!Number.isFinite(dt)) continue;
            candidates.push({ dt, event: { type: "ball-cushion", t: dt, ids: [b.id], cushion: segs[k].id } });
        }

        for (let j = i + 1; j < balls.length; j++) {
            const o = balls[j];
            const dt = ballBallTime(b, o, p);
            if (!Number.isFinite(dt)) continue;
            const ids: readonly [string, string] = b.id < o.id ? [b.id, o.id] : [o.id, b.id];
            candidates.push({ dt, event: { type: "ball-ball", t: dt, ids } });
        }
    }

    return pickEvent(candidates);
}
