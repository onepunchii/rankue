/**
 * 해법 찾기 — 지금 배치에서 득점이 되는 샷을 결정론 엔진(simulateShot + evaluateShot)으로 찾는 순수 탐색.
 *
 * DOM·React·시각·Math.random 없음. 워커와 테스트가 같은 코드를 돌린다. 시각은 opts.now 로 주입하고(없으면 performance.now),
 * 무작위성은 shared/sim/rng 의 mulberry32(seed) 로만 쓴다(시드가 같으면 같은 순서 → 같은 결과).
 * 결정론 규칙(dmath)은 shared/sim 안에서만 적용된다 — 여기서는 입력을 만들 뿐이라 Math.* 를 자유롭게 쓴다.
 *
 * 탐색 단계
 *  1. seed  — 그럴듯한 조준(적구별 두께 {1, .85, .7, .55, .4, .25, .15} × 좌/우, 쿠션 4면 × 6점 뱅크) × (세기 5 × 당점 9) 격자.
 *             세기·당점 조합은 "그럴듯한 순서"(무회전·2.8 m/s 부터, 극단은 뒤로)로 정렬하고 조합마다 조준을 시드 셔플 순으로 돈다.
 *             예산에 잘려도 앞쪽 조합은 모든 조준을 다 본다.
 *  2. sweep — 예산이 남으면 같은 조합 순서로 360° 를 0.5° 간격(셔플)으로 전수 탐색. 엔진이 샷당 0.03–0.1 ms 라
 *             1.5 s 예산 안에 대부분 돈다(두께 격자가 놓치는 좁은 창을 잡는다).
 *  3. refine — 점수 상위 5개 해법 가족의 대표 샷 주변을 phi ±0.25°/±0.5°, V0 ±0.2 m/s 격자(14개)로 다시 돌려
 *             더 좋은 이웃을 대표로 삼고, 이웃 성공률을 "오차 허용(robustness)" 으로 잰다.
 *
 * 해법 가족: 당점이 같고 |ΔV0| ≤ 0.35 m/s, |Δphi| ≤ 1.5° 인 득점 샷은 같은 해법으로 묶는다(대표 = 기본 점수 최고).
 * 결과는 가족 대표만 돌려주므로 서로 다른 후보는 서로 다른 샷이다.
 *
 * 점수(높을수록 좋음, 기본 점수는 시뮬레이션 1회로 계산)
 *   + 1.0 × 쿠션 여유     3쿠션: (min(쿠션, 5) − 3)/2 → 3개 0, 4개 0.5, 5개 1. 4구: 쿠션이 득점 조건이 아니라 0
 *                          (threeCushionDouble 규칙이면 3쿠션 이상 득점에 1 — 2배 점수).
 *   + 1.0 × 안전(포지션)   큐볼 최종 위치에서 가장 가까운 적구까지 거리 d 가 0.3–1.2 m 면 1, 0.1 m·2.0 m 에서 0 으로 선형 감소.
 *   + 1.0 × 쉬움(세기)     V0 1.6 m/s → 1, 4.5 m/s → 0 (선형). 느린 샷이 치기 쉽다.
 *   + 0.5 × 쉬움(당점)     1 − |(a,b)|/maxOffset. 중앙 당점이 재현하기 쉽다.
 *   − 0.5 × min(키스, 2)   첫 적구 뒤의 공–공 접촉(쫑·키스)은 재현이 어렵다.
 *   + 2.0 × 오차 허용      refine 단계에서 잰 이웃 성공률(0..1). 안 잰 가족은 0 (상위 5개만 잰다).
 */
import type { BallState, CushionId, ShotInput, SimResult } from "@shared/sim/types";
import type { SimParams, TableSpec } from "@shared/sim/params";
import { simulateShot } from "@shared/sim/simulate";
import { evaluateShot, objectBallIds } from "@shared/sim/rules/evaluate";
import { squirtAngle } from "@shared/sim/resolve/stickBall";
import type { GameType, Rules, ShotOutcome } from "@shared/sim/rules/types";
import { mulberry32 } from "@shared/sim/rng";
import { firstContact, normalizeAngle, phiForThickness, type XY } from "../aim";

/* ------------------------------------------------------------------ 타입 */

export interface SolveRequest {
    readonly balls: readonly BallState[];
    readonly cueBallId: string;
    readonly gameType: GameType;
    readonly rules: Rules;
    readonly params: SimParams;
    /** 벽시계 예산(ms). 없으면 계획을 전부 돈다. seed+sweep 은 예산의 90 %, refine 은 나머지. */
    readonly budgetMs?: number;
    /** 시뮬레이션 횟수 상한. 없으면 계획 전체. refine 몫(최대 70회)을 남기고 seed+sweep 을 멈춘다. */
    readonly maxSimulations?: number;
    /** 돌려줄 후보 수. 기본 5. */
    readonly maxCandidates?: number;
    /** 셔플 시드(mulberry32). 같은 시드 → 같은 결과. */
    readonly seed: number;
    /** 개시 샷(3쿠션): 첫 접촉이 빨간 공이 아닌 후보는 파울이라 득점으로 치지 않는다(session.isOpeningShot). */
    readonly opening?: boolean;
}

/** 직선 조준 기준 첫 접촉 — 화면 라벨용("빨간 공 ½ 우", "뱅크 먼저"). */
export type AimLabel =
    | { readonly kind: "ball"; readonly id: string; readonly thickness: number; readonly side: "left" | "right" | "center" }
    | { readonly kind: "bank"; readonly cushion: CushionId }
    | { readonly kind: "none" };

/** 점수 분해(가중치 적용 후 기여분). 합이 score. */
export interface ScoreTerms {
    readonly cushion: number;
    readonly safety: number;
    readonly ease: number;
    readonly spin: number;
    readonly kiss: number;
    readonly robust: number;
}

export interface SolveCandidate {
    readonly input: ShotInput;
    readonly outcome: ShotOutcome;
    /** 전체 SimResult — 화면이 buildPreviewPaths 로 경로를 그린다. */
    readonly result: SimResult;
    /** 최종 점수(기본 점수 + 오차 허용). 후보는 이 값 내림차순. */
    readonly score: number;
    /** 이 샷이 몇 번째 시뮬레이션이었나(1부터). */
    readonly tried: number;
    readonly aim: AimLabel;
    /** refine 에서 잰 이웃 성공률 0..1. 안 쟀으면 null. */
    readonly robustness: number | null;
    readonly terms: ScoreTerms;
}

export type SearchPhase = "seed" | "sweep" | "refine" | "done";

export interface SolveProgress {
    readonly tried: number;
    /** 득점 샷 수(가족 병합 전). */
    readonly found: number;
    readonly phase: SearchPhase;
}

export interface SolveResult {
    readonly candidates: readonly SolveCandidate[];
    readonly tried: number;
    readonly found: number;
    readonly elapsedMs: number;
    /** 취소로 멈췄으면 true(부분 결과). */
    readonly aborted: boolean;
    /** 예산·상한에 걸리지 않고 계획을 전부 돌았으면 true. */
    readonly exhausted: boolean;
}

export interface SearchOptions {
    /** 시각(ms). 기본 performance.now. 테스트는 고정값이나 가짜 시계를 준다. */
    readonly now?: () => number;
}

export interface ShotSearch {
    /** 최대 maxSims 회 시뮬레이션. 끝났으면 true. */
    step(maxSims?: number): boolean;
    progress(): SolveProgress;
    /** 지금까지의 결과(정렬·가족 대표·상한 적용). 끝나기 전에 불러도 된다. */
    result(opts?: { readonly aborted?: boolean }): SolveResult;
}

/* ------------------------------------------------------------------ 격자·상수 */

export const THICKNESS_SEEDS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15] as const;
export const SPEED_GRID = [1.6, 2.2, 2.8, 3.5, 4.5] as const;
export const SPIN_GRID: readonly (readonly [number, number])[] = [
    [0, 0], [0.3, 0], [-0.3, 0], [0.3, 0.25], [-0.3, 0.25], [0, 0.3], [0, -0.3], [0.15, -0.3], [-0.15, -0.3],
];
export const BANK_POINTS_PER_CUSHION = 6;
export const SWEEP_STEP_DEG = 0.5;
export const REFINE_TOP = 5;
/**
 * 정제·후보 목록에서 "적구 먼저" 가족에 남겨 두는 최소 자리(2026-09-08 실측: 무작위 배치의 득점 길은 85 % 가 뱅크 먼저라
 * 점수·여유만으로 줄 세우면 목록이 전부 뱅크가 된다. 실제 경기는 적구 먼저가 대부분이라 그 길도 보여 준다).
 */
export const BALL_FIRST_SLOTS = 2;
export const REFINE_PHI_DEG = [-0.5, -0.25, 0, 0.25, 0.5] as const;
export const REFINE_DV = [-0.2, 0, 0.2] as const;
/** 가족 판정 폭. */
export const FAMILY_PHI_DEG = 1.5;
export const FAMILY_DV = 0.35;
/** 예산 중 seed+sweep 몫. */
const SEARCH_SHARE = 0.9;

export const WEIGHTS = { cushion: 1.0, safety: 1.0, ease: 1.0, spin: 0.5, kiss: 0.5, robust: 2.0 } as const;

const DEG = Math.PI / 180;
/** 미스큐 경계 안쪽 여유(simReducer.clampSpin 과 같은 뜻). */
const SPIN_EPS = 1e-9;

/** 세기 선호 순서(그럴듯한 것부터). */
const SPEED_PREFERENCE: readonly number[] = [2.8, 3.5, 2.2, 4.5, 1.6];
const SPEED_RANK: readonly number[] = [0, 1, 1, 2, 3]; // SPEED_PREFERENCE 순서의 등급
/** SPIN_GRID 인덱스별 등급: 무회전 0, 옆 1, 옆+위 2, 위/아래 2, 옆+아래 3. */
const SPIN_RANK: readonly number[] = [0, 1, 1, 2, 2, 2, 2, 3, 3];

interface Combo {
    readonly V0: number;
    readonly a: number;
    readonly b: number;
}

/** (세기 × 당점) 조합을 등급 오름차순으로. 등급이 같으면 당점 등급 → 세기 선호 순. 결정론적. */
export function orderedCombos(maxOffset: number): readonly Combo[] {
    const list: { combo: Combo; key: readonly [number, number, number, number] }[] = [];
    for (let si = 0; si < SPEED_PREFERENCE.length; si++) {
        const V0 = SPEED_PREFERENCE[si];
        for (let pi = 0; pi < SPIN_GRID.length; pi++) {
            const [a, b] = clampOffset(SPIN_GRID[pi][0], SPIN_GRID[pi][1], maxOffset);
            list.push({ combo: { V0, a, b }, key: [SPEED_RANK[si] + SPIN_RANK[pi], SPIN_RANK[pi], si, pi] });
        }
    }
    list.sort((x, y) => {
        for (let k = 0; k < 4; k++) if (x.key[k] !== y.key[k]) return x.key[k] - y.key[k];
        return 0;
    });
    return list.map((x) => x.combo);
}

/** 당점을 미스큐 원(maxOffset·R) 안으로 — 밖이면 같은 방향으로 원 위까지. */
export function clampOffset(a: number, b: number, maxOffset: number): readonly [number, number] {
    const max = maxOffset - SPIN_EPS;
    const len = Math.sqrt(a * a + b * b);
    if (len <= max) return [a, b];
    const f = max / len;
    return [a * f, b * f];
}

/* ------------------------------------------------------------------ 조준 시드 */

export interface AimSeed {
    readonly phi: number;
    readonly kind: "ball" | "bank";
    /** ball 이면 목표 공 id, bank 면 쿠션 id. */
    readonly target: string;
}

/** 조준 대상 적구: 규칙의 objectBallIds 중 배치에 있는 것. 하나도 없으면(id 규약 밖) 큐볼 외 전부. */
export function aimTargets(balls: readonly BallState[], cueBallId: string, gameType: GameType): readonly BallState[] {
    const ids = objectBallIds(gameType, cueBallId);
    const found = balls.filter((b) => ids.includes(b.id));
    return found.length > 0 ? found : balls.filter((b) => b.id !== cueBallId);
}

/**
 * 적구 두께 시드 + 뱅크 시드(결정론적 순서: 적구 순 → 두께 순 → 좌/우, 쿠션 left/right/bottom/top → 6점).
 * 다른 공에 가려진 조준(직선 첫 접촉이 목표가 아닌 공)은 버린다. 정면(1)은 좌/우가 같아 한 번만.
 */
export function buildSeeds(balls: readonly BallState[], cueBallId: string, gameType: GameType, table: TableSpec): { ball: AimSeed[]; bank: AimSeed[] } {
    const cue = balls.find((b) => b.id === cueBallId);
    if (!cue) throw new RangeError(`solver: unknown cue ball id ${cueBallId}`);
    const R = table.ball.R;
    const cxy: XY = [cue.r[0], cue.r[1]];
    const seen = new Set<number>();
    const ball: AimSeed[] = [];
    const bank: AimSeed[] = [];
    const push = (out: AimSeed[], phi: number, kind: AimSeed["kind"], target: string) => {
        const key = Math.round(normalizeAngle(phi) * 1e4);
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ phi: normalizeAngle(phi), kind, target });
    };

    for (const target of aimTargets(balls, cueBallId, gameType)) {
        const txy: XY = [target.r[0], target.r[1]];
        for (const th of THICKNESS_SEEDS) {
            for (const side of ["left", "right"] as const) {
                if (th === 1 && side === "right") continue;
                const phi = phiForThickness(cxy, txy, th, side, R);
                const fc = firstContact(cue, balls, phi, table);
                if (!fc || fc.kind !== "ball" || fc.id !== target.id) continue;
                push(ball, phi, "ball", target.id);
            }
        }
    }

    const W = table.width, L = table.length;
    const cushions: readonly { id: CushionId; at: (f: number) => XY }[] = [
        { id: "left", at: (f) => [R, R + (L - 2 * R) * f] },
        { id: "right", at: (f) => [W - R, R + (L - 2 * R) * f] },
        { id: "bottom", at: (f) => [R + (W - 2 * R) * f, R] },
        { id: "top", at: (f) => [R + (W - 2 * R) * f, L - R] },
    ];
    for (const c of cushions) {
        for (let i = 0; i < BANK_POINTS_PER_CUSHION; i++) {
            const p = c.at((i + 0.5) / BANK_POINTS_PER_CUSHION);
            const phi = Math.atan2(p[1] - cxy[1], p[0] - cxy[0]);
            const fc = firstContact(cue, balls, phi, table);
            if (!fc || fc.kind !== "cushion") continue; // 공에 가려지면 공 시드·sweep 가 맡는다
            push(bank, phi, "bank", c.id);
        }
    }
    return { ball, bank };
}

/** 직선 조준 라벨. */
export function aimLabelFor(balls: readonly BallState[], cueBallId: string, phi: number, table: TableSpec): AimLabel {
    const cue = balls.find((b) => b.id === cueBallId);
    if (!cue) return { kind: "none" };
    const fc = firstContact(cue, balls, phi, table);
    if (!fc) return { kind: "none" };
    if (fc.kind === "ball") return { kind: "ball", id: fc.id, thickness: fc.thickness, side: fc.side };
    return { kind: "bank", cushion: fc.cushion };
}

/* ------------------------------------------------------------------ 점수 */

/** 안전(포지션) 0..1 — 큐볼 최종 위치에서 가장 가까운 적구까지 d. */
export function safetyFor(d: number): number {
    if (!(d > 0.1)) return 0;
    if (d < 0.3) return (d - 0.1) / 0.2;
    if (d <= 1.2) return 1;
    if (d < 2.0) return 1 - (d - 1.2) / 0.8;
    return 0;
}

/** 쿠션 여유 0..1. */
export function cushionMarginFor(outcome: ShotOutcome, rules: Rules): number {
    const c = outcome.cushionsBeforeSecond;
    if (rules.gameType === "3c") return (Math.min(c, 5) - 3) / 2;
    return rules.threeCushionDouble && c >= 3 ? 1 : 0;
}

/** 쉬움(세기) 0..1: 격자 최저 1.6 → 1, 최고 4.5 → 0. */
export function easeFor(V0: number): number {
    const lo = SPEED_GRID[0], hi = SPEED_GRID[SPEED_GRID.length - 1];
    return Math.max(0, Math.min(1, 1 - (V0 - lo) / (hi - lo)));
}

export function scoreTerms(input: ShotInput, outcome: ShotOutcome, result: SimResult, req: SolveRequest, robustness: number | null): ScoreTerms {
    const cue = result.final.find((b) => b.id === req.cueBallId);
    let d = Infinity;
    if (cue) {
        for (const id of objectBallIds(req.gameType, req.cueBallId)) {
            const o = result.final.find((b) => b.id === id);
            if (!o) continue;
            d = Math.min(d, Math.hypot(o.r[0] - cue.r[0], o.r[1] - cue.r[1]));
        }
    }
    const spinLen = Math.sqrt(input.a * input.a + input.b * input.b) / req.params.cue.maxOffset;
    return {
        cushion: WEIGHTS.cushion * cushionMarginFor(outcome, req.rules),
        safety: WEIGHTS.safety * (Number.isFinite(d) ? safetyFor(d) : 0),
        ease: WEIGHTS.ease * easeFor(input.V0),
        spin: WEIGHTS.spin * Math.max(0, 1 - spinLen),
        kiss: -WEIGHTS.kiss * Math.min(outcome.kisses, 2),
        robust: WEIGHTS.robust * (robustness ?? 0),
    };
}

export function sumTerms(t: ScoreTerms): number {
    return t.cushion + t.safety + t.ease + t.spin + t.kiss + t.robust;
}

/* ------------------------------------------------------------------ 탐색기 */

interface Member {
    readonly input: ShotInput;
    readonly outcome: ShotOutcome;
    readonly result: SimResult;
    readonly base: number;
    readonly terms: ScoreTerms;
    readonly tried: number;
}

interface Family {
    readonly a: number;
    readonly b: number;
    /** 대표(기본 점수 최고). */
    best: Member;
    /** refine 이웃 통계(대표 주변). */
    neighbours: number;
    neighboursScored: number;
    refined: boolean;
}

interface RefineTrial {
    readonly family: Family;
    readonly input: ShotInput;
}

function angleDiff(x: number, y: number): number {
    let d = Math.abs(normalizeAngle(x) - normalizeAngle(y));
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
}

function defaultNow(): () => number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return () => performance.now();
    return () => Date.now();
}

/** 시드 셔플(Fisher–Yates, mulberry32). 입력은 바꾸지 않는다. */
export function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
}

export function createShotSearch(req: SolveRequest, opts: SearchOptions = {}): ShotSearch {
    const now = opts.now ?? defaultNow();
    const { balls, cueBallId, params, rules } = req;
    if (!balls.some((b) => b.id === cueBallId)) throw new RangeError(`solver: unknown cue ball id ${cueBallId}`);
    const table = params.table;
    const rnd = mulberry32(req.seed);

    const combos = orderedCombos(params.cue.maxOffset);
    const seedsBuilt = buildSeeds(balls, cueBallId, req.gameType, table);
    const seeds: readonly AimSeed[] = [...shuffled(seedsBuilt.ball, rnd), ...shuffled(seedsBuilt.bank, rnd)];
    const sweepN = Math.round(360 / SWEEP_STEP_DEG);
    const sweepOrder = shuffled(Array.from({ length: sweepN }, (_, i) => i), rnd);

    const seedTotal = combos.length * seeds.length;
    const sweepTotal = combos.length * sweepN;
    const triedKeys = new Set<string>();

    const budget = req.budgetMs !== undefined && Number.isFinite(req.budgetMs) ? Math.max(0, req.budgetMs) : Infinity;
    const maxSims = req.maxSimulations !== undefined && Number.isFinite(req.maxSimulations) ? Math.max(0, Math.floor(req.maxSimulations)) : Infinity;
    const refineReserve = Number.isFinite(maxSims)
        ? Math.min(REFINE_TOP * (REFINE_PHI_DEG.length * REFINE_DV.length - 1), Math.floor(maxSims * 0.25))
        : 0;
    const searchSimCap = Number.isFinite(maxSims) ? maxSims - refineReserve : Infinity;
    const t0 = now();
    const searchDeadline = Number.isFinite(budget) ? t0 + budget * SEARCH_SHARE : Infinity;
    const hardDeadline = Number.isFinite(budget) ? t0 + budget : Infinity;

    let phase: SearchPhase = "seed";
    let seedIdx = 0;
    let sweepIdx = 0;
    let refineList: RefineTrial[] = [];
    let refineIdx = 0;
    let tried = 0;
    let found = 0;
    let exhausted = false;
    const families: Family[] = [];

    const trialKey = (comboIdx: number, phi: number) => `${comboIdx}|${Math.round(normalizeAngle(phi) / (0.05 * DEG))}`;

    function record(input: ShotInput, forced: Family | null): void {
        const result = simulateShot(balls, input, params);
        tried++;
        const outcome = evaluateShot(result.events, cueBallId, rules, result.truncated, { opening: req.opening });
        if (forced) forced.neighbours++;
        if (!outcome.scored) return;
        found++;
        if (forced) forced.neighboursScored++;
        const terms = scoreTerms(input, outcome, result, req, null);
        const member: Member = { input, outcome, result, base: sumTerms(terms), terms, tried };
        let family = forced;
        if (!family) {
            for (const f of families) {
                if (f.a !== input.a || f.b !== input.b) continue;
                if (Math.abs(f.best.input.V0 - input.V0) > FAMILY_DV) continue;
                if (angleDiff(f.best.input.phi, input.phi) > FAMILY_PHI_DEG * DEG) continue;
                family = f;
                break;
            }
        }
        if (!family) {
            families.push({ a: input.a, b: input.b, best: member, neighbours: 0, neighboursScored: 0, refined: false });
            return;
        }
        if (member.base > family.best.base || (member.base === family.best.base && member.tried < family.best.tried)) family.best = member;
    }

    function rankedFamilies(): Family[] {
        return families.slice().sort((x, y) => (y.best.base - x.best.base) || (x.best.tried - y.best.tried));
    }
    /** 이 가족의 대표 샷이 적구를 먼저 맞히는가(라벨과 같은 기준: 큐 방향 + 스쿼트). */
    function isBallFirst(f: Family): boolean {
        return aimLabelFor(balls, cueBallId, f.best.input.phi + squirtAngle(f.best.input.a, params.cue.endmassRatio), table).kind === "ball";
    }
    /** 상위 n 가족 + 적구 먼저 가족 최소 BALL_FIRST_SLOTS(있을 때만). 순서는 기본 점수. */
    function pickFamilies(n: number): Family[] {
        const ranked = rankedFamilies();
        const picked = ranked.slice(0, n);
        const ballFirst = ranked.filter(isBallFirst);
        for (const f of ballFirst.slice(0, BALL_FIRST_SLOTS)) {
            if (picked.includes(f)) continue;
            if (picked.length >= n && picked.length > 0) picked.pop();   // 맨 뒤(뱅크) 하나를 내리고 적구 먼저를 넣는다
            picked.push(f);
        }
        return picked.sort((x, y) => (y.best.base - x.best.base) || (x.best.tried - y.best.tried));
    }

    function toRefine(): void {
        phase = "refine";
        refineList = [];
        refineIdx = 0;
        for (const f of pickFamilies(REFINE_TOP)) {
            f.refined = true;
            const c = f.best.input;
            for (const dphi of REFINE_PHI_DEG) {
                for (const dv of REFINE_DV) {
                    if (dphi === 0 && dv === 0) continue;
                    // V0 는 0.01 격자로 반올림(2.8 − 0.2 = 2.5999… 같은 부동소수 찌꺼기가 화면·입력에 남지 않게)
                    const V0 = Math.round((c.V0 + dv) * 100) / 100;
                    refineList.push({ family: f, input: { ...c, phi: normalizeAngle(c.phi + dphi * DEG), V0 } });
                }
            }
        }
    }

    const searchLimitHit = () => tried >= searchSimCap || now() >= searchDeadline;
    const hardLimitHit = () => tried >= maxSims || now() >= hardDeadline;

    /** 시뮬레이션 하나를 수행. 더 할 일이 없으면 false. */
    function next(): boolean {
        for (;;) {
            switch (phase) {
                case "seed": {
                    if (searchLimitHit()) { toRefine(); continue; }
                    if (seedIdx >= seedTotal) { phase = "sweep"; continue; }
                    const i = seedIdx++;
                    const comboIdx = Math.floor(i / Math.max(1, seeds.length));
                    if (seeds.length === 0) { phase = "sweep"; continue; }
                    const combo = combos[comboIdx];
                    const seed = seeds[i % seeds.length];
                    const key = trialKey(comboIdx, seed.phi);
                    if (triedKeys.has(key)) continue;
                    triedKeys.add(key);
                    record({ cueBallId, phi: seed.phi, V0: combo.V0, a: combo.a, b: combo.b, theta: 0 }, null);
                    return true;
                }
                case "sweep": {
                    if (searchLimitHit()) { toRefine(); continue; }
                    if (sweepIdx >= sweepTotal) { exhausted = true; toRefine(); continue; }
                    const j = sweepIdx++;
                    const comboIdx = Math.floor(j / sweepN);
                    const combo = combos[comboIdx];
                    const phi = normalizeAngle(sweepOrder[j % sweepN] * SWEEP_STEP_DEG * DEG);
                    const key = trialKey(comboIdx, phi);
                    if (triedKeys.has(key)) continue;
                    triedKeys.add(key);
                    record({ cueBallId, phi, V0: combo.V0, a: combo.a, b: combo.b, theta: 0 }, null);
                    return true;
                }
                case "refine": {
                    if (refineIdx >= refineList.length) { phase = "done"; return false; }
                    if (hardLimitHit()) { exhausted = false; phase = "done"; return false; }
                    const r = refineList[refineIdx++];
                    record(r.input, r.family);
                    return true;
                }
                case "done":
                    return false;
            }
        }
    }

    return {
        step(maxSims = 200): boolean {
            for (let k = 0; k < maxSims; k++) {
                if (!next()) return true;
            }
            return phase === "done";
        },
        progress(): SolveProgress {
            return { tried, found, phase };
        },
        result(o = {}): SolveResult {
            const maxCandidates = req.maxCandidates ?? 5;
            const scored = families.map((f) => {
                const robustness = f.refined && f.neighbours > 0 ? f.neighboursScored / f.neighbours : null;
                const terms = { ...f.best.terms, robust: WEIGHTS.robust * (robustness ?? 0) };
                const cand: SolveCandidate = {
                    input: f.best.input, outcome: f.best.outcome, result: f.best.result,
                    score: sumTerms(terms), tried: f.best.tried,
                    // 라벨은 공이 실제 출발하는 방향(큐 방향 + 스쿼트)으로 — 옆당점 후보의 "½ 우" 가 미리보기와 맞는다
                    aim: aimLabelFor(balls, cueBallId, f.best.input.phi + squirtAngle(f.best.input.a, params.cue.endmassRatio), table),
                    robustness, terms,
                };
                return cand;
            });
            scored.sort((x, y) => (y.score - x.score) || (x.tried - y.tried));
            // 적구 먼저 후보에 최소 BALL_FIRST_SLOTS 자리(있을 때만) — 정제를 받은 것부터(여유가 있어야 화면이 줄 세울 수 있다)
            const top = scored.slice(0, Math.max(0, maxCandidates));
            const ballFirst = scored.filter((x) => x.aim.kind === "ball")
                .sort((x, y) => (Number(y.robustness !== null) - Number(x.robustness !== null)) || (y.score - x.score) || (x.tried - y.tried));
            for (const c of ballFirst.slice(0, BALL_FIRST_SLOTS)) {
                if (top.includes(c)) continue;
                if (top.length >= maxCandidates && top.length > 0) top.pop();
                top.push(c);
            }
            top.sort((x, y) => (y.score - x.score) || (x.tried - y.tried));
            return {
                candidates: top,
                tried, found,
                elapsedMs: Math.max(0, now() - t0),
                aborted: !!o.aborted,
                exhausted: exhausted && phase === "done" && !o.aborted,
            };
        },
    };
}

/** 한 번에 끝까지(워커 밖·테스트용). */
export function searchShots(req: SolveRequest, opts: SearchOptions = {}): SolveResult {
    const s = createShotSearch(req, opts);
    while (!s.step(500)) { /* 계속 */ }
    return s.result();
}
