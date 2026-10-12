/**
 * 받은 것의 이름 — "강원 볼마커" · "누구나 36 볼마커" · "트로피 10곳" · "트로피 전부"(2026-10-12).
 * 순수 함수(화면 시험이 부른다). 이름표는 shared/golfStampAwards.
 */
import { STAMP_BOOKS, STAMP_OPEN_TOTAL, STAMP_TOTAL } from "@shared/golfStampBooks";
import type { StampAwardKind } from "@shared/golfStampAwards";

export function awardLabel(kind: StampAwardKind, key: string): string {
    if (kind === "book") return `${STAMP_BOOKS.find((b) => b.id === key)?.name ?? key} 볼마커`;
    if (kind === "all") return `누구나 ${STAMP_OPEN_TOTAL} 볼마커`;
    return Number(key) >= STAMP_TOTAL ? "트로피 전부" : `트로피 ${key}곳`;
}
