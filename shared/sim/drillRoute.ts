/**
 * 드릴에서 "실제로 어떤 길로 갔는가" 를 샷 기록(이벤트)만으로 읽어 낸다.
 *
 * 왜 필요한가 — 드릴 채점은 3쿠션 득점 여부만 본다(simDrill.ts). 배치가 고정이라 이름은 "옆돌리기"인데
 * 빈쿠션으로 때워도 똑같이 성공이다(2026-09-09 실측: 배치마다 득점 해법이 90~200개, 그 대부분이 빈쿠션).
 * 그래서 통과 조건은 그대로 두고, 지나온 길을 사실 그대로 보여 준다. 이름표대로 갔으면 표시를 하나 더 준다.
 *
 * 이름표 판별은 **그 드릴의 힌트가 길을 못박은 것만** 인정한다(2026-09-09 검토에서 크게 좁혔다).
 * 처음엔 큐볼 위치로 앞/뒤/옆을 갈랐는데, 앞돌리기 규칙이 앱이 띄우는 힌트("긴 쿠션을 먼저 맞히기")와
 * 정반대였다 — 힌트대로 친 사람만 배지를 못 받았다. 실측으로 적구 먼저 득점의 76%가 그쪽이었다.
 * 앞·뒤·옆·횡단은 부르는 사람마다 정의가 갈려 이벤트로 단정할 수 없다. 그래서 지어내지 않고 null 을 돌린다.
 * 지금 인정하는 넷: 빈쿠션(쿠션 먼저) · 대회전(크게 한 바퀴) · 더블레일(같은 긴 쿠션 두 번) · 앞돌리기(긴 쿠션 먼저).
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

/** 이름표대로 갔는가. 힌트가 길을 못박지 않은 패턴은 null — 표시하지 않는다. */
export function matchesPattern(route: DrillRoute, pattern: DrillPattern): boolean | null {
    const ballFirst = route.bankFirst === 0 && route.contacts >= 1;
    const twice = (c: CushionId): boolean => route.rails.filter((x) => x === c).length >= 2;
    switch (pattern) {
        case "bank":
            // 힌트: "쿠션을 먼저 맞히고 1적구로"
            return route.bankFirst >= 1;
        case "grand-tour":
            // 힌트: "세게, 순회전으로 크게 한 바퀴"
            return ballFirst && route.rails.length >= 5;
        case "double-rail":
            // 힌트: "같은 긴 쿠션을 두 번". 사이에 다른 쿠션이 끼어도 된다(left·right·left 가 전형).
            // 짧은 쿠션을 연달아 튄 건 더블레일이 아니다 — 예전엔 '같은 쿠션 연속' 만 봐서 그걸 인정했다.
            return ballFirst && (twice("left") || twice("right"));
        case "front-around":
            // 힌트: "앞으로 돌려 긴 쿠션을 먼저 맞히기"
            return ballFirst && route.firstRailAfterBall !== null && isLongRail(route.firstRailAfterBall);
        default:
            // 뒤돌리기·옆돌리기·짧은 뒤돌리기·횡단샷·리버스·긴각 — 정의가 사람마다 갈려 샷 기록만으로 단정 못 한다.
            return null;
    }
}
