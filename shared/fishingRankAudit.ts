/**
 * 낚시 랭킹 점검(2026-10-17 어드민 › 낚시 › 랭킹 점검 — "400cm · 999마리 · 300kg 까지 통과한다").
 * 어종의 크기는 지어 쓰지 않는다 — 기준은 이미 있는 단계(shared/fishingFish 의 '짜' · 수 · 킬로 · 지, 낚시계의 관행)뿐이다.
 * 맨 위 단계를 훨씬 넘는 값은 '다시 볼 것'으로 표시만 한다(판정이 아니다 — 대문어처럼 정말 큰 것도 있다). 순수 함수.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { fishByName, type FishUnit } from "./fishingFish.js";

/** 맨 위 단계의 몇 배를 넘으면 다시 볼까 — 길이 · 지는 1.6배, 마릿수 · 무게는 3배(마릿수 · 무게는 퍼짐이 크다) */
export const RANK_REVIEW_FACTOR: Readonly<Record<FishUnit, number>> = { cm: 1.6, ji: 1.6, count: 3, kg: 3 };

export function rankReview(species: string, value: number | null): { text: string } | null {
    const fish = fishByName(species);
    if (!fish || value == null || !Number.isFinite(value) || !fish.tiers.length) return null;
    const top = fish.tiers[fish.tiers.length - 1];
    const limit = top.min * RANK_REVIEW_FACTOR[fish.unit];
    if (value <= limit) return null;
    return { text: `맨 위 단계(${top.name})의 ${Math.round((value / top.min) * 10) / 10}배 — 잘못 적었을 수 있어요` };
}

/** 운영자가 랭킹에서 뺀 기록 */
export interface RankVoid { at: string; reason: string; by: string }

/** GET /admin/fishing/ranking 의 한 줄 — 사람마다 가장 좋은 한 줄(뺀 것도 표시해서) */
export interface AdminRankRow {
    catchId: string; memberId: string; name: string; value: number; day: string; place: string; thumbUrl: string | null;
    review: { text: string } | null; voided: RankVoid | null; hidden: boolean;
}
export interface AdminRankBoard { species: string; unit: FishUnit; rows: AdminRankRow[] }
/** 어종 칩 — 공개 조과가 있는 어종 · 다시 볼 줄 수 */
export interface AdminRankSpecies { species: string; people: number; review: number }
