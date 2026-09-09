/**
 * 한 샷의 이벤트 로그를 규칙에 따라 판정한다.
 *
 * 공 id 규약: 큐볼은 "white" 또는 "yellow". 3쿠션은 나머지 두 공("yellow"/"white" 와 "red")이 모두 적구.
 * 4구는 "red1","red2" 가 적구, 상대 큐볼(내가 white 면 yellow)은 파울 대상.
 *
 * 쿠션 수 = 큐볼의 ball-cushion 이벤트 중 '두 번째 적구 첫 접촉' 이전 것의 개수(UMB Art.24).
 * 코너에서 두 면에 닿으면 이벤트가 2개이므로 자연히 2로 센다. 같은 면 두 번도 2.
 * 적구가 밟은 쿠션은 세지 않는다(이벤트 ids 로 구분).
 * 개시 샷(opts.opening, 3쿠션): 첫 접촉이 빨간 공이 아니면 foul-opening(UMB 개시 규칙). 접촉이 없으면 보통의 미스.
 */
import type { SimEvent } from "../types.js";
import type { EvaluateOptions, Rules, ShotOutcome, ShotOutcomeCode } from "./types.js";

export const CUE_BALL_IDS = ["white", "yellow"] as const;

export function opponentCueBall(cueBallId: string): string {
    return cueBallId === "white" ? "yellow" : "white";
}

/** 이 큐볼이 맞혀야 하는 적구 id 들. */
export function objectBallIds(gameType: Rules["gameType"], cueBallId: string): readonly [string, string] {
    if (gameType === "4c") return ["red1", "red2"];
    return [opponentCueBall(cueBallId), "red"];
}

function outcome(
    code: ShotOutcomeCode, points: number, scored: boolean, consumesInning: boolean,
    walk: ReturnType<typeof walkEvents>,
): ShotOutcome {
    return {
        code, points, scored, consumesInning,
        cushionsBeforeSecond: walk.cushionsBeforeSecond,
        cushionsBeforeFirst: walk.cushionsBeforeFirst,
        contacts: walk.contacts,
        kisses: walk.kisses,
    };
}

/** 이벤트를 시간순으로 걸어가며 접촉 순서·쿠션 수·상대공 접촉을 집계한다. */
export function walkEvents(events: readonly SimEvent[], cueBallId: string, objectIds: readonly string[], opponentId: string | null) {
    const contacts: string[] = [];
    let cushionsBeforeFirst = 0;
    let cushionsBeforeSecond = 0;
    let directOpponentContact = false;
    let passiveOpponentContact = false;
    let kisses = 0;
    let anyContact = false;

    for (const e of events) {
        if (e.type === "ball-cushion") {
            if (e.ids[0] !== cueBallId) continue;
            if (contacts.length === 0) cushionsBeforeFirst++;
            if (contacts.length < 2) cushionsBeforeSecond++;
            continue;
        }
        if (e.type !== "ball-ball") continue;

        const [p, q] = e.ids;
        const involvesCue = p === cueBallId || q === cueBallId;
        if (!involvesCue) {
            // 적구끼리(쫑) 또는 적구–상대큐볼. 첫 접촉 이후면 키스로 집계.
            if (contacts.length > 0) kisses++;
            if (opponentId && (p === opponentId || q === opponentId)) passiveOpponentContact = true;
            continue;
        }
        const other = p === cueBallId ? q : p;
        anyContact = true;
        if (opponentId && other === opponentId) {
            directOpponentContact = true;
            continue;
        }
        if (!objectIds.includes(other)) continue;
        if (contacts.length > 0) {
            // 이미 맞힌 공을 다시 맞히거나(키스) 두 번째 적구를 맞힘
            if (contacts.includes(other)) { kisses++; continue; }
            if (contacts.length >= 2) { kisses++; continue; }
        }
        contacts.push(other);
    }
    return { contacts, cushionsBeforeFirst, cushionsBeforeSecond, directOpponentContact, passiveOpponentContact, kisses, anyContact };
}

export function evaluateShot(
    events: readonly SimEvent[],
    cueBallId: string,
    rules: Rules,
    truncated = false,
    opts?: EvaluateOptions,
): ShotOutcome {
    const objectIds = objectBallIds(rules.gameType, cueBallId);
    const opponentId = rules.gameType === "4c" ? opponentCueBall(cueBallId) : null;
    const walk = walkEvents(events, cueBallId, objectIds, opponentId);

    if (truncated) return outcome("foul-truncated", 0, false, true, walk);

    // 큐볼이 움직이지 않았다(0 파워): 샷이 아니다.
    const cueMoved = events.some((e) => e.ids.includes(cueBallId));
    if (!cueMoved) return outcome("no-shot", 0, false, false, walk);

    if (rules.gameType === "4c") {
        const unit = rules.pointUnit;
        const scored = walk.contacts.length === 2;
        // 내 공이 상대공을 맞히면 언제나 파울(감점). 하지만 **적구가 굴러가 상대공을 건드린 것(간접)** 은
        // 득점한 샷까지 파울로 뒤집지 않는다 — 실제로 두 적구를 다 맞힌 샷이 -10 이 되어 20점이 뒤집혔다(2026-09-09 오너 신고).
        // 간접 접촉 파울은 옵션이고, 득점하지 못한 샷에만 적용한다.
        const foul = walk.directOpponentContact || (!scored && rules.passiveOpponentContactIsFoul && walk.passiveOpponentContact);
        if (foul) return outcome("foul-opponent", -unit * rules.foulPenaltyUnits, false, true, walk);
        if (scored) {
            if (rules.threeCushionDouble && walk.cushionsBeforeSecond >= 3) {
                return outcome("point-3c", unit * 2, true, false, walk);
            }
            return outcome("point", unit, true, false, walk);
        }
        if (walk.contacts.length === 1) return outcome("miss-one-ball", 0, false, true, walk);
        return outcome("miss-no-contact", 0, false, true, walk);
    }

    // 3쿠션
    if (opts?.opening && walk.contacts.length > 0 && walk.contacts[0] !== "red") {
        return outcome("foul-opening", 0, false, true, walk);
    }
    if (walk.contacts.length < 2) {
        return outcome(walk.contacts.length === 1 ? "miss-one-ball" : "miss-no-contact", 0, false, true, walk);
    }
    if (walk.cushionsBeforeSecond < 3) return outcome("miss-cushions", 0, false, true, walk);
    if (rules.ruleSet === "pba" && walk.cushionsBeforeFirst >= 3) {
        return outcome("point-bank", rules.bankShotPoint, true, false, walk);
    }
    return outcome("point", 1, true, false, walk);
}

export const DEFAULT_3C_RULES: Rules = { gameType: "3c", ruleSet: "umb", bankShotPoint: 2 };
export const DEFAULT_4C_RULES: Rules = {
    gameType: "4c", pointUnit: 10, threeCushionDouble: false, passiveOpponentContactIsFoul: false, foulPenaltyUnits: 1,
};
