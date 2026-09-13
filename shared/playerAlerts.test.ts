import { describe, it, expect } from "vitest";
import { rankChangeMessage } from "./playerAlerts";

describe("rankChangeMessage — 관심 선수 순위 변동", () => {
    it("순위가 그대로면 보내지 않는다", () => {
        expect(rankChangeMessage({ name: "김행직", rank: 14, prevRank: 14, points: 210 })).toBeNull();
    });
    it("상승은 📈 와 ▲", () => {
        const m = rankChangeMessage({ name: "김행직", rank: 12, prevRank: 14, points: 230 })!;
        expect(m.title).toBe("📈 김행직 세계 12위");
        expect(m.body).toBe("지난 회차 14위 → 12위 (▲2) · 230점");
    });
    it("하락은 📉 와 ▼", () => {
        const m = rankChangeMessage({ name: "허정한", rank: 15, prevRank: 12, points: 200 })!;
        expect(m.title).toBe("📉 허정한 세계 15위");
        expect(m.body).toContain("(▼3)");
    });
    it("1위가 되면 트로피", () => {
        const m = rankChangeMessage({ name: "조명우", rank: 1, prevRank: 2, points: 499 })!;
        expect(m.title).toBe("🏆 조명우 세계 1위!");
        expect(m.body).toBe("지난 회차 2위 → 1위 (▲1) · 499점");
    });
    it("처음 등재도 변동이다", () => {
        const m = rankChangeMessage({ name: "신인", rank: 820, prevRank: null, points: 4 })!;
        expect(m.title).toBe("🌍 신인 세계랭킹 진입");
        expect(m.body).toBe("세계 820위 · 4점");
    });
});
