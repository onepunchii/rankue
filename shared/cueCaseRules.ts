/**
 * 큐 케이스 — 받았는가를 정하는 순수 계산(2026-10-16). 목록은 ./cueCase, 읽고 적는 일은 server/storage/cueCase.repo.
 *
 * 들어오는 것은 이미 걸러진 기록이다:
 *  - 실전: **공식 경기**(점수판의 경기 · 회원 상대가 있어 서버가 다마를 매기는 경기 — hiq_game_history.is_ranked)
 *  - 온라인: **레이팅에 반영된 대전**(hiq_sim_matches.rating_result 가 있는 판 — 친선 · 너무 짧은 판 · 연습은 빠진다)
 * 혼자 숫자를 불릴 수 없게 둘 다 상대가 있는 판만이다(기획 3장).
 *
 * 받은 때(at)는 조건이 처음 채워진 판이 끝난 때다 — 옛 기록으로 채워진 것도 그때로 적힌다.
 * 한 번 받은 것은 저장소의 받은 기록(고치지도 지우지도 않는다)이 지킨다 — 여기의 계산은 '지금 기록으로 보면'이다.
 * 달 · 철 · 시각은 한국 시계다(월대회 · 이달의 랭킹과 같다).
 */
import { CASE_ITEMS, REAL_RUN_4C, REAL_TO_ONLINE, SOON, PEOPLE_STEPS, type CaseItem, type LimitedRule, type Season } from "./cueCase.js";
import { TIERS, PLACEMENT_MATCHES, type TierId } from "./sim/rank.js";
import { realTierRank, type RealTierId } from "./realTier.js";

export interface OnlineGame {
    id: string;
    /** 끝난 때(ms) */
    at: number;
    opp: string;
    oppCountry: string | null;
    gameType: "3c" | "4c";
    won: boolean;
    /** 진 판(무승부는 won · lost 둘 다 false) */
    lost: boolean;
    /** 목표 점수 · 이닝 제한으로 끝났는가(기권 · 시간 초과 · 월대회 부전승은 false — 하이런 · 명장면에 세지 않는다) */
    natural: boolean;
    highRun: number;
    innings: number;
    target: number;
    /** 이 판 뒤의 내 레이팅 · 그 종목 판 수(등급에 처음 오른 때) */
    ratingAfter: number;
    matchesAfter: number;
    /** '한 판 더'로 열린 판인가 */
    rematch: boolean;
    /** 판 내내 (상대 진행률 − 내 진행률)의 가장 큰 값 — 0.5 넘게 뒤졌다가 이기면 역전 */
    maxDeficit: number;
    /** 내 뱅크샷 득점의 때(ms) */
    banks: readonly number[];
    /** 두 번째 적구 전에 쿠션 다섯 개 이상으로 득점한 첫 때 */
    fiveCushionAt: number | null;
}

export interface RealGame {
    id: string;
    at: number;
    startedAt: number;
    gameType: "3c" | "4c";
    won: boolean;
    /** 같은 경기에 있던 다른 회원(이름만 적은 게스트는 빠진다) */
    opps: readonly string[];
    highRun: number;
    target: number;
    /** 내 이닝별 점수 */
    innings: readonly number[];
    /** 두 사람 경기일 때만 — 상대의 마지막 점수 · 판 내내 가장 크게 뒤진 값 */
    oppScore: number | null;
    maxDeficit: number;
}

export interface CaseInput {
    nowMs: number;
    joinedAt: number;
    /** 내 나라(ISO 두 글자) — 세계 원정 초크 */
    country: string | null;
    /** 온라인 월대회 메달(1 우승 · 2 준우승 · 3 · 4 = 4강 · 5 = 8강)과 받은 때 */
    cups: readonly { rank: number; at: number }[];
    /** 이달의 랭킹 1위 메달을 받은 때 */
    monthTops: readonly number[];
    /** 월대회에 나간 때 */
    cupEntries: readonly number[];
    /** 지금의 실전 등급(두 종목 가운데 높은 쪽) */
    realTier: RealTierId | null;
    online: readonly OnlineGame[];
    real: readonly RealGame[];
}

export interface Bar { side: "real" | "online" | "all"; have: number; need: number }
export interface ItemState {
    done: boolean;
    at: number | null;
    /** 차오르는 막대 — 양쪽 큐는 둘(실전 · 온라인) */
    bars: Bar[];
    /** 아직 받는 길이 없다('곧 열려요') */
    soon?: boolean;
}

const H = 3_600_000;
const kst = (ms: number) => new Date(ms + 9 * H);
export const kstMonthKey = (ms: number): string => { const d = kst(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
/** 철과 그 해 — 겨울(12~2월)은 12월이 든 해로 묶는다 */
export function seasonOf(ms: number): { season: Season; key: string } {
    const d = kst(ms), m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
    const season: Season = m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
    return { season, key: `${season === "winter" && m <= 2 ? y - 1 : y}-${season}` };
}

/** 이닝별 점수로 (상대 진행률 − 내 진행률)의 최댓값 — 두 사람이 이닝을 번갈아 친다(먼저 친 쪽이 meFirst) */
export function deficitFromInnings(mine: readonly number[], opp: readonly number[], myTarget: number, oppTarget: number, meFirst: boolean): number {
    if (myTarget <= 0 || oppTarget <= 0) return 0;
    let a = 0, b = 0, worst = 0;
    const n = Math.max(mine.length, opp.length);
    for (let i = 0; i < n; i++) {
        const steps: (() => void)[] = [() => { a += num(mine[i]); }, () => { b += num(opp[i]); }];
        for (const step of meFirst ? steps : steps.reverse()) {
            step();
            worst = Math.max(worst, Math.min(1, b / oppTarget) - Math.min(1, a / myTarget));
        }
    }
    return worst;
}
/** 샷 순서대로의 득점(친 사람 · 점수)으로 같은 값 */
export function deficitFromShots(shots: readonly { me: boolean; points: number }[], myTarget: number, oppTarget: number): number {
    if (myTarget <= 0 || oppTarget <= 0) return 0;
    let a = 0, b = 0, worst = 0;
    for (const s of shots) {
        if (s.me) a += s.points; else b += s.points;
        worst = Math.max(worst, Math.min(1, b / oppTarget) - Math.min(1, a / myTarget));
    }
    return worst;
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 정렬된 때들에서 n번째(1부터)의 때 */
const nth = (times: readonly number[], n: number): number | null => (times.length >= n ? times[n - 1] : null);
const count = (have: number, need: number, side: Bar["side"] = "all"): Bar => ({ side, have: Math.min(have, need), need });
const state = (at: number | null, bars: Bar[] = []): ItemState => ({ done: at !== null, at, bars });
const earliest = (...xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.min(...v) : null; };
const latestOf = (...xs: (number | null)[]): number | null => (xs.some((x) => x === null) ? null : Math.max(...(xs as number[])));

/** 한 사람의 큐 케이스 전부 — id → 상태 */
export function evaluateCase(input: CaseInput): Record<string, ItemState> {
    const online = [...input.online].sort((a, b) => a.at - b.at);
    const real = [...input.real].sort((a, b) => a.at - b.at);
    const realAt = real.map((g) => g.at);
    const onAt = online.map((g) => g.at);
    const onWinAt = online.filter((g) => g.won).map((g) => g.at);
    const realWinAt = real.filter((g) => g.won).map((g) => g.at);
    const natural = online.filter((g) => g.natural);

    // 사람 — 처음 만난 때(실전 · 온라인 합쳐 같은 사람은 한 번)
    const firstMet = new Map<string, number>(), firstReal = new Map<string, number>(), firstOnline = new Map<string, number>();
    const meet = (m: Map<string, number>, id: string, at: number) => { if (!m.has(id)) m.set(id, at); };
    for (const g of real) for (const o of g.opps) { meet(firstMet, o, g.at); meet(firstReal, o, g.at); }
    for (const g of online) { meet(firstMet, g.opp, g.at); meet(firstOnline, g.opp, g.at); }
    const firstMetAll = [...firstMet.values()].sort((a, b) => a - b);
    // 같은 상대와의 판 — 실전 1판 = 온라인 3판
    const pair = new Map<string, { at: number; w: number; real: boolean; rematch: boolean }[]>();
    const push = (id: string, e: { at: number; w: number; real: boolean; rematch: boolean }) => { const l = pair.get(id); if (l) l.push(e); else pair.set(id, [e]); };
    for (const g of real) for (const o of g.opps) push(o, { at: g.at, w: REAL_TO_ONLINE, real: true, rematch: false });
    for (const g of online) push(g.opp, { at: g.at, w: 1, real: false, rematch: g.rematch });
    for (const l of pair.values()) l.sort((a, b) => a.at - b.at);
    /** 같은 상대 한 사람과 쌓은 값이 need 에 닿은 가장 이른 때 · 가장 많이 쌓은 값 */
    const bestPair = (pick: (e: { w: number; real: boolean; rematch: boolean }) => number, need: number) => {
        let at: number | null = null, best = 0;
        for (const l of pair.values()) {
            let sum = 0;
            for (const e of l) { sum += pick(e); if (sum >= need) { at = earliest(at, e.at); break; } }
            best = Math.max(best, sum);
        }
        return { at, best };
    };

    // 칸 — 달마다 · 철마다(실전 3칸 · 온라인 1칸)
    const cells = [...real.map((g) => ({ at: g.at, w: REAL_TO_ONLINE, real: true })), ...online.map((g) => ({ at: g.at, w: 1, real: false }))].sort((a, b) => a.at - b.at);
    const fill = (keyOf: (ms: number) => string, need: number) => {
        const by = new Map<string, { sum: number; real: number; at: number | null }>();
        for (const c of cells) {
            const k = keyOf(c.at), v = by.get(k) ?? { sum: 0, real: 0, at: null };
            if (v.at === null) { v.sum += c.w; if (c.real) v.real += c.w; if (v.sum >= need) v.at = c.at; }
            by.set(k, v);
        }
        return by;
    };
    const months = fill(kstMonthKey, 12);
    const seasons = fill((ms) => seasonOf(ms).key, 12);
    const nowMonth = kstMonthKey(input.nowMs), nowSeason = seasonOf(input.nowMs);
    const gloveAt = (m: number) => { let at: number | null = null; for (const [k, v] of months) if (Number(k.slice(5)) === m && v.at !== null) at = earliest(at, v.at); return at; };

    // 온라인 등급 — 배치를 마친 판 뒤의 레이팅이 처음 닿은 때
    const tierAt = (tier: TierId): number | null => {
        const min = TIERS.find((t) => t.id === tier)?.min ?? Infinity;
        return online.find((g) => g.matchesAfter >= PLACEMENT_MATCHES && g.ratingAfter >= min)?.at ?? null;
    };
    const peakRating = Math.max(Number.NEGATIVE_INFINITY, ...online.filter((g) => g.matchesAfter >= PLACEMENT_MATCHES).map((g) => g.ratingAfter));

    const realRunAt = (n: number) => real.find((g) => g.highRun >= (g.gameType === "4c" ? n * REAL_RUN_4C : n))?.at ?? null;
    /** 실전 하이런을 3쿠션 눈금으로(4구는 나눈다) */
    const realRunBest = Math.max(0, ...real.map((g) => (g.gameType === "4c" ? Math.floor(g.highRun / REAL_RUN_4C) : g.highRun)));
    const onRun = (n: number) => natural.find((g) => g.gameType === "3c" && g.highRun >= n)?.at ?? null;
    const onRunBest = Math.max(0, ...natural.filter((g) => g.gameType === "3c").map((g) => g.highRun));
    const banks = online.flatMap((g) => g.banks).sort((a, b) => a - b);
    // 연승 — 진 판 · 무승부는 끊고, 기권 · 시간 초과로 이긴 판은 세지도 끊지도 않는다
    const streakAt = (n: number) => {
        let run = 0, best = 0;
        for (const g of online) {
            if (g.won && !g.natural) continue;
            run = g.won ? run + 1 : 0; best = Math.max(best, run);
            if (run >= n) return { at: g.at, best: n };
        }
        return { at: null, best };
    };
    const people = (n: number) => state(nth(firstMetAll, n), [count(firstMet.size, n)]);
    const seasonPeople = (s: Season, n: number) => {
        const by = new Map<string, number[]>();
        for (const at of firstMetAll) { const k = seasonOf(at); if (k.season === s) by.set(k.key, [...(by.get(k.key) ?? []), at]); }
        let at: number | null = null;
        for (const l of by.values()) at = earliest(at, nth(l, n));
        const cur = nowSeason.season === s ? (by.get(nowSeason.key)?.length ?? 0) : 0;
        return state(at, nowSeason.season === s ? [count(cur, n)] : []);
    };
    const triple3 = earliest(
        real.find((g) => g.gameType === "3c" && g.won && g.target >= 5 && g.innings.length > 0 && g.innings.length <= 3)?.at ?? null,
        natural.find((g) => g.gameType === "3c" && g.won && g.target >= 5 && g.innings > 0 && g.innings <= 3)?.at ?? null,
    );
    const crosses = (from: number, to: number, hh: number, mm: number) => {
        const d = kst(from), base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 9 * H;
        for (const day of [0, 1]) { const mark = base + day * 24 * H + hh * H + mm * 60_000; if (mark > from && mark < to) return true; }
        return false;
    };
    const jjajang = real.find((g) => g.at - g.startedAt >= 15 * 60_000 && g.at - g.startedAt <= 6 * H && (crosses(g.startedAt, g.at, 12, 30) || crosses(g.startedAt, g.at, 18, 30)))?.at ?? null;
    const dawn = real.find((g) => { const h = kst(g.at).getUTCHours(); return h >= 2 && h < 5; })?.at ?? null;
    const anniversary = input.joinedAt + 365 * 24 * H <= input.nowMs ? input.joinedAt + 365 * 24 * H : null;

    // 양쪽 — 같은 달에 실전 10 + 온라인 10
    const sameMonth = (() => {
        const by = new Map<string, { r: number; o: number; at: number | null }>();
        for (const c of cells) {
            const k = kstMonthKey(c.at), v = by.get(k) ?? { r: 0, o: 0, at: null };
            if (c.real) v.r += 1; else v.o += 1;
            if (v.at === null && v.r >= 10 && v.o >= 10) v.at = c.at;
            by.set(k, v);
        }
        let at: number | null = null;
        for (const v of by.values()) at = earliest(at, v.at);
        const cur = by.get(nowMonth) ?? { r: 0, o: 0 };
        return state(at, [count(cur.r, 10, "real"), count(cur.o, 10, "online")]);
    })();
    const run10 = state(latestOf(realRunAt(10), onRun(10)), [count(realRunBest, 10, "real"), count(onRunBest, 10, "online")]);
    const people30 = state(latestOf(nth([...firstReal.values()].sort((a, b) => a - b), 30), nth([...firstOnline.values()].sort((a, b) => a - b), 30)), [count(firstReal.size, 30, "real"), count(firstOnline.size, 30, "online")]);
    const games100 = state(latestOf(nth(realAt, 100), nth(onWinAt, 100)), [count(real.length, 100, "real"), count(onWinAt.length, 100, "online")]);
    const firstWins = state(latestOf(nth(realWinAt, 1), nth(onWinAt, 1)), [count(realWinAt.length, 1, "real"), count(onWinAt.length, 1, "online")]);
    const gloveTimes = Array.from({ length: 12 }, (_, i) => gloveAt(i + 1));
    const gloveMonths = [...months.values()].filter((v) => v.at !== null);
    const gloveReal = gloveMonths.reduce((s, v) => s + v.real, 0), gloveSum = gloveMonths.reduce((s, v) => s + v.sum, 0);
    const gloves12 = state(gloveTimes.every((x) => x !== null) && gloveReal * 2 >= gloveSum ? latestOf(...gloveTimes) : null, [count(gloveTimes.filter((x) => x !== null).length, 12)]);
    const goldAt = tierAt("gold");
    const realGold = input.realTier !== null && realTierRank(input.realTier) >= realTierRank("gold");
    // 실전 등급은 언제 올랐는지 기록에 없다 — 마지막 공식 경기 때 이미 그 등급이었다고 본다
    const gold = state(realGold && goldAt !== null ? Math.max(goldAt, real.length ? real[real.length - 1].at : goldAt) : null, [count(realGold ? 1 : 0, 1, "real"), count(goldAt !== null ? 1 : 0, 1, "online")]);
    const gloveYear = (() => {
        const by = new Map<string, Set<string>>(), atBy = new Map<string, number>();
        for (const [k, v] of months) if (v.at !== null) { const y = k.slice(0, 4); by.set(y, new Set([...(by.get(y) ?? []), k])); atBy.set(y, Math.max(atBy.get(y) ?? 0, v.at)); }
        let at: number | null = null;
        for (const [y, s] of by) if (s.size >= 12) at = earliest(at, atBy.get(y) ?? null);
        return state(at, [count(by.get(nowMonth.slice(0, 4))?.size ?? 0, 12)]);
    })();

    // 한정판 — 조건은 여기서, 99자루 상한은 저장소가 번호를 줄 때 지킨다(다 나가면 더 적지 않는다)
    const limited = (k: LimitedRule): ItemState => {
        if (k === "doubleMaster") {
            const on = tierAt("master"), realOk = input.realTier === "master";
            return state(realOk && on !== null ? Math.max(on, real.length ? real[real.length - 1].at : on) : null, [count(realOk ? 1 : 0, 1, "real"), count(on !== null ? 1 : 0, 1, "online")]);
        }
        if (k === "thousand") return state(latestOf(nth(realAt, 1000), nth(onAt, 300)), [count(real.length, 1000, "real"), count(online.length, 300, "online")]);
        if (k === "tripleCup") { const wins = input.cups.filter((c) => c.rank === 1).map((c) => c.at).sort((a, b) => a - b); return state(nth(wins, 3), [count(wins.length, 3, "online")]); }
        if (k === "legendRun") return state(latestOf(realRunAt(15), onRun(15)), [count(realRunBest, 15, "real"), count(onRunBest, 15, "online")]);
        // 다섯 나라 — 내 나라와 다른 나라(내 나라를 모르면 나라가 적힌 상대 모두)를 처음 만난 때 순서로
        const seen = new Map<string, number>();
        for (const g of online) if (g.oppCountry && g.oppCountry !== input.country && !seen.has(g.oppCountry)) seen.set(g.oppCountry, g.at);
        const times = [...seen.values()].sort((a, b) => a - b);
        return state(nth(times, 5), [count(times.length, 5, "online")]);
    };

    const out: Record<string, ItemState> = {};
    for (const x of CASE_ITEMS) out[x.id] = SOON.has(x.id) ? { done: false, at: null, bars: [], soon: true } : judge(x);
    return out;

    function judge(x: CaseItem): ItemState {
        const r = x.rule;
        switch (r.k) {
            case "realGames": return state(nth(realAt, r.n), [count(real.length, r.n, "real")]);
            case "realRun": return state(realRunAt(r.n), [count(realRunBest, r.n, "real")]);
            case "realScene": {
                if (r.s === "shutout") return state(real.find((g) => g.won && g.oppScore !== null && g.oppScore <= 0)?.at ?? null);
                if (r.s === "comeback") return state(real.find((g) => g.won && g.maxDeficit > 0.5)?.at ?? null);
                if (r.s === "noMiss") return state(real.find((g) => g.innings.length >= 3 && g.innings.every((p) => p > 0))?.at ?? null);
                // 다마 넘김 · 다마 오름은 경기를 끝내는 순간 서버가 받은 기록에 바로 적는다 — 여기서는 판정하지 않는다
                if (r.s === "overTarget" || r.s === "damaUp") return state(null);
                return { done: false, at: null, bars: [], soon: true };
            }
            case "realRegular": { const p = bestPair((e) => (e.real ? 1 : 0), r.n); return state(p.at, [count(p.best, r.n, "real")]); }
            case "realNewFace": return state(nth([...firstReal.values()].sort((a, b) => a - b), r.n), [count(firstReal.size, r.n, "real")]);
            case "hidden": return state(r.s === "jjajang" ? jjajang : r.s === "dawn" ? dawn : r.s === "triple3" ? triple3 : anniversary);
            case "onTier": return state(tierAt(r.tier));
            case "onCup": return state(input.cups.filter((c) => (r.place === 4 ? c.rank === 3 || c.rank === 4 : c.rank === r.place)).map((c) => c.at).sort((a, b) => a - b)[0] ?? null);
            case "onMonthTop": return state([...input.monthTops].sort((a, b) => a - b)[0] ?? null);
            case "onWins": return state(nth(onWinAt, r.n), [count(onWinAt.length, r.n, "online")]);
            case "onGames": return state(nth(onAt, r.n), [count(online.length, r.n, "online")]);
            case "onRun": return state(onRun(r.n), [count(onRunBest, r.n, "online")]);
            case "bank": return state(nth(banks, r.n), [count(banks.length, r.n, "online")]);
            case "fiveCushion": return state(earliest(...online.map((g) => g.fiveCushionAt)));
            case "streak": { const s = streakAt(r.n); return state(s.at, [count(s.best, r.n, "online")]); }
            case "onComeback": return state(natural.find((g) => g.won && g.maxDeficit > 0.5)?.at ?? null);
            case "rival": { const p = bestPair((e) => (e.rematch ? 1 : 0), r.n); return state(p.at, [count(p.best, r.n, "online")]); }
            case "season": { const v = seasons.get(nowSeason.key); let at: number | null = null; for (const [k, s] of seasons) if (k.endsWith(`-${r.s}`)) at = earliest(at, s.at); return state(at, nowSeason.season === r.s ? [count(v?.sum ?? 0, 12)] : []); }
            case "people": return people(r.n);
            case "both": return r.s === "firstWins" ? firstWins : r.s === "sameMonth" ? sameMonth : r.s === "run10" ? run10 : r.s === "people30" ? people30 : r.s === "games100" ? games100 : r.s === "gloves12" ? gloves12 : gold;
            case "seasonPeople": return seasonPeople(r.s, r.n);
            case "world": return state(input.country ? online.find((g) => g.oppCountry && g.oppCountry !== input.country)?.at ?? null : null);
            case "sameOpp": { const p = bestPair((e) => e.w, r.n); return state(p.at, [count(p.best, r.n)]); }
            case "glove": { const v = months.get(nowMonth); const cur = Number(nowMonth.slice(5)) === r.m; return state(gloveAt(r.m), cur ? [count(v?.sum ?? 0, 12)] : []); }
            case "gloveFirst": return state(input.joinedAt);
            case "gloveYear": return gloveYear;
            case "gloveCup": return state([...input.cupEntries].sort((a, b) => a - b)[0] ?? null);
            case "limited": return limited(r.s);
            default: return { done: false, at: null, bars: [], soon: true };
        }
    }
}

/** 사람 초크 아홉 단계 — 화면의 '다음 초크까지 n명' */
export const nextPeopleStep = (met: number): number | null => PEOPLE_STEPS.find((s) => s > met) ?? null;
