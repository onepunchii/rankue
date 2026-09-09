/**
 * 드릴에서 "실제로 어떤 길로 갔는가" 를 샷 기록(이벤트)만으로 읽어 낸다.
 *
 * 왜 필요한가 — 드릴 채점은 3쿠션 득점 여부만 본다(simDrill.ts). 배치가 고정이라 이름은 "옆돌리기"인데
 * 빈쿠션으로 때워도 똑같이 성공이다(2026-09-09 실측: 배치마다 득점 해법이 90~200개, 그 대부분이 빈쿠션).
 * 그래서 통과 조건은 그대로 두고, 지나온 길을 사실 그대로 보여 준다. 이름표대로 갔으면 표시를 하나 더 준다.
 *
 * 판별은 이벤트에서 확실히 읽히는 것만 쓴다 — 빈쿠션 여부, 쿠션 차례, 첫 적구 뒤 첫 쿠션이 어느 벽인가.
 * 회전(리버스)이나 각도(긴각)처럼 이벤트로 못 가르는 패턴은 null 을 돌려주고 표시하지 않는다. 지어내지 않는다.
 *
 * 좌표계(types.ts): left x=0 · right x=width 는 긴 쿠션, bottom y=0 · top y=length 는 짧은 쿠션.
 * shared/sim 규칙을 따른다 — 초월함수·Date·Math.random 금지.
 */
import type { CushionId, SimEvent } from "./types.js";
import type { DrillPattern } from "./drills.js";

export interface DrillRoute {
    /** 첫 적구를 맞기 전에 밟은 쿠션 수. 1 이상이면 빈쿠션으로 시작한 길. */
    readonly bankFirst: number;
    /** 둘째 적구를 맞기 전까지 큐볼이 밟은 쿠션 차례(판정 구간과 같다). */
    readonly rails: readonly CushionId[];
    /** 첫 적구를 맞은 뒤 처음 밟은 쿠션. 적구를 한 번도 못 맞혔으면 null. */
    readonly firstRailAfterBall: CushionId | null;
    /** 큐볼이 맞힌 적구 수(0·1·2). */
    readonly contacts: number;
}

export const isLongRail = (c: CushionId): boolean => c === "left" || c === "right";

/**
 * 샷 기록에서 길을 읽는다. objectBalls 는 그 종목의 적구(3쿠션이면 나머지 두 공).
 * 둘째 적구에 닿는 순간 끊는다 — 그 뒤 쿠션은 판정에도 안 들어간다.
 */
export function readRoute(events: readonly SimEvent[], cueBallId: string, objectBalls: readonly string[]): DrillRoute {
    const rails: CushionId[] = [];
    const seen: string[] = [];
    let bankFirst = 0;
    let firstRailAfterBall: CushionId | null = null;
    for (const e of events) {
        if (e.type === "ball-ball") {
            if (!e.ids.includes(cueBallId)) continue;
            const other = e.ids[0] === cueBallId ? e.ids[1] : e.ids[0];
            if (!objectBalls.includes(other) || seen.includes(other)) continue;
            seen.push(other);
            if (seen.length >= 2) break;
        } else if (e.type === "ball-cushion" && e.ids[0] === cueBallId) {
            rails.push(e.cushion);
            if (seen.length === 0) bankFirst += 1;
            else if (firstRailAfterBall === null) firstRailAfterBall = e.cushion;
        }
    }
    return { bankFirst, rails, firstRailAfterBall, contacts: seen.length };
}

/**
 * 이름표대로 갔는가. 판별 규칙이 없는 패턴은 null.
 * cueY·tableLength 로 "큐볼이 출발한 쪽 짧은 쿠션"(뒤)과 "건너편 짧은 쿠션"(앞)을 가른다.
 */
export function matchesPattern(route: DrillRoute, pattern: DrillPattern, cueY: number, tableLength: number): boolean | null {
    const near: CushionId = cueY * 2 < tableLength ? "bottom" : "top";
    const far: CushionId = near === "bottom" ? "top" : "bottom";
    const ballFirst = route.bankFirst === 0 && route.contacts >= 1;
    const after = route.firstRailAfterBall;
    switch (pattern) {
        case "bank":
            return route.bankFirst >= 1;
        case "grand-tour":
            return ballFirst && route.rails.length >= 5;
        case "double-rail":
            return ballFirst && route.rails.some((c, i) => i > 0 && route.rails[i - 1] === c);
        case "side-around":
            return ballFirst && after !== null && isLongRail(after);
        case "back-around":
            return ballFirst && after === near;
        case "short-back":
            return ballFirst && after === near && route.rails.length <= 3;
        case "front-around":
            return ballFirst && after === far;
        case "cross":
            // 횡단 = 긴 쿠션 사이를 가로지른다. 적구 뒤 첫 두 쿠션이 마주 보는 긴 쿠션이어야 한다.
            {
                const idx = route.rails.findIndex((c) => c === after);
                const next = idx >= 0 ? route.rails[idx + 1] : undefined;
                return ballFirst && after !== null && isLongRail(after) && next !== undefined && isLongRail(next) && next !== after;
            }
        default:
            // reverse(역회전)·long-angle(각도)은 이벤트만으로 못 가른다 — 표시하지 않는다.
            return null;
    }
}
