/**
 * 어종 랭킹(2026-10-15 오너: "내가 공개여부 가능") — 조과마다 '랭킹에 올리기'를 켠 줄만 센다.
 * 어종이 자랑하는 값(길이 · 무게 · 지 · 마릿수)으로 사람마다 가장 좋은 한 줄. 내보내는 것은 이름 · 값 · 날 · 사진뿐 —
 * 잡은 곳 · 좌표 · 한마디는 내보내지 않는다(PocketFish 의 어종 · 크기 랭킹을 우리 규칙으로 옮김 — 코드는 옮기지 않았다).
 */
import type { FishUnit } from "./fishingFish.js";

export const RANK_LIMIT = 50;

export interface FishingRankRow {
    rank: number;
    name: string;
    value: number;
    day: string;
    thumbUrl: string | null;
    mine: boolean;
    /** 그 줄의 조과 · 올린 사람(2026-10-17) — 신고 · 차단 메뉴가 쓴다 */
    catchId: string | null;
    memberId: string;
}
export interface FishingRankBoard { species: string; unit: FishUnit; rows: FishingRankRow[] }
export interface FishingRankSpecies { species: string; people: number }

const COLUMN: Readonly<Record<FishUnit, "length_cm" | "weight_kg" | "ji" | "fish_count">> = { cm: "length_cm", kg: "weight_kg", ji: "ji", count: "fish_count" };
export const rankColumn = (unit: FishUnit) => COLUMN[unit];

export function rankRows(raw: readonly { id?: string | null; member_id: string; name: string | null; value: unknown; day: unknown; thumb_url: string | null }[], me: string | null): FishingRankRow[] {
    const rows = raw
        .map((r) => ({ id: String(r.member_id), catchId: r.id ? String(r.id) : null, name: (r.name ?? "").trim() || "낚시인", value: Number(r.value), day: String(r.day).slice(0, 10), thumbUrl: r.thumb_url ?? null }))
        .filter((r) => Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value || a.day.localeCompare(b.day));
    let prev = Number.NaN, rank = 0;
    return rows.slice(0, RANK_LIMIT).map((r, i) => {
        if (r.value !== prev) { rank = i + 1; prev = r.value; }
        return { rank, name: r.name, value: r.value, day: r.day, thumbUrl: r.thumbUrl, mine: me != null && r.id === me, catchId: r.catchId, memberId: r.id };
    });
}
