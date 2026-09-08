/**
 * 대시보드 숫자 — 순수 함수(테스트 동반). 세션 요약·성적 행·대전 목록·드릴 주별 집계를 화면이 바로 그릴 수 있는 꼴로 만든다.
 * 규칙: 에버리지는 점수 합 / 이닝 합(세션 평균의 평균이 아니다) — billiards-domain-rules 의 정본 공식.
 */
import { weekIdFor } from "@shared/sim/drills";
import type { DashGameType, DashTableId, SimDrillWeek, SimRatingRow, SimSessionSummary } from "./dashApi";

export interface Combo {
    readonly gameType: DashGameType;
    readonly tableId: DashTableId;
}
export const comboKey = (c: Combo): string => `${c.gameType}:${c.tableId}`;
export const sameCombo = (a: Combo, b: Combo): boolean => a.gameType === b.gameType && a.tableId === b.tableId;

/** 대전 목록에서 대시보드가 쓰는 부분(MatchPublic 의 부분집합). */
export interface DashMatchRow extends Combo {
    readonly status: "waiting" | "playing" | "finished" | "canceled";
    readonly myIndex: number;
    readonly turn: number;
    readonly winnerIndex: number | null;
    readonly createdAt: string;
    readonly finishedAt: string | null;
}

const ms = (iso: string | null | undefined): number => {
    const t = iso ? Date.parse(iso) : Number.NaN;
    return Number.isFinite(t) ? t : 0;
};

/** 마친 솔로 연습 세션(이닝 1 이상)만 기록으로 친다 — 성적 행(upsertSoloRating)과 같은 기준. */
export function isRecordedSession(s: SimSessionSummary): boolean {
    return s.status === "finished" && s.kind === "solo" && s.innings > 0;
}

/** 기록이 있는 종목·테이블 조합, 최근 활동순. 성적 행(세션 또는 대전이 있는 것)·세션·대전을 모두 본다. */
export function availableCombos(ratings: readonly SimRatingRow[], sessions: readonly SimSessionSummary[], matches: readonly DashMatchRow[]): Combo[] {
    const last = new Map<string, { combo: Combo; at: number }>();
    const bump = (combo: Combo, at: number) => {
        const k = comboKey(combo);
        const cur = last.get(k);
        if (!cur || at > cur.at) last.set(k, { combo: { gameType: combo.gameType, tableId: combo.tableId }, at });
    };
    for (const r of ratings) if (r.sessions > 0 || r.matches > 0) bump(r, ms(r.updatedAt));
    for (const s of sessions) if (isRecordedSession(s)) bump(s, ms(s.finishedAt ?? s.startedAt));
    for (const m of matches) if (m.status !== "canceled") bump(m, ms(m.finishedAt ?? m.createdAt));
    return [...last.values()].sort((a, b) => b.at - a.at).map((x) => x.combo);
}

export interface SessionPoint {
    readonly id: string;
    /** 마친 시각(없으면 시작 시각) ISO */
    readonly at: string;
    readonly avg: number;
    readonly score: number;
    readonly innings: number;
    readonly highRun: number;
    readonly target: number;
}

/** 조합의 기록 세션을 오래된 순으로. limit 이 있으면 최근 limit 개만. */
export function sessionSeries(sessions: readonly SimSessionSummary[], combo: Combo, limit?: number): SessionPoint[] {
    const rows = sessions
        .filter((s) => isRecordedSession(s) && sameCombo(s, combo))
        .map((s) => ({ id: s.id, at: s.finishedAt ?? s.startedAt, avg: s.score / s.innings, score: s.score, innings: s.innings, highRun: s.highRun, target: s.targetScore }))
        .sort((a, b) => ms(a.at) - ms(b.at));
    return limit && limit > 0 ? rows.slice(-limit) : rows;
}

/** 점수 합 / 이닝 합. 이닝이 없으면 0. */
export function pooledAvg(points: readonly Pick<SessionPoint, "score" | "innings">[]): number {
    let score = 0, innings = 0;
    for (const p of points) { score += p.score; innings += p.innings; }
    return innings > 0 ? score / innings : 0;
}

export interface RecentForm {
    /** 최근 n 세션의 에버리지(점수 합 / 이닝 합) */
    readonly avg: number;
    readonly sessions: number;
    /** 그 앞 n 세션과의 차이. 앞 블록이 없으면 null */
    readonly delta: number | null;
}

export function recentForm(series: readonly SessionPoint[], n = 10): RecentForm {
    const last = series.slice(-n);
    const prev = series.slice(Math.max(0, series.length - 2 * n), Math.max(0, series.length - n));
    const avg = pooledAvg(last);
    return { avg, sessions: last.length, delta: prev.length > 0 ? avg - pooledAvg(prev) : null };
}

export function ratingFor(ratings: readonly SimRatingRow[], combo: Combo): SimRatingRow | undefined {
    return ratings.find((r) => sameCombo(r, combo));
}

export function overallAvg(r: Pick<SimRatingRow, "totalScore" | "totalInnings"> | undefined): number {
    return r && r.totalInnings > 0 ? r.totalScore / r.totalInnings : 0;
}

export type MatchResult = "W" | "L";

export interface MatchSummary {
    readonly wins: number;
    readonly losses: number;
    /** 진행 중(대기 포함) */
    readonly active: number;
    /** 진행 중이고 내 차례 */
    readonly myTurn: number;
    /** 최근 formLen 경기 결과, 오래된 순 */
    readonly results: readonly MatchResult[];
    /** 마지막 경기부터 이어지는 연승·연패. 끝난 경기가 없으면 null */
    readonly streak: { readonly kind: MatchResult; readonly n: number } | null;
}

/** 대전 요약. combo 가 있으면 그 종목·테이블만. 승자 없는 종료(무효)는 세지 않는다. */
export function matchSummary(matches: readonly DashMatchRow[], combo: Combo | null, formLen = 10): MatchSummary {
    const rows = combo ? matches.filter((m) => sameCombo(m, combo)) : matches;
    const finished = rows
        .filter((m) => m.status === "finished" && m.winnerIndex !== null)
        .sort((a, b) => ms(a.finishedAt ?? a.createdAt) - ms(b.finishedAt ?? b.createdAt));
    const results: MatchResult[] = finished.map((m) => (m.winnerIndex === m.myIndex ? "W" : "L"));
    let wins = 0, losses = 0;
    for (const r of results) { if (r === "W") wins++; else losses++; }
    let active = 0, myTurn = 0;
    for (const m of rows) {
        if (m.status === "playing" || m.status === "waiting") {
            active++;
            if (m.status === "playing" && m.turn === m.myIndex) myTurn++;
        }
    }
    let streak: MatchSummary["streak"] = null;
    if (results.length > 0) {
        const kind = results[results.length - 1];
        let n = 0;
        for (let i = results.length - 1; i >= 0 && results[i] === kind; i--) n++;
        streak = { kind, n };
    }
    return { wins, losses, active, myTurn, results: results.slice(-formLen), streak };
}

export interface DrillWeekPoint {
    readonly weekId: string;
    readonly weekNo: number;
    readonly attempts: number;
    readonly successes: number;
    readonly cushions: number;
}

/** "2026-W37" → 37. 형식이 다르면 0. */
export function weekNumber(weekId: string): number {
    const m = /-W(\d{2})$/.exec(weekId);
    return m ? Number(m[1]) : 0;
}

/** 최근 n 주(이번 주 포함)를 빠짐없이, 오래된 순. 시도가 없는 주는 0. */
export function drillSeries(weeks: readonly SimDrillWeek[], nowMs: number, n = 8): DrillWeekPoint[] {
    const byId = new Map(weeks.map((w) => [w.weekId, w] as const));
    const out: DrillWeekPoint[] = [];
    for (let k = n - 1; k >= 0; k--) {
        const weekId = weekIdFor(nowMs - k * 7 * 86_400_000);
        const w = byId.get(weekId);
        out.push({ weekId, weekNo: weekNumber(weekId), attempts: w?.attempts ?? 0, successes: w?.successes ?? 0, cushions: w?.cushions ?? 0 });
    }
    return out;
}

export function drillTotals(weeks: readonly SimDrillWeek[]): { attempts: number; successes: number; cushions: number } {
    let attempts = 0, successes = 0, cushions = 0;
    for (const w of weeks) { attempts += w.attempts; successes += w.successes; cushions += w.cushions; }
    return { attempts, successes, cushions };
}

/** "9/8" — 로케일과 무관한 월/일. 깨진 값은 빈 문자열. */
export function shortDate(iso: string): string {
    const t = ms(iso);
    if (!t) return "";
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 부호 붙은 에버리지 차이: "+0.05" / "-0.12" / "0.00". */
export function signedAvg(d: number): string {
    // 0 에서 먼 쪽으로 반올림(-0.125 → -0.13) — Math.round 는 음수 .5 를 0 쪽으로 올린다
    const v = (Math.sign(d) * Math.round(Math.abs(d) * 100)) / 100;
    return v > 0 ? `+${v.toFixed(2)}` : v < 0 ? `-${Math.abs(v).toFixed(2)}` : "0.00";
}
