/**
 * 실전 경기의 이상 표시(2026-10-16 어드민 전수 조사 — "'1이닝 16점' · 짜고 친 공식전을 지금은 회원을 한 명씩 열어 찾아야 한다").
 * 운영 화면(어드민 › 당구 › 실전 경기)이 경기마다 붙이는 표시 — 판정이 아니라 **사람이 다시 볼 것**을 고르는 체다. 순수 함수.
 *
 * 기준(운영 기록 실측 10/16 — 3쿠션 35판 · 4구 144판, 하이런 99분위 3쿠션 24.9 · 4구 24.1, 이닝 99분위 62 · 43):
 *  - 3쿠션 한 이닝 10점 이상(세계 기록이 28점 안팎 — 동호인 공식전에서는 거의 없다) · 4구 한 이닝 40점 이상
 *  - 이닝당 득점 3쿠션 2.0 이상 · 4구 20 이상(10이닝 넘게 친 판만)
 *  - 평소 에버리지의 2.5배 넘게(평소 에버가 있고 10이닝 넘게 친 판만)
 *  - 80이닝 넘는 판(입력 실수?) · 끝났는데 모두 0점인 공식전
 *  - 같은 두 회원이 같은 날 공식전 4판 넘게(레이팅 주고받기?)
 */
export type GameFlagId = "highRun" | "pace" | "overAvg" | "longGame" | "zero" | "samePair";
export interface GameFlag { id: GameFlagId; text: string }

export interface FlagPlayer { id: string | null; name: string; score: number; highRun: number; avg: number | null }
export interface FlagGame { gameType: "3c" | "4c"; ranked: boolean; totalInnings: number; players: readonly FlagPlayer[] }

export const FLAG_RULES = {
    highRun: { "3c": 10, "4c": 40 },
    pace: { "3c": 2.0, "4c": 20 },
    overAvg: 2.5,
    minInnings: 10,
    longGame: 80,
    samePairPerDay: 4,
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function gameFlags(g: FlagGame, samePairCount = 0): GameFlag[] {
    const out: GameFlag[] = [];
    const type = g.gameType === "3c" ? "3쿠션" : "4구";
    const hr = g.players.reduce((best, p) => (p.highRun > best.highRun ? p : best), g.players[0] ?? { highRun: 0, name: "" } as FlagPlayer);
    if (hr && hr.highRun >= FLAG_RULES.highRun[g.gameType]) out.push({ id: "highRun", text: `${type} 한 이닝 ${hr.highRun}점 — ${hr.name}` });
    if (g.totalInnings >= FLAG_RULES.minInnings) {
        for (const p of g.players) {
            const pace = p.score / g.totalInnings;
            if (pace >= FLAG_RULES.pace[g.gameType]) { out.push({ id: "pace", text: `이닝당 ${round1(pace)}점 — ${p.name}` }); break; }
        }
        for (const p of g.players) {
            if (!p.avg || p.avg <= 0) continue;
            const ratio = p.score / g.totalInnings / p.avg;
            if (ratio >= FLAG_RULES.overAvg) { out.push({ id: "overAvg", text: `평소 에버리지의 ${round1(ratio)}배 — ${p.name}` }); break; }
        }
    }
    if (g.totalInnings >= FLAG_RULES.longGame) out.push({ id: "longGame", text: `${g.totalInnings}이닝 — 입력 실수일 수 있어요` });
    if (g.ranked && g.players.length > 0 && g.players.every((p) => p.score <= 0)) out.push({ id: "zero", text: "공식전인데 모두 0점" });
    if (g.ranked && samePairCount > FLAG_RULES.samePairPerDay) out.push({ id: "samePair", text: `같은 두 사람이 이날 공식전 ${samePairCount}판` });
    return out;
}

/** 같은 두 회원 · 같은 한국 날짜의 열쇠(회원끼리 친 공식전만) */
export function pairDayKey(day: string, ids: readonly (string | null)[]): string | null {
    const m = ids.filter((x): x is string => !!x).sort();
    return m.length === 2 ? `${day}|${m[0]}|${m[1]}` : null;
}

/** GET /admin/billiards/games 의 한 줄 */
export interface AdminGameRow {
    id: string;
    playedAt: string;
    gameType: "3c" | "4c";
    gameMode: string;
    ranked: boolean;
    storeName: string | null;
    totalInnings: number;
    players: { id: string | null; name: string; score: number; target: number; highRun: number; innings: number[] | null; winner: boolean }[];
    flags: GameFlag[];
    /** 크루 대진에 묶인 판(지울 수 없다) */
    bracket: boolean;
}
