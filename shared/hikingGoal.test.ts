import { describe, it, expect } from "vitest";
import { cleanGoal, everestNote, goalRows } from "./hikingGoal";

describe("올해의 목표", () => {
    it("올해 · 내년만, 비운 칸은 목표가 아니다, 범위 밖은 거절", () => {
        expect(cleanGoal({ climbs: "12", heightM: "", kfs: 10 }, 2026)).toEqual({ ok: true, value: { year: 2026, climbs: 12, heightM: null, kfs: 10 } });
        expect(cleanGoal({ year: 2025, climbs: 1 }, 2026).ok).toBe(false);
        expect(cleanGoal({ kfs: 101 }, 2026).ok).toBe(false);
        expect(cleanGoal({ climbs: 0 }, 2026).ok).toBe(false);
        expect(cleanGoal({ year: 2027 }, 2026)).toMatchObject({ ok: true, value: { year: 2027, climbs: null } });
    });
    it("진행 — 정한 목표만, 100%에서 멈춘다", () => {
        const rows = goalRows({ year: 2026, climbs: 10, heightM: null, kfs: 5 }, { climbs: 4, heightSum: 3000, kfs: 7 });
        expect(rows.map((r) => [r.key, r.have, r.want, r.pct])).toEqual([["climbs", 4, 10, 40], ["kfs", 7, 5, 100]]);
        expect(goalRows(null, { climbs: 1, heightSum: 1, kfs: 1 })).toEqual([]);
    });
    it("에베레스트와 견주기", () => {
        expect(everestNote(4424)).toBe("에베레스트(8,849m)의 49%만큼 올랐어요");
        expect(everestNote(17698)).toBe("에베레스트(8,849m)를 2.0번 오른 높이예요");
        expect(everestNote(0)).toBe("");
    });
});
