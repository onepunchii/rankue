/**
 * 빈 조인 화면 → 같은 날 부킹 티타임(2026-11-04) — 새 골프 회원 74명이 첫날 '조인'을 눌렀는데 조인 글은 통틀어 0건이었다.
 * 화면 코드의 시험이지만 shared 에 둔다(소스를 읽어 지킨다).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("빈 조인 화면이 부킹으로 잇는다", () => {
    it("조인 보기에서만, 같은 날 · 같은 필터의 부킹 수(공식 사이트 남은 티 포함)를 날짜 띠와 같은 열쇠로", () => {
        const hook = read("client/src/golf/hooks/useBookingData.ts");
        expect(hook).toContain("enabled: hasDates && viewType === 'JOIN',");
        expect(hook).toContain("queryKey: ['/api/hiq/golf/bookings/counts', rangeStart, rangeEnd, 'BOOKING', JSON.stringify(selectedFilters)],");
    });
    it("수가 있을 때만 카드 · 누르면 부킹 보기로(직접 고른 것으로 친다 — 다시 조인으로 돌리지 않는다)", () => {
        const empty = read("client/src/golf/components/booking/EmptyResult.tsx");
        expect(empty).toContain("{isJoin && bookingSide > 0 && onShowBookings && (");
        expect(empty).toContain('data-track-as="golf-join-empty-bookings"');
        const list = read("client/src/golf/pages/BookingList.tsx");
        expect(list).toContain("onShowBookings={() => { userPickedView.current = true; setViewType('BOOKING'); }}");
    });
});
