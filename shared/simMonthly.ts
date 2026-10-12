/**
 * 이달의 랭킹(2026-10-12 오너: "랭킹을 달로 해야겠지? 그래서 장식장에 보관이 되도록 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 *
 * 판을 둘로 나눈다(오너 결정):
 *  - **통산 등급** — 지금의 레이팅 · 등급(shared/sim/rank). 리셋하지 않는다. 한 달에 가장 많이 오른 사람이 실버라, 매달 지우면 골드 이상이 나오지 않는다.
 *  - **이달의 랭킹** — 그 달에 올린 점수. **매월 1일(한국 시각) 0 에서 시작**한다. 월말에 마감해 1~3등 메달을 장식장에 남긴다.
 *
 * 이달의 점수 = 그 달에 끝난 대전의 레이팅 변화를 더한 값. 새 점수 체계가 아니다 — 통산 레이팅과 같은 규칙(shared/sim/rating)으로 매긴 변화다:
 * 핸디전만 · 두 사람 다 충분히 친 판만 · 같은 상대와 연달아 치면 줄여서. 그래서 두 계정으로 주고받아 이달 점수를 올리는 길도 같이 막힌다.
 *
 * 판마다의 변화는 **다시 계산해서** 얻는다(replayDeltas — 전체 다시 계산 recomputeRatings 와 같은 순서 · 같은 함수).
 * 2026-10-12 부터는 대전 행에 그 판의 변화가 남는다(rating_result) — 있으면 그 값을 쓴다(실제로 반영된 값이 정본이다).
 * 옛 대전 행에 값을 채워 넣지는 않는다(남의 기록을 고치지 않는다).
 *
 * 이 파일이 shared/sim 밖에 있는 까닭: 그 폴더(물리 엔진 · 규칙)는 Date 를 쓰지 못한다(shared/sim/conformance.test — 결정성).
 * 달을 가르려면 달력이 필요해서 여기 둔다. 레이팅 규칙은 그 폴더의 것을 그대로 가져다 쓴다.
 *
 * 순위에 오르려면 그 달에 MONTHLY_MIN_MATCHES 판을 쳐야 한다 — 한 판 이기고 1등이 되지 않게. 월대회 출전 조건(그 달 5판)과 같은 숫자다.
 */
import { SAME_PAIR_WINDOW_MS, ratingDelta, ratingEligibility } from "./sim/rating.js";

/** 이달의 랭킹에 오르는 최소 판 수 */
export const MONTHLY_MIN_MATCHES = 5;
const KST_MS = 9 * 60 * 60 * 1000;

export type MonthlyGame = "3c" | "4c";

/** 끝난 대전 한 판(레이팅 판인지 판정할 재료) */
export interface FinishedMatchRow {
    id: string;
    hostId: string;
    guestId: string;
    gameType: MonthlyGame;
    handicap: boolean;
    winnerId: string | null;
    endReason: string | null;
    /** 끝난 시각(ms) */
    endedMs: number;
    /** [방장 샷 수, 게스트 샷 수] */
    shots: readonly [number, number];
    /** 그 판에 실제로 반영된 변화(방장 기준). 2026-10-12 전의 판은 없다 */
    storedDelta?: number | null;
}

export interface MatchDelta {
    id: string;
    hostId: string;
    guestId: string;
    gameType: MonthlyGame;
    endedMs: number;
    /** 방장 기준 변화(게스트는 부호 반대) */
    delta: number;
    /** 0 = 방장 승, 1 = 게스트 승, null = 무승부 */
    winner: 0 | 1 | null;
}

/**
 * 끝난 대전들 → 레이팅에 반영된 판과 그 변화. rows 는 **끝난 순서대로**(같으면 id 순) 와야 한다 — 같은 상대 연속 판을 세는 순서다.
 * 저장된 변화(storedDelta)가 있으면 그것을 쓴다.
 */
export function replayDeltas(rows: readonly FinishedMatchRow[]): MatchDelta[] {
    const out: MatchDelta[] = [];
    const recentPairs = new Map<string, number[]>();
    for (const r of rows) {
        const winner = r.winnerId === null ? null : r.winnerId === r.hostId ? 0 : 1;
        const ok = ratingEligibility({ handicap: r.handicap, hasGuest: true, shots: r.shots, endReason: r.endReason, winner });
        if (!ok.rated) continue;
        const pairKey = `${[r.hostId, r.guestId].sort().join("|")}|${r.gameType}`;
        const times = (recentPairs.get(pairKey) ?? []).filter((t) => r.endedMs - t < SAME_PAIR_WINDOW_MS);
        const replayed = ratingDelta(winner, times.length);
        times.push(r.endedMs);
        recentPairs.set(pairKey, times);
        const delta = typeof r.storedDelta === "number" && Number.isFinite(r.storedDelta) ? r.storedDelta : replayed;
        out.push({ id: r.id, hostId: r.hostId, guestId: r.guestId, gameType: r.gameType, endedMs: r.endedMs, delta, winner });
    }
    return out;
}

/** 한국 시각의 달 — "2026-10" */
export function kstMonthOf(ms: number): string {
    const d = new Date(ms + KST_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const isMonthId = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** 그 달의 [시작, 끝) — 한국 시각 1일 0시부터 다음 달 1일 0시 전까지(ms) */
export function kstMonthRange(month: string): [number, number] {
    const [y, m] = month.split("-").map(Number);
    return [Date.UTC(y, m - 1, 1) - KST_MS, Date.UTC(y, m, 1) - KST_MS];
}

/** 앞 달 · 다음 달 */
export function shiftMonth(month: string, by: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 마감까지 남은 날(오늘 포함, 한국 시각). 지난 달이면 0 */
export function daysLeftInMonth(month: string, nowMs: number): number {
    const [, end] = kstMonthRange(month);
    if (nowMs >= end) return 0;
    return Math.ceil((end - nowMs) / 86_400_000);
}

export interface MonthlyRow {
    memberId: string;
    /** 이달에 올린 점수(잃으면 음수) */
    points: number;
    matches: number;
    wins: number;
    /** MONTHLY_MIN_MATCHES 판을 채운 사람만 순위가 있다 */
    rank: number | null;
}

/**
 * 한 종목 · 한 달의 판. 순위: 점수 높은 순 → 승수 많은 순 → 판 수 적은 순(같으면 같은 등수).
 * 무승부는 양쪽 다 승으로 센다(통산 사다리와 같다 — 오너 규칙).
 */
export function monthlyBoard(deltas: readonly MatchDelta[], month: string, gameType: MonthlyGame, minMatches: number = MONTHLY_MIN_MATCHES): MonthlyRow[] {
    const [from, to] = kstMonthRange(month);
    const table = new Map<string, { points: number; matches: number; wins: number }>();
    const add = (id: string, points: number, won: boolean) => {
        const cur = table.get(id) ?? { points: 0, matches: 0, wins: 0 };
        cur.points += points; cur.matches += 1; cur.wins += won ? 1 : 0;
        table.set(id, cur);
    };
    for (const d of deltas) {
        if (d.gameType !== gameType || d.endedMs < from || d.endedMs >= to) continue;
        add(d.hostId, d.delta, d.winner === null || d.winner === 0);
        add(d.guestId, -d.delta, d.winner === null || d.winner === 1);
    }
    const rows: MonthlyRow[] = [...table.entries()].map(([memberId, v]) => ({ memberId, ...v, rank: null }));
    const by = (a: MonthlyRow, b: MonthlyRow) => (b.points - a.points) || (b.wins - a.wins) || (a.matches - b.matches) || (a.memberId < b.memberId ? -1 : 1);
    const ranked = rows.filter((r) => r.matches >= minMatches).sort(by);
    let rank = 0;
    ranked.forEach((r, i) => {
        const prev = ranked[i - 1];
        if (!prev || prev.points !== r.points || prev.wins !== r.wins || prev.matches !== r.matches) rank = i + 1;
        r.rank = rank;
    });
    const unranked = rows.filter((r) => r.matches < minMatches).sort(by);
    return [...ranked, ...unranked];
}

/** 대전이 있었던 달들(최근 달부터) — 지난 달 보기의 목록 */
export function monthsWithMatches(deltas: readonly MatchDelta[], gameType: MonthlyGame): string[] {
    const set = new Set<string>();
    for (const d of deltas) if (d.gameType === gameType) set.add(kstMonthOf(d.endedMs));
    return [...set].sort().reverse();
}
