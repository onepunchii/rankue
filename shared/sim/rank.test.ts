import { describe, it, expect } from "vitest";
import { PLACEMENT_MATCHES, TIERS, isPlaced, nextTier, rankStatus, tierFor } from "./rank";

describe("rank tiers", () => {
    it("티어 경계: 최소 레이팅에서 그 티어, 바로 아래는 이전 티어", () => {
        expect(TIERS.map((t) => t.min).slice(1)).toEqual([950, 1050, 1150, 1250, 1350, 1450]);
        expect(tierFor(0).id).toBe("iron");
        expect(tierFor(949).id).toBe("iron");
        expect(tierFor(950).id).toBe("bronze");
        expect(tierFor(1000).id).toBe("bronze");
        expect(tierFor(1149).id).toBe("silver");
        expect(tierFor(1150).id).toBe("gold");
        expect(tierFor(1450).id).toBe("master");
        expect(tierFor(2000).id).toBe("master");
        expect(nextTier(1000)!.id).toBe("silver");
        expect(nextTier(1450)).toBeNull();
    });
    it("배치 3판 · 상태", () => {
        expect(PLACEMENT_MATCHES).toBe(3);
        expect(isPlaced(2)).toBe(false);
        expect(isPlaced(3)).toBe(true);
        expect(rankStatus(1000, 1)).toEqual({ placed: false, tier: null, toNext: null, placementLeft: 2 });
        expect(rankStatus(1000, 3)).toMatchObject({ placed: true, toNext: 50, placementLeft: 0 });
        expect(rankStatus(1000, 3).tier!.id).toBe("bronze");
        expect(rankStatus(1500, 10)).toMatchObject({ placed: true, toNext: null });
    });
});
