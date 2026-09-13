/**
 * 다시보기 목록의 고르기 규칙(2026-09-13 오너: "3구·4구 나누고, 고수 리플 보는 탭이 어때?").
 *
 * '고수' 를 레이팅으로 고르지 않는다 — 보고 싶은 것은 **그 경기의 내용**이다. 초보가 우연히 잘 친 판도
 * 올라오는 편이 커뮤니티에 낫다. 그래서 순위는 경기 안에서만 뽑는다: 하이런 · 에버리지 · 접전.
 *
 * 단위는 전부 **캐롬**이다(4구 1캐롬 = 10점). 점수로 섞으면 4구가 언제나 이긴다.
 *
 * shared/sim 밖에 둔다 — 그 폴더는 엔진이라 Date 를 금지한다(결정론). 여기는 목록을 고르는 규칙이고 시간을 본다.
 */
import { caromsOf } from "./sim/handicap.js";
import type { GameType } from "./sim/rules/types.js";

export type WatchSort = "recent" | "highRun" | "best";

/** 목록 한 줄에서 순위를 뽑는 데 필요한 것만. */
export interface RankableMatch {
    readonly gameType: GameType;
    readonly scores: readonly number[];
    readonly targets: readonly number[];
    readonly highRuns?: readonly number[];
    readonly innings: number;
    readonly finishedAt?: string | null;
    readonly startedAt?: string | null;
}

export interface Highlights {
    /** 그 경기 최고 연속 득점(캐롬) */
    readonly highRun: number;
    /** 이긴 쪽 기준 에버리지(캐롬/이닝) */
    readonly avg: number;
    /** 0~1. 두 사람이 각자 목표에 얼마나 비슷하게 다가갔나 — 1 이면 끝까지 붙었다 */
    readonly closeness: number;
    /** 명경기 점수(0~1 근처). 셋을 섞는다 — 큰 런 > 잘 친 판 > 접전 순으로 무게를 준다. */
    readonly score: number;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** 그 종목에서 "아주 잘 친" 에버리지 기준(캐롬/이닝). 이 값이면 만점으로 본다. */
const GREAT_AVG: Record<GameType, number> = { "3c": 1.0, "4c": 1.5 };

export function highlightsOf(m: RankableMatch): Highlights {
    const caroms = (v: number) => caromsOf(v, m.gameType);
    const highRun = Math.max(0, ...(m.highRuns ?? []).map(caroms));
    const innings = Math.max(1, m.innings);
    const progress = m.scores.map((s, i) => {
        const target = caroms(m.targets[i] ?? m.targets[0] ?? 0);
        return target > 0 ? clamp01(caroms(s) / target) : 0;
    });
    const bestIdx = progress.indexOf(Math.max(...progress, 0));
    const avg = caroms(m.scores[bestIdx] ?? 0) / innings;

    // 접전: 둘이 목표에 다가간 정도의 차이. 20점 대 5점(다마수가 다르면 비율로) 같은 판은 접전이 아니다.
    const closeness = progress.length >= 2 ? clamp01(1 - Math.abs(progress[0] - progress[1])) : 0;
    // 하이런은 목표 대비로 본다 — 20점 경기의 8연속과 200점 경기의 8연속은 다르다.
    const target0 = caroms(m.targets[0] ?? 0) || 1;
    const runScore = clamp01(highRun / target0);
    const avgScore = clamp01(avg / GREAT_AVG[m.gameType]);
    return {
        highRun,
        avg,
        closeness,
        score: runScore * 0.45 + avgScore * 0.35 + closeness * 0.2,
    };
}

const at = (m: RankableMatch): number => {
    const t = Date.parse(m.finishedAt ?? m.startedAt ?? "");
    return Number.isFinite(t) ? t : 0;
};

/** 정렬. 같은 값이면 최근 것이 위로 — 목록이 흔들리지 않게 항상 끝을 시간으로 맺는다. */
export function sortWatch<T extends RankableMatch>(rows: readonly T[], mode: WatchSort): T[] {
    const keyed = rows.map((m) => ({ m, h: highlightsOf(m), t: at(m) }));
    const by = mode === "highRun" ? (x: typeof keyed[number]) => x.h.highRun
        : mode === "best" ? (x: typeof keyed[number]) => x.h.score
            : null;
    keyed.sort((a, b) => (by ? by(b) - by(a) || b.t - a.t : b.t - a.t));
    return keyed.map((x) => x.m);
}
