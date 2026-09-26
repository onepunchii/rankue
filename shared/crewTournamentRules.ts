// 크루 대회 규칙 중 서버와 화면이 같이 써야 하는 판정들(2026-09-26 크루 정비).
//  - 자리 바꾸기 허용 여부: 서버가 거절하는 칸을 화면이 누를 수 있게 두면 "눌렀는데 오류"가 된다.
//  - 목록 정렬, 내 다음 경기 찾기, 접수 마감·시작 일시 확인.

export interface SeatMatchLike {
    id: string;
    round: number;
    status: string;
}

/**
 * 첫 라운드 두 자리 맞바꾸기를 막아야 하는 이유(없으면 null). 반환값은 서버 오류 키다.
 *
 * 부전승(bye) 칸을 막는 이유: 대진을 짤 때 부전승자는 곧바로 윗칸에 올라가 앉는다(pushWinnerUp).
 * 예전엔 부전승 칸과 자리를 바꾸면 이 칸의 승자만 다시 계산하고 윗칸은 그대로 둬서, 이미 올라간 사람과
 * 새 부전승자가 동시에 대진에 남았다(한 사람이 두 자리에 앉는 대진). 되돌리는 계산을 넣는 것보다
 * 막고 "다시 뽑기"를 쓰게 하는 편이 안전하다.
 */
export function swapBlockReason(
    ma: SeatMatchLike, mb: SeatMatchLike,
    a: { matchId: string; side: "p1" | "p2" }, b: { matchId: string; side: "p1" | "p2" },
): string | null {
    if (ma.round !== 1 || mb.round !== 1) return "err.tournament.firstRoundOnly";
    if (a.matchId === b.matchId && a.side === b.side) return "err.tournament.sameSeat";
    for (const m of [ma, mb]) {
        if (m.status === "playing" || m.status === "done") return "err.tournament.seatStarted";
        if (m.status === "bye") return "err.crewTourney.byeSeat";
        if (m.status !== "ready") return "err.tournament.seatStarted";
    }
    return null;
}

/** 화면에서 자리 바꾸기 대상으로 보여 줄 칸 — 서버 swapBlockReason 과 같은 기준. */
export function isSeatSwappable(m: SeatMatchLike): boolean {
    return m.round === 1 && m.status === "ready";
}

/**
 * 목록 순서: 진행중 → 접수중 → 대진 확정 → 종료 → 취소.
 * 접수중이 대진 확정보다 위인 이유: 접수중은 "지금 신청해야 하는" 대회라 크루원이 할 일이 있다.
 * 대진 확정은 크루장이 경기를 붙일 차례라 대부분의 크루원에게는 기다리는 대회다.
 */
export function tournamentStatusRank(status: string): number {
    switch (status) {
        case "ongoing": return 0;
        case "recruiting": return 1;
        case "drawn": return 2;
        case "ended": return 3;
        default: return 4;
    }
}

export interface MyMatchLike {
    id: string;
    round: number;
    slot: number;
    p1Id: string | null;
    p2Id: string | null;
    status: string;
}

/**
 * 내 다음 경기 — 지금 칠 수 있는(ready)·치는 중(playing)인 칸이 먼저, 없으면 상대를 기다리는(pending) 칸.
 * 이미 떨어졌거나 대회가 끝났으면 null.
 */
export function findMyNextMatch<M extends MyMatchLike>(matches: M[], meId: string | null | undefined): { match: M; waiting: boolean } | null {
    if (!meId) return null;
    const mine = matches.filter((m) => m.p1Id === meId || m.p2Id === meId);
    const byRound = (a: M, b: M) => a.round - b.round || a.slot - b.slot;
    const live = mine.filter((m) => m.status === "playing" || (m.status === "ready" && !!m.p1Id && !!m.p2Id)).sort(byRound)[0];
    if (live) return { match: live, waiting: false };
    const pending = mine.filter((m) => m.status === "pending").sort(byRound)[0];
    return pending ? { match: pending, waiting: true } : null;
}

export type TournamentDateError = "invalid" | "recruitEndPast" | "startBeforeRecruitEnd";

/**
 * 접수 마감·시작 일시 확인. 둘 다 선택이다.
 * @param requireFuture 새로 정하는 접수 마감이 이미 지난 시각이면 거절(수정에서 그대로 둔 값은 넘긴다).
 */
export function checkTournamentDates(
    input: { recruitEnd: Date | null; startAt: Date | null },
    now: number,
    requireFuture: boolean,
): TournamentDateError | null {
    const { recruitEnd, startAt } = input;
    if ((recruitEnd && Number.isNaN(recruitEnd.getTime())) || (startAt && Number.isNaN(startAt.getTime()))) return "invalid";
    if (requireFuture && recruitEnd && recruitEnd.getTime() < now - 60_000) return "recruitEndPast";
    if (recruitEnd && startAt && startAt.getTime() < recruitEnd.getTime()) return "startBeforeRecruitEnd";
    return null;
}
