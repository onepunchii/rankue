/**
 * 실전(오프라인 점수판) 등급 — **한 가지 식**(2026-10-12 오너: "오프라인 점수판에도 해당 배찌및 등급을 적극 검토해줘" → "추천대로").
 *
 * 실전 등급 = **그 종목의 내 다마**(서버가 최근 공식 10경기로 매긴 값, shared/realHandicap 의 표).
 * 예전에는 화면마다 식이 달랐다: 친구 · 크루 · 검색 · 메뉴는 4구 다마로(3쿠션만 치는 사람도), 기록 페이지는 누적 에버리지로 4단계만.
 * 같은 사람이 화면마다 다른 등급으로 나왔고, 3쿠션은 자동 다마 표의 최고가 30인데 다이아 35 · 마스터 45 라 그 둘이 나올 수 없었다.
 *
 * 구간(오너 결정 2026-10-12)
 *  - 3쿠션: 브론즈 12·15 / 실버 18 / 골드 20 / 플래티넘 23 / 다이아 25 / **마스터 30**(자동 다마 표를 늘리지 않는다 — 표의 맨 위가 마스터).
 *  - 4구: 브론즈 3~10 / 실버 12·15 / 골드 20·25 / 플래티넘 30 / 다이아 40 / 마스터 50(예전 구간 그대로).
 * 다마가 없으면(공식 5판 전) **등급도 없다** — 예전처럼 브론즈로 치지 않는다.
 *
 * 이름은 온라인 대전 등급과 같은 말(브론즈~마스터)을 쓰고 앞에 '실전'을 붙여 부른다(오너 결정). 그림은 다르다:
 * 실전 = 둥근 '다마 메달'(가운데에 다마수), 온라인 = 방패. 아이언은 온라인에만 있다.
 *
 * ⚠️ 여기 숫자는 **다마 표(HANDICAP_MAP_3C · HANDICAP_MAP_4C)의 눈금**이다(3쿠션 12~30 · 4구 3~50). "150다마" 같은 큰 눈금이 아니다.
 *    표를 바꾸면 이 구간과 서버의 RP 감점 구간(game.repo)을 같이 본다.
 */
import { HANDICAP_MAP_3C, HANDICAP_MAP_4C } from "./realHandicap.js";

export type RealGame = "3c" | "4c";
export type RealTierId = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";

export interface RealTier {
    readonly id: RealTierId;
    /** 이 등급이 시작되는 다마 */
    readonly min: number;
    /** 등급 이름의 사전 키 — 온라인 대전 등급과 같은 말을 쓴다(sim.rank.tier.*). 화면은 앞에 '실전'을 붙인다 */
    readonly nameKey: string;
}

const tier = (id: RealTierId, min: number): RealTier => ({ id, min, nameKey: `sim.rank.tier.${id}` });

/** 낮은 등급부터. min 은 오름차순 */
export const REAL_TIERS: Readonly<Record<RealGame, readonly RealTier[]>> = {
    "3c": [tier("bronze", 0), tier("silver", 18), tier("gold", 20), tier("platinum", 23), tier("diamond", 25), tier("master", 30)],
    "4c": [tier("bronze", 0), tier("silver", 12), tier("gold", 20), tier("platinum", 30), tier("diamond", 40), tier("master", 50)],
};

export const REAL_TIER_IDS: readonly RealTierId[] = ["bronze", "silver", "gold", "platinum", "diamond", "master"];

/** 다마 → 등급. 다마가 없으면(null · 0 이하 · 숫자가 아님) 등급도 없다 */
export function realTierFor(handi: number | null | undefined, game: RealGame): RealTier | null {
    if (typeof handi !== "number" || !Number.isFinite(handi) || handi <= 0) return null;
    let out = REAL_TIERS[game][0];
    for (const t of REAL_TIERS[game]) if (handi >= t.min) out = t;
    return out;
}

/** 등급의 높낮이(브론즈 0 … 마스터 5) */
export const realTierRank = (id: RealTierId): number => REAL_TIER_IDS.indexOf(id);

export interface RealTierPick { tier: RealTier; game: RealGame; handi: number }

/**
 * 한 사람을 한 줄로 보여 줄 때(친구 · 크루 · 검색)의 등급 — 두 종목 가운데 **높은 쪽 하나**. 같으면 3쿠션.
 * 온라인 대전 등급을 사진 옆에 붙일 때와 같은 규칙이다(높은 쪽 하나). 다마가 하나도 없으면 null.
 */
export function bestRealTier(m: { handi3c?: number | null; handi4c?: number | null } | null | undefined): RealTierPick | null {
    if (!m) return null;
    const picks: RealTierPick[] = [];
    for (const game of ["3c", "4c"] as const) {
        const handi = game === "3c" ? m.handi3c : m.handi4c;
        const t = realTierFor(handi, game);
        if (t) picks.push({ tier: t, game, handi: handi as number });
    }
    if (picks.length === 0) return null;
    return picks.sort((a, b) => realTierRank(b.tier.id) - realTierRank(a.tier.id))[0];
}

/** 다마 표의 값들(낮은 것부터) — 시험이 "표의 모든 값에 등급이 있고, 표의 맨 위가 마스터"를 지킨다 */
export const realHandiSteps = (game: RealGame): number[] =>
    (game === "4c" ? HANDICAP_MAP_4C : HANDICAP_MAP_3C).map((s) => s.handi).sort((a, b) => a - b);

/** 다마가 올랐나 — 경기 끝의 "다마가 올랐어요". 처음 매겨진 것(옛 값 없음 → 새 값)은 '올랐다'가 아니라 '생겼다'다 */
export function handiChangeKind(oldHandi: number | null | undefined, newHandi: number | null | undefined): "first" | "up" | "down" | "same" {
    const o = typeof oldHandi === "number" && oldHandi > 0 ? oldHandi : 0;
    const n = typeof newHandi === "number" && newHandi > 0 ? newHandi : 0;
    if (n === 0 || n === o) return "same";
    if (o === 0) return "first";
    return n > o ? "up" : "down";
}
