/**
 * 랭큐매치(골프) 점수·정산 규칙. **화면과 서버가 같은 식을 쓴다.**
 *
 * 왜 여기로 뺐나(2026-09-11 검토):
 *  - 계산이 화면(useRankueMatch)에만 있어서 서버는 경기가 끝나도 정산을 몰랐다. 결과 화면은 볼 때마다
 *    다시 계산했고, 끝난 뒤에 코스를 바꾸면 이미 끝난 홀 금액까지 소급해서 바뀌었다.
 *  - 파를 모르는 코스(1,088개 중 315개)에서 코드에 박힌 파 배치를 진짜처럼 써서, 실제 파4 홀이
 *    파5 로 잡혀 '버디 상금' 이 오가고 배판이 걸렸다. 이제 파를 모르는 홀은 known=false 로 들고 다니고,
 *    버디·이글 상금과 배판 판정에는 쓰지 않는다(타수 차이 정산은 파와 무관하니 그대로 한다).
 *  - 서버는 들어온 점수를 모양도 안 보고 저장했다(문자열 '5' 가 들어가면 합계가 '0553…' 로 이어붙었다).
 *    sanitizeScores 가 18칸 정수 0~15 만 통과시킨다.
 */

export const HOLES = 18;
/** 한 홀 최대 타수. 이보다 크면 입력 실수로 본다. 0 은 '아직 안 적음'. */
export const MAX_STROKES = 15;
/** 파를 모를 때 화면에 채워 두는 배치. 계산 근거로는 쓰지 않는다(known=false). */
export const DEFAULT_PAR: readonly number[] = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

export type DoublingMode = "none" | "current" | "next";

export interface MatchRules {
    stake: number;
    useDouble: boolean;
    doublingMode: DoublingMode;
    birdieAmount: number;
    eagleAmount: number;
}

export interface MatchPlayerLike {
    memberId: string;
    name: string;
    scores?: number[] | null;
}

export interface Transaction {
    holeIndex: number;
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
    details: string[];
}

export interface CoursePars {
    pars: number[];
    /** 그 홀의 파를 실제 코스 자료로 아는가. false 면 화면용 추정값이다. */
    known: boolean[];
}

function validPar(v: unknown): v is number {
    return Number.isInteger(v) && (v as number) >= 3 && (v as number) <= 6;
}

/** 코스 한쪽(9홀)의 파. 자료가 9칸이면 그대로, 18칸이면 앞/뒤 9칸을 쓴다. 모자라면 모른다. */
function nineFrom(arr: unknown, half: 0 | 1): number[] | null {
    if (!Array.isArray(arr)) return null;
    let nine: unknown[] | null = null;
    if (arr.length === 9) nine = arr;
    else if (arr.length === 18) nine = arr.slice(half * 9, half * 9 + 9);
    if (!nine || !nine.every(validPar)) return null;
    return nine as number[];
}

/**
 * 전반·후반 코스의 파를 18칸으로 편다.
 * 예전 서버는 `frontPars && backPars` 로 골랐는데 빈 배열([])도 참이라, 한쪽이 비면 실제 전반 파까지
 * 버리고 18홀 전부 가짜 파를 썼다. 이제 반쪽씩 따로 판단한다.
 */
export function resolvePars(front?: unknown, back?: unknown): CoursePars {
    const f = nineFrom(front, 0);
    const b = nineFrom(back, 1);
    const pars: number[] = [];
    const known: boolean[] = [];
    for (let i = 0; i < HOLES; i++) {
        const src = i < 9 ? f : b;
        const v = src ? src[i % 9] : null;
        pars.push(v ?? DEFAULT_PAR[i]);
        known.push(v != null);
    }
    return { pars, known };
}

export function isValidStroke(s: unknown): s is number {
    return Number.isInteger(s) && (s as number) >= 1 && (s as number) <= MAX_STROKES;
}

/** 18칸 정수 0~15 만 받는다. 모양이 틀리면 null. */
export function sanitizeScores(input: unknown): number[] | null {
    if (!Array.isArray(input) || input.length !== HOLES) return null;
    const out: number[] = [];
    for (const v of input) {
        const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
        if (n === 0 || n === null || n === undefined) { out.push(0); continue; }
        if (!isValidStroke(n)) return null;
        out.push(n);
    }
    return out;
}

/** 18홀을 모두 적었는가. 기록(평균·등급·여권)에는 다 친 라운드만 들어간다. */
export function isCompleteRound(scores: readonly number[] | null | undefined): boolean {
    return Array.isArray(scores) && scores.length === HOLES && scores.every(isValidStroke);
}

export interface RoundTotals {
    strokes: number;
    holesPlayed: number;
    /** 친 홀들의 파 합. 안 친 홀은 넣지 않는다. */
    parPlayed: number;
    relative: number;
}

export function roundTotals(scores: readonly number[] | null | undefined, pars: readonly number[]): RoundTotals {
    let strokes = 0, holesPlayed = 0, parPlayed = 0;
    for (let i = 0; i < HOLES; i++) {
        const s = Number(scores?.[i] ?? 0);
        if (!isValidStroke(s)) continue;
        strokes += s;
        holesPlayed++;
        parPlayed += pars[i] ?? 4;
    }
    return { strokes, holesPlayed, parPlayed, relative: strokes - parPlayed };
}

/** 'E' · '+3' · '−2'. 예전 결과 화면은 언더파를 '(+-2)' 로 찍었다. */
export function formatRelative(n: number): string {
    if (n === 0) return "E";
    return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** 그 홀에서 누군가 버디 이하 또는 양파(파3 는 +2, 그 외 +3 이상)를 쳤는가. 파를 모르는 홀은 판단하지 않는다. */
function doubleTrigger(h: number, players: readonly MatchPlayerLike[], cp: CoursePars): boolean {
    if (!cp.known[h]) return false;
    const par = cp.pars[h];
    return players.some((p) => {
        const s = Number(p.scores?.[h] ?? 0);
        if (!isValidStroke(s)) return false;
        return s <= par - 1 || (par === 3 ? s >= par + 2 : s >= par + 3);
    });
}

/** 이 홀이 배판인가. 'next' 는 직전 홀 조건, 'current' 는 이 홀 자체 조건. */
export function isDoubleHole(h: number, players: readonly MatchPlayerLike[], cp: CoursePars, rules: MatchRules): boolean {
    if (!rules.useDouble || rules.doublingMode === "none") return false;
    if (rules.doublingMode === "current") return doubleTrigger(h, players, cp);
    return h > 0 && doubleTrigger(h - 1, players, cp);
}

/** 한 홀의 1:1 정산. 두 사람 모두 적은 홀만 센다. */
export function holeTransactions(
    h: number,
    players: readonly MatchPlayerLike[],
    cp: CoursePars,
    rules: MatchRules,
): Transaction[] {
    const out: Transaction[] = [];
    if (!(rules.stake > 0) && !(rules.birdieAmount > 0) && !(rules.eagleAmount > 0)) return out;
    const double = isDoubleHole(h, players, cp, rules);
    const stake = double ? rules.stake * 2 : rules.stake;
    const parKnown = cp.known[h];
    const par = cp.pars[h];

    const bonus = (s: number, name: string, log: string[]) => {
        if (!parKnown) return 0;
        const diff = s - par;
        if (diff <= -2 && rules.eagleAmount > 0) { log.push(`🦅 ${name} 이글 +${rules.eagleAmount.toLocaleString()}`); return rules.eagleAmount; }
        if (diff === -1 && rules.birdieAmount > 0) { log.push(`🐦 ${name} 버디 +${rules.birdieAmount.toLocaleString()}`); return rules.birdieAmount; }
        return 0;
    };

    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const a = players[i], b = players[j];
            const sa = Number(a.scores?.[h] ?? 0), sb = Number(b.scores?.[h] ?? 0);
            if (!isValidStroke(sa) || !isValidStroke(sb)) continue;
            const log: string[] = [];
            let forA = 0;
            if (sa !== sb) {
                const diff = Math.abs(sa - sb);
                const amt = diff * stake;
                forA = sa < sb ? amt : -amt;
                if (amt > 0) log.push(`${sa < sb ? a.name : b.name} ${diff}타 차 +${amt.toLocaleString()}`);
            }
            forA += bonus(sa, a.name, log) - bonus(sb, b.name, log);
            if (forA === 0) continue;
            if (double) log.push("🔥 배판");
            const aWins = forA > 0;
            out.push({
                holeIndex: h,
                fromId: aWins ? b.memberId : a.memberId,
                fromName: aWins ? b.name : a.name,
                toId: aWins ? a.memberId : b.memberId,
                toName: aWins ? a.name : b.name,
                amount: Math.abs(forA),
                details: log,
            });
        }
    }
    return out;
}

export interface Settlement {
    totals: Record<string, number>;
    transactions: Transaction[];
}

/** 적힌 홀 전부의 정산. 보고 있는 홀과 무관하게 18홀 전체를 본다(예전엔 '지금 홀까지'만 셌다). */
export function settleMatch(players: readonly MatchPlayerLike[], cp: CoursePars, rules: MatchRules): Settlement {
    const totals: Record<string, number> = {};
    for (const p of players) totals[p.memberId] = 0;
    const transactions: Transaction[] = [];
    for (let h = 0; h < HOLES; h++) {
        for (const t of holeTransactions(h, players, cp, rules)) {
            totals[t.fromId] = (totals[t.fromId] ?? 0) - t.amount;
            totals[t.toId] = (totals[t.toId] ?? 0) + t.amount;
            transactions.push(t);
        }
    }
    return { totals, transactions };
}

export interface Transfer { fromId: string; toId: string; amount: number }

/** '누가 누구에게 얼마' 를 가장 적은 건수로. 홀마다 주고받은 걸 다 적으면 4명이면 수십 줄이 된다. */
export function minimalTransfers(totals: Record<string, number>): Transfer[] {
    const debtors = Object.entries(totals).filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v })).sort((a, b) => b.left - a.left);
    const creditors = Object.entries(totals).filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v })).sort((a, b) => b.left - a.left);
    const out: Transfer[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amt = Math.min(debtors[i].left, creditors[j].left);
        if (amt > 0) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amount: amt });
        debtors[i].left -= amt;
        creditors[j].left -= amt;
        if (debtors[i].left === 0) i++;
        if (creditors[j].left === 0) j++;
    }
    return out;
}

/** 스트로크(실력 승부)는 판돈이 없다. 예전엔 숨은 기본값 1타 1만원·배판이 그대로 저장돼 결과에 금액이 떴다. */
export function rulesFor(mode: string | null | undefined, raw: Partial<MatchRules>): MatchRules {
    if (mode !== "skins") return { stake: 0, useDouble: false, doublingMode: "none", birdieAmount: 0, eagleAmount: 0 };
    const money = (v: unknown, max: number) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
    };
    const mode2: DoublingMode = raw.doublingMode === "current" || raw.doublingMode === "next" ? raw.doublingMode : "none";
    return {
        stake: money(raw.stake, 100_000),
        useDouble: !!raw.useDouble && mode2 !== "none",
        doublingMode: raw.useDouble ? mode2 : "none",
        birdieAmount: money(raw.birdieAmount, 100_000),
        eagleAmount: money(raw.eagleAmount, 200_000),
    };
}

/** 게스트(앱 없는 동반자) 표지. 회원 번호와 절대 겹치지 않게 접두어를 붙인다. */
export const GUEST_PREFIX = "guest-";
export function isGuestId(id: string | null | undefined): boolean {
    return typeof id === "string" && id.startsWith(GUEST_PREFIX);
}

export interface RankedRow<P> extends RoundTotals {
    player: P;
    /** 동타면 같은 순위 */
    rank: number;
    /** 두 명 이상이 쳤을 때, 가장 많이 친 사람들 중 1위 */
    winner: boolean;
}

/**
 * 순위: **친 홀이 많은 사람이 앞**, 그다음 파 대비 타수. 결과 화면과 서버 기록(isWinner)이 같이 쓴다.
 * 예전 결과 화면은 파 대비 타수만 봐서 9홀만 친 사람이나 한 홀도 안 적은 사람(0홀 = E)이 18홀 완주자보다
 * 앞섰고, 서버는 또 다른 규칙으로 승자를 적었다(2026-09-11 리뷰).
 */
export function rankRound<P extends MatchPlayerLike>(players: readonly P[], pars: readonly number[]): RankedRow<P>[] {
    const rows = players.map((p) => ({ player: p, ...roundTotals(p.scores, pars) }));
    rows.sort((a, b) => (b.holesPlayed - a.holesPlayed) || (a.relative - b.relative));
    const out: RankedRow<P>[] = [];
    rows.forEach((r, i) => {
        const prev = out[i - 1];
        const rank = prev && prev.holesPlayed === r.holesPlayed && prev.relative === r.relative ? prev.rank : i + 1;
        out.push({ ...r, rank, winner: false });
    });
    if (out.filter((r) => r.holesPlayed > 0).length >= 2) {
        const top = out[0];
        for (const r of out) if (r.rank === 1 && r.holesPlayed === top.holesPlayed && r.holesPlayed > 0) r.winner = true;
    }
    return out;
}
