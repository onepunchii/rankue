import { describe, it, expect } from "vitest";
import { sportForPath } from "./sportRoute";

describe("sportForPath — 주소가 종목을 정한다(2026-09-21 검색 유입 섞임)", () => {
    it("골프 주소는 저장된 선호와 무관하게 골프", () => {
        for (const p of ["/golfer/kpga/123", "/golf-ranking", "/golf/ranking", "/golf/booking-list/9", "/golf/arcade?x=1", "/golf"]) {
            expect(sportForPath(p), p).toBe("GOLF");
        }
    });

    it("당구에만 있는 주소는 당구", () => {
        for (const p of ["/online-game?match=abc", "/pba", "/pba-player/M001", "/player/3c/42", "/stores", "/store/rankue", "/world-ranking", "/briefing/2026-09-21"]) {
            expect(sportForPath(p), p).toBe("BILLIARDS");
        }
    });

    it("두 종목이 함께 쓰는 화면은 정하지 않는다(null → 저장된 선호)", () => {
        for (const p of ["/", "/dashboard", "/menu", "/club/7", "/history", "/friends", "/ranking", "/community", "/settings"]) {
            expect(sportForPath(p), p).toBeNull();
        }
    });

    it("앞글자만 같은 다른 주소에 속지 않는다", () => {
        // "/golf" 로 시작하지만 골프가 아닌 주소가 생겨도 경계('/'·'?')로 구분한다
        expect(sportForPath("/golfish")).toBeNull();
        expect(sportForPath("/playerless")).toBeNull();
        expect(sportForPath("/storefront")).toBeNull();
    });
});
