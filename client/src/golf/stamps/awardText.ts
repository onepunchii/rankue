/**
 * 받은 것의 이름 — "강원 볼마커" · "누구나 36 볼마커" · "트로피 10곳" · "트로피 전부" · "100 깨기 핀"(2026-10-12).
 * 순수 함수(화면 시험이 부른다). 이름표는 shared/golfStampAwards.
 */
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_OPEN_TOTAL, STAMP_TOTAL } from "@shared/golfStampBooks";
import { MARKER_TIER_NAME } from "@shared/golfStampDepth";
import { parseSeasonTagKey, parseSpecialKey } from "@shared/golfStampExtras";
import type { StampAwardKind } from "@shared/golfStampAwards";
import { golfPin } from "@shared/golfPins";

export function awardLabel(kind: StampAwardKind, key: string): string {
    if (kind === "book") return `${STAMP_BOOKS.find((b) => b.id === key)?.name ?? key} 볼마커`;
    if (kind === "all") return `누구나 ${STAMP_OPEN_TOTAL} 볼마커`;
    if (kind === "pin") return `${golfPin(key)?.name ?? "업적"} 핀`;
    if (kind === "black" || kind === "pearl") return `${key === STAMP_ALL_OPEN ? `누구나 ${STAMP_OPEN_TOTAL}` : STAMP_BOOKS.find((b) => b.id === key)?.name ?? key} 볼마커 · ${MARKER_TIER_NAME[kind]}`;
    if (kind === "tag") { const t = parseSeasonTagKey(key); return t ? `${t.year} 시즌 태그 · ${t.tier.name}` : "시즌 태그"; }
    if (kind === "special") { const m = parseSpecialKey(key); return m ? (m.year ? `${m.year} ${m.marker.name}` : `${m.marker.name} 볼마커`) : "한정 볼마커"; }
    return Number(key) >= STAMP_TOTAL ? "트로피 전부" : `트로피 ${key}곳`;
}
