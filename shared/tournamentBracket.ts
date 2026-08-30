// 크루 토너먼트 대진 생성 규칙 — 서버(대진 생성·진출 처리)와 클라이언트(대진표 그리기)가
// 같은 좌표계를 쓰도록 공유한다.
//
// 왜 필요한가(오너 결정 2026-08-30): 크루에서 대회를 열고 "어떻게 올라가고 결승 가고
// 우승하는지"를 대진표로 보여준다. 대진표는 **아래(첫 라운드)에서 위(우승)로** 올라가는
// 세로 피라미드이고, 크루장이 첫 라운드 자리를 손으로 바꿀 수 있어야 한다.
//
// 좌표계: round 는 1부터 시작하고 **위로 갈수록 커진다**(round 1 = 가장 아래 = 첫 경기,
// round = totalRounds = 결승). 화면이 아래에서 위로 올라가므로 번호도 같은 방향으로 둔다.
// slot 은 라운드 안에서 왼쪽부터 0. (round, slot) 의 승자는 (round+1, slot>>1) 로 올라가고,
// slot 이 짝수면 p1 자리, 홀수면 p2 자리에 앉는다. 이 한 줄이 진출 로직 전부다.
//
// 시드: 참가자를 크루 내 RP 내림차순으로 세워 1번부터 시드를 준 뒤 표준 배치표에 앉힌다.
// 표준 배치가 아니면 1위와 2위가 결승 전에 만나버려 대회가 싱거워진다. 인원이 2의 거듭제곱이
// 아니면 모자란 자리는 부전승이고, 부전승은 상위 시드부터 받는다(1→2→3…).
//
// 3명 이하는 대진표를 안 쓴다. 3명 토너먼트는 1번 시드가 한 경기만 치고 결승에 올라가서
// 나머지 둘보다 덜 치게 된다 — 그 인원이면 서로 한 번씩 붙는 풀리그가 공정하고 경기 수도 많다.

/** 부전승 자리를 포함한 대진판 크기(2의 거듭제곱). 최소 2. */
export function bracketSize(playerCount: number): number {
    let size = 1;
    while (size < playerCount) size *= 2;
    return Math.max(size, 2);
}

/** 대진판 크기에 대한 총 라운드 수. 8명이면 3(8강·4강·결승). */
export function totalRounds(size: number): number {
    return Math.round(Math.log2(size));
}

/**
 * 표준 토너먼트 배치표. size=8 이면 [1,8,4,5,2,7,3,6] 을 돌려주고,
 * 이를 두 개씩 끊어 1라운드 대진(1v8, 4v5, 2v7, 3v6)으로 쓴다.
 * 1번과 2번 시드가 결승에서만 만나도록 좌우 절반으로 갈라 재귀적으로 채운다.
 */
export function seedOrder(size: number): number[] {
    let order = [1, 2];
    while (order.length < size) {
        const pairSum = order.length * 2 + 1;
        const next: number[] = [];
        for (const seed of order) {
            next.push(seed);
            next.push(pairSum - seed);
        }
        order = next;
    }
    return order;
}

/** 최소 인원. 이 아래면 풀리그로 돌린다. */
export const MIN_KNOCKOUT_PLAYERS = 4;

export function shouldUseLeague(playerCount: number): boolean {
    return playerCount < MIN_KNOCKOUT_PLAYERS;
}

/** 생성될 대진 한 칸. memberId 가 null 이면 아직 안 정해진 자리(윗 라운드) 또는 부전승 상대. */
export interface PlannedMatch {
    round: number;
    slot: number;
    p1Id: string | null;
    p2Id: string | null;
    /** 상대가 없어 자동으로 올라가는 경기. p1Id 가 곧 승자다. */
    isBye: boolean;
}

/**
 * 토너먼트 전체 대진을 만든다.
 * @param orderedMemberIds RP 내림차순으로 정렬된 참가자. 배열 순서가 곧 시드(0번째 = 1번 시드).
 * @returns 1라운드부터 결승까지 모든 칸. 윗 라운드는 빈 칸으로 먼저 만들어 두고,
 *          경기가 끝날 때마다 승자를 채워 넣는다(대진표가 처음부터 끝까지 보여야 하므로).
 */
export function planKnockout(orderedMemberIds: string[]): PlannedMatch[] {
    const n = orderedMemberIds.length;
    const size = bracketSize(n);
    const rounds = totalRounds(size);
    const order = seedOrder(size);
    const matches: PlannedMatch[] = [];

    // 1라운드 — 배치표 순서대로 앉힌다. 인원을 넘는 시드는 빈 자리(부전승)다.
    for (let slot = 0; slot < size / 2; slot++) {
        const seedA = order[slot * 2];
        const seedB = order[slot * 2 + 1];
        const a = seedA <= n ? orderedMemberIds[seedA - 1] : null;
        const b = seedB <= n ? orderedMemberIds[seedB - 1] : null;
        // 부전승은 항상 p1 이 실제 선수가 되도록 정렬해 진출 처리를 단순하게 둔다.
        const bye = a === null || b === null;
        matches.push({
            round: 1,
            slot,
            p1Id: bye ? (a ?? b) : a,
            p2Id: bye ? null : b,
            isBye: bye,
        });
    }

    // 윗 라운드 — 빈 칸만 미리 만든다.
    for (let round = 2; round <= rounds; round++) {
        const slots = size / Math.pow(2, round);
        for (let slot = 0; slot < slots; slot++) {
            matches.push({ round, slot, p1Id: null, p2Id: null, isBye: false });
        }
    }
    return matches;
}

/**
 * 풀리그 대진 — 서로 한 번씩. 라운드 개념이 없어 전부 round 1 에 넣고 slot 으로만 구분한다.
 * 시드가 높은 사람끼리의 경기가 뒤로 가도록 두지 않고, 그냥 조합 순서대로 만든다.
 */
export function planLeague(orderedMemberIds: string[]): PlannedMatch[] {
    const matches: PlannedMatch[] = [];
    let slot = 0;
    for (let i = 0; i < orderedMemberIds.length; i++) {
        for (let j = i + 1; j < orderedMemberIds.length; j++) {
            matches.push({
                round: 1,
                slot: slot++,
                p1Id: orderedMemberIds[i],
                p2Id: orderedMemberIds[j],
                isBye: false,
            });
        }
    }
    return matches;
}

/** (round, slot) 의 승자가 올라갈 자리. 결승이면 null(= 우승). */
export function advanceTarget(
    round: number,
    slot: number,
    rounds: number,
): { round: number; slot: number; side: "p1" | "p2" } | null {
    if (round >= rounds) return null;
    return {
        round: round + 1,
        slot: slot >> 1,
        side: slot % 2 === 0 ? "p1" : "p2",
    };
}

/**
 * 라운드 이름 — 언어별 표기가 달라(8강 / Round of 8 / Cuartos) 문자열 대신 구조로 돌려주고
 * 표기는 화면에서 t() 로 만든다. remaining 은 그 라운드를 시작할 때 남은 인원.
 */
export function roundName(round: number, rounds: number): { kind: "final" | "roundOf"; remaining: number } {
    const remaining = Math.pow(2, rounds - round + 1);
    return remaining <= 2 ? { kind: "final", remaining: 2 } : { kind: "roundOf", remaining };
}
