/**
 * 랭큐매치 '이 홀 기록'(2026-10-01 오너 승인) — 퍼팅·페어웨이·벌타 태그의 규칙 한 곳.
 * 경기 화면 카드(components/HoleStatsCard)·서버(저장 검증·지난번 이 홀)·라운딩 리포트(통계)가 같은 식을 쓴다.
 *
 * 무엇이고 무엇이 아닌가:
 *  - **폰 주인 자기 것만** 적는다(v1). 타수는 방장이 모두 적지만 퍼팅·페어웨이는 각자 아는 것이라, 참가자 누구나
 *    자기 칸에만 쓴다(POST /golf/match/:id/hole-stats — 저장소가 로그인 회원의 칸만 고친다).
 *    남의 기록은 경기 응답에서 걷어 낸다(withoutHoleStats) — 동반자에게도 안 보인다. 내 것은 전용 GET 으로만.
 *  - 벌타 태그(OB·해저드·벙커)는 **태그일 뿐** 타수를 바꾸지 않는다. 타수의 정본은 방장의 +/− 다.
 *    2026-10-01 오너: "벌타는 헷갈리니 빼자" — 화면에서 뺐다. 칸·검증은 남긴다(그 전에 적힌 기록, 열려 있던 화면의 요청이 400 이 되지 않게).
 *  - 페어웨이도 같은 날 오너: "러프인지 페어웨이인지만" — 화면은 페어웨이(H)·러프(M) 둘. 그 전 몇 시간 동안 적힌 왼쪽(L)·오른쪽(R)은 러프로 센다.
 *  - 기존 players[].penalties({ ob, hz, bunk, putt3 }) 와 섞지 않는다. 그 칸은 방장이 모두에게 적던 옛 게임 규칙용
 *    표시인데(지금 화면엔 켜는 곳이 없다), 방장 폰의 점수 저장이 **홀마다 통째로 덮어쓴다** — 동반자가 적은 태그를
 *    거기 두면 방장이 다음 홀로 넘길 때 방장 폰의 옛 값으로 지워진다. 그래서 칸 이름부터 따로(penaltyTags) 둔다.
 *  - 적지 않아도 된다. 점수·평균·등급·여권 도장·현장 인증은 이 칸을 읽지 않는다.
 * ⚠️ 서버가 이 파일을 읽는다 — 상대 임포트는 반드시 './x.js' (serverless-shared-imports).
 */
import { isValidStroke } from "./golfMatch.js";

export const HOLE_COUNT = 18;
/** 퍼팅 칩 '4+' 가 적는 값 */
export const PUTTS_PLUS = 4;
/** 서버가 받는 퍼팅 상한 — 칩은 4+ 까지지만 나중에 정확한 수를 받을 여지를 둔다 */
export const MAX_PUTTS = 9;
/** 끝난 라운드에도 이만큼은 받는다 — 18번 홀 퍼팅을 누르는 사이 방장이 '라운드 끝내기'를 누르면 마지막 저장이 튕겼다 */
export const HOLE_STATS_GRACE_MINUTES = 30;

/** H 페어웨이 · M 러프(빗나감, 방향은 안 묻는다) · L/R 옛 값(왼쪽·오른쪽 러프) */
export type Fairway = "H" | "M" | "L" | "R";
export const FAIRWAYS: readonly Fairway[] = ["H", "M", "L", "R"];
export type PenaltyTag = "ob" | "hazard" | "bunker";
/** 이 순서로 저장·표시한다 */
export const PENALTY_TAGS: readonly PenaltyTag[] = ["ob", "hazard", "bunker"];
export const PENALTY_LABEL: Record<PenaltyTag, string> = { ob: "OB", hazard: "해저드", bunker: "벙커" };
export const FAIRWAY_LABEL: Record<Fairway, string> = { H: "페어웨이", M: "러프", L: "왼쪽 러프", R: "오른쪽 러프" };

/** players JSON 에서 이 기록이 사는 칸 — 경기 응답에서 걷어 낼 때도 이 목록을 쓴다 */
export const HOLE_STAT_KEYS = ["putts", "fairway", "penaltyTags"] as const;

/** 한 사람의 18홀 기록(칸마다 18칸). 안 적은 홀은 null · [] */
export interface HoleStats {
    putts: (number | null)[];
    fairway: (Fairway | null)[];
    penaltyTags: PenaltyTag[][];
}
/** 한 홀 */
export interface HoleEntry {
    putts: number | null;
    fairway: Fairway | null;
    penaltyTags: PenaltyTag[];
}
/** 저장 요청의 한 홀 — holeNo 는 1~18. 그 홀을 통째로 이 값으로 바꾼다(덧셈이 아니라 교체라 두 번 보내도 같다) */
export interface HolePatch extends HoleEntry { holeNo: number }

export function blankHoleStats(): HoleStats {
    return {
        putts: new Array(HOLE_COUNT).fill(null),
        fairway: new Array(HOLE_COUNT).fill(null),
        penaltyTags: Array.from({ length: HOLE_COUNT }, () => []),
    };
}

export const isPutts = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_PUTTS;
export const isFairway = (v: unknown): v is Fairway => v === "H" || v === "M" || v === "L" || v === "R";
export const isPenaltyTag = (v: unknown): v is PenaltyTag => PENALTY_TAGS.includes(v as PenaltyTag);

/** 알려진 태그만, 중복 없이, 정해진 순서로 */
function canonicalTags(v: readonly unknown[]): PenaltyTag[] {
    return PENALTY_TAGS.filter((t) => v.includes(t));
}

/**
 * 저장된 칸을 읽는다 — 없거나(옛 경기) 모양이 틀린 칸은 빈 값으로. 손상된 JSON 한 칸 때문에 화면이 죽지 않게,
 * 틀린 **홀 하나**만 비우고 나머지는 살린다.
 */
export function readHoleStats(player: unknown): HoleStats {
    const p: any = player && typeof player === "object" ? player : {};
    const arr = (v: unknown): unknown[] | null => (Array.isArray(v) && v.length === HOLE_COUNT ? v : null);
    const putts = arr(p.putts), fairway = arr(p.fairway), tags = arr(p.penaltyTags);
    return {
        putts: Array.from({ length: HOLE_COUNT }, (_, i) => (putts && isPutts(putts[i]) ? (putts[i] as number) : null)),
        fairway: Array.from({ length: HOLE_COUNT }, (_, i) => (fairway && isFairway(fairway[i]) ? (fairway[i] as Fairway) : null)),
        penaltyTags: Array.from({ length: HOLE_COUNT }, (_, i) => (tags && Array.isArray(tags[i]) ? canonicalTags(tags[i] as unknown[]) : [])),
    };
}

/**
 * 서버가 받는 한 홀. 모양이 틀리면 null(그 요청 전체를 400 으로 돌린다 — 반쯤 저장하지 않는다).
 * 문자열 숫자('2')도 받지 않는다: 화면은 숫자만 보낸다. 태그는 알려진 것만 받고 중복은 하나로 친다.
 */
export function sanitizeHolePatch(v: unknown): HolePatch | null {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    if (!Number.isInteger(o.holeNo) || (o.holeNo as number) < 1 || (o.holeNo as number) > HOLE_COUNT) return null;
    const putts = o.putts == null ? null : isPutts(o.putts) ? (o.putts as number) : undefined;
    if (putts === undefined) return null;
    const fairway = o.fairway == null ? null : isFairway(o.fairway) ? (o.fairway as Fairway) : undefined;
    if (fairway === undefined) return null;
    const rawTags = o.penaltyTags == null ? [] : o.penaltyTags;
    if (!Array.isArray(rawTags) || rawTags.length > PENALTY_TAGS.length || !rawTags.every(isPenaltyTag)) return null;
    return { holeNo: o.holeNo as number, putts, fairway, penaltyTags: canonicalTags(rawTags) };
}

/** 요청 본문 전체 — 1~18개. 같은 홀이 두 번 오면 뒤의 것(화면은 마지막 값을 보낸다). 하나라도 틀리면 null. */
export function sanitizeHolePatches(v: unknown): HolePatch[] | null {
    if (!Array.isArray(v) || v.length < 1 || v.length > HOLE_COUNT) return null;
    const byHole = new Map<number, HolePatch>();
    for (const x of v) {
        const p = sanitizeHolePatch(x);
        if (!p) return null;
        byHole.set(p.holeNo, p);
    }
    return [...byHole.values()].sort((a, b) => a.holeNo - b.holeNo);
}

/** 고친 홀만 바꾼 새 기록(원본은 그대로) */
export function applyHolePatches(stats: HoleStats, patches: readonly HolePatch[]): HoleStats {
    const next: HoleStats = {
        putts: [...stats.putts],
        fairway: [...stats.fairway],
        penaltyTags: stats.penaltyTags.map((t) => [...t]),
    };
    for (const p of patches) {
        const i = p.holeNo - 1;
        if (i < 0 || i >= HOLE_COUNT) continue;
        next.putts[i] = p.putts;
        next.fairway[i] = p.fairway;
        next.penaltyTags[i] = [...p.penaltyTags];
    }
    return next;
}

export function holeEntry(stats: HoleStats, h: number): HoleEntry {
    return { putts: stats.putts[h] ?? null, fairway: stats.fairway[h] ?? null, penaltyTags: stats.penaltyTags[h] ?? [] };
}
export function hasHoleEntry(e: HoleEntry): boolean {
    return e.putts != null || e.fairway != null || e.penaltyTags.length > 0;
}
export function hasAnyHoleStats(stats: HoleStats): boolean {
    for (let h = 0; h < HOLE_COUNT; h++) if (hasHoleEntry(holeEntry(stats, h))) return true;
    return false;
}

/** 페어웨이 칸이 있는 홀 — 파4·파5. 파를 모르는 홀은 보여 준다(파3 일 수도 있지만 적는 건 사람이 고른다). */
export function fairwayApplies(par: number, parKnown: boolean): boolean {
    return !parKnown || par >= 4;
}

/** 퍼팅 수가 타수와 맞는가 — 티샷 한 번은 퍼팅이 아니니 퍼팅은 타수보다 적어야 한다. */
export function puttsFit(strokes: number, putts: number): boolean {
    return isValidStroke(strokes) && isPutts(putts) && putts <= strokes - 1;
}

/**
 * 그린 적중(GIR) — **타수 − 퍼팅 ≤ 파 − 2**(파3 1타·파4 2타·파5 3타 안에 그린에 올렸다). 입력받지 않고 계산한다.
 * 모르면 null: 퍼팅을 안 적었거나, 파를 모르거나(추정 파로 적중을 지어내지 않는다), 숫자가 안 맞을 때(퍼팅 ≥ 타수).
 * 칩인(퍼팅 0)도 식 그대로 — 파4 에서 3타 만에 그린 밖에서 넣었으면 3 > 2 라 적중이 아니고, 2타 만에 넣었으면 적중이다.
 */
export function greenInRegulation(strokes: number, putts: number | null | undefined, par: number, parKnown = true): boolean | null {
    if (putts == null || !parKnown || !puttsFit(strokes, putts)) return null;
    return strokes - putts <= par - 2;
}

/**
 * 경기 응답에서 이 기록을 걷어 낸다. 내 것은 GET /match/:id/hole-stats 로만 준다.
 * 왜: (1) 동반자 것은 남에게 보이지 않게(v1 은 '나만 보는 기록'), (2) 방장 폰은 경기 응답의 players 를 편집 원본으로
 * 붙들고 있다 — 거기 섞여 있으면 낡은 값이 화면에 되살아난다. 점수·벌타(penalties)·이름은 그대로 둔다.
 */
export function withoutHoleStats<T>(session: T): T {
    const s: any = session;
    if (!s || typeof s !== "object" || !Array.isArray(s.players)) return session;
    if (!s.players.some((p: any) => p && typeof p === "object" && HOLE_STAT_KEYS.some((k) => k in p))) return session;
    return {
        ...s,
        players: s.players.map((p: any) => {
            if (!p || typeof p !== "object" || !HOLE_STAT_KEYS.some((k) => k in p)) return p;
            const { putts: _p, fairway: _f, penaltyTags: _t, ...rest } = p;
            return rest;
        }),
    };
}

// ── 지난번 이 홀 ─────────────────────────────────────────────────────────────

/** 같은 골프장에서 내가 끝낸 옛 라운드 하나(최근 순으로 넘긴다) */
export interface PastRound {
    frontCourseName: string | null;
    backCourseName: string | null;
    /** 그 라운드의 **내** 타수 18칸 */
    scores: readonly unknown[] | null | undefined;
    playedAt: string | null;
}
export interface LastTime { strokes: number; playedAt: string | null }

const courseLabel = (s: unknown): string | null => (typeof s === "string" && s.trim() ? s.trim() : null);

/**
 * 지난번 이 홀 — 같은 골프장·같은 코스·같은 홀에서 가장 최근에 친 **내** 타수(18칸, 없으면 null).
 * 코스는 이름으로 맞춘다: 오늘 전반이 'Lake' 면 지난번에 Lake 를 후반에 쳤어도 Lake 3번 홀은 같은 홀이다(같은 반쪽을 먼저 본다).
 * 코스 이름이 없는 골프장(한 코스 18홀)은 이름 없는 반쪽끼리 홀 번호로만 맞춘다 — 이름이 있는 쪽과 섞으면 다른 홀이다.
 * past 는 최근 것이 앞. 그 홀을 안 친 라운드(중도에 끝냄)는 건너뛰고 그 전 라운드를 본다.
 */
export function lastTimeByHole(
    current: { frontCourseName: string | null; backCourseName: string | null },
    past: readonly PastRound[],
): (LastTime | null)[] {
    const out: (LastTime | null)[] = new Array(HOLE_COUNT).fill(null);
    const curNames = [courseLabel(current.frontCourseName), courseLabel(current.backCourseName)];
    for (let h = 0; h < HOLE_COUNT; h++) {
        const half = h < 9 ? 0 : 1;
        const name = curNames[half];
        const k = h % 9;
        for (const r of past) {
            const names = [courseLabel(r.frontCourseName), courseLabel(r.backCourseName)];
            const cands: number[] = [];
            if (name) {
                if (names[half] === name) cands.push(half * 9 + k);
                if (names[1 - half] === name) cands.push((1 - half) * 9 + k);
            } else if (names[half] === null) {
                cands.push(h);
            }
            const hit = cands.map((i) => Number(r.scores?.[i] ?? 0)).find(isValidStroke);
            if (hit) { out[h] = { strokes: hit, playedAt: r.playedAt ?? null }; break; }
        }
    }
    return out;
}

// ── 라운딩 리포트 통계 ────────────────────────────────────────────────────────

/** 기록이 있는 내 라운드 하나 — GET /golf/hole-stats/mine 의 한 줄 */
export interface RoundHoleData {
    sessionId: string;
    historyId?: string | null;
    playedAt?: string | null;
    scores: readonly number[];
    pars: readonly number[];
    parKnown: readonly boolean[];
    putts: readonly (number | null)[];
    fairway: readonly (Fairway | null)[];
    penaltyTags: readonly (readonly PenaltyTag[])[];
}

/** 라운드 한 판의 요약(기록 상세 스코어카드) */
export interface RoundHoleSummary {
    /** 맞게 적힌 홀의 퍼팅 합 · 그 홀 수 */
    putts: number;
    puttHoles: number;
    girHit: number;
    girHoles: number;
    /** 홀마다 그린 적중(모르면 null) */
    gir: (boolean | null)[];
    /** 홀마다 셀 수 있는 퍼팅(숫자가 안 맞으면 null) */
    countedPutts: (number | null)[];
}

export function roundHoleSummary(r: RoundHoleData): RoundHoleSummary {
    let putts = 0, puttHoles = 0, girHit = 0, girHoles = 0;
    const gir: (boolean | null)[] = [];
    const countedPutts: (number | null)[] = [];
    for (let h = 0; h < HOLE_COUNT; h++) {
        const s = Number(r.scores[h] ?? 0);
        const p = r.putts[h] ?? null;
        if (p != null && puttsFit(s, p)) {
            countedPutts.push(p);
            putts += p; puttHoles++;
        } else {
            countedPutts.push(null);
        }
        const g = greenInRegulation(s, p, Number(r.pars[h] ?? 4), !!r.parKnown[h]);
        gir.push(g);
        if (g !== null) { girHoles++; if (g) girHit++; }
    }
    return { putts, puttHoles, girHit, girHoles, gir, countedPutts };
}

export interface HoleStatsSummary {
    /** 이 홀 기록을 하나라도 적은 라운드 수 — '기록한 N라운드 기준' */
    rounds: number;
    /** 맞게 적힌 퍼팅만(퍼팅 ≥ 타수인 홀은 뺀다). perHole 홀당 · per18 18홀 환산 */
    putts: { holes: number; total: number; perHole: number; per18: number; threePutts: number } | null;
    /** 페어웨이가 있는 홀(파4·5, 파 모름)에 적은 것만. miss = 러프(옛 왼쪽·오른쪽 포함). rate 0~1 */
    fairway: { holes: number; hit: number; miss: number; left: number; right: number; rate: number } | null;
    /** 퍼팅을 적었고 파를 아는 홀만. rate 0~1 */
    gir: { holes: number; hit: number; rate: number } | null;
    /**
     * OB 태그가 붙은 홀 수(한 홀에 두 번 나도 태그는 하나라 1로 센다) · 기록한 라운드당.
     * 벌타 태그를 한 번도 안 쓴 사람은 null — 태그는 '없었다'와 '안 적었다'를 가를 수 없어서, 0 을 보여 주면 거짓이 된다.
     */
    ob: { total: number; perRound: number } | null;
}

/** 여러 라운드를 합친다. 적은 홀·라운드만으로 센다 — 안 적은 홀은 분모에도 넣지 않는다. */
export function summarizeHoleStats(rounds: readonly RoundHoleData[]): HoleStatsSummary {
    let recorded = 0;
    let puttHoles = 0, puttTotal = 0, threePutts = 0;
    let fwHoles = 0, fwHit = 0, fwLeft = 0, fwRight = 0;
    let girHoles = 0, girHit = 0;
    let obTotal = 0, tagsUsed = false;
    for (const r of rounds) {
        let any = false;
        for (let h = 0; h < HOLE_COUNT; h++) {
            const s = Number(r.scores[h] ?? 0);
            const par = Number(r.pars[h] ?? 4);
            const known = !!r.parKnown[h];
            const p = r.putts[h] ?? null;
            const fw = r.fairway[h] ?? null;
            const tags = r.penaltyTags[h] ?? [];
            if (p != null || fw != null || tags.length > 0) any = true;
            if (p != null && puttsFit(s, p)) {
                puttHoles++; puttTotal += p;
                if (p >= 3) threePutts++;
            }
            const g = greenInRegulation(s, p, par, known);
            if (g !== null) { girHoles++; if (g) girHit++; }
            if (fw != null && fairwayApplies(par, known)) {
                fwHoles++;
                if (fw === "H") fwHit++; else if (fw === "L") fwLeft++; else if (fw === "R") fwRight++;
            }
            if (tags.length > 0) tagsUsed = true;
            if (tags.includes("ob")) obTotal++;
        }
        if (any) recorded++;
    }
    return {
        rounds: recorded,
        putts: puttHoles > 0 ? { holes: puttHoles, total: puttTotal, perHole: puttTotal / puttHoles, per18: (puttTotal / puttHoles) * HOLE_COUNT, threePutts } : null,
        fairway: fwHoles > 0 ? { holes: fwHoles, hit: fwHit, miss: fwHoles - fwHit, left: fwLeft, right: fwRight, rate: fwHit / fwHoles } : null,
        gir: girHoles > 0 ? { holes: girHoles, hit: girHit, rate: girHit / girHoles } : null,
        ob: tagsUsed && recorded > 0 ? { total: obTotal, perRound: obTotal / recorded } : null,
    };
}
