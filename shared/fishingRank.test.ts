import { describe, it, expect } from "vitest";
import { rankColumn, rankRows, RANK_LIMIT } from "./fishingRank";

describe("어종 랭킹", () => {
    it("값 순 · 같은 값은 같은 순위 · 먼저 잡은 사람이 위", () => {
        const rows = rankRows([
            { member_id: "a", name: "갑", value: 52.5, day: "2026-10-10", thumb_url: null },
            { member_id: "b", name: "을", value: 60, day: "2026-10-11", thumb_url: "t.jpg" },
            { member_id: "c", name: " ", value: 52.5, day: "2026-10-09", thumb_url: null },
            { member_id: "d", name: "정", value: 0, day: "2026-10-09", thumb_url: null },
        ], "a");
        expect(rows.map((r) => [r.rank, r.name, r.value, r.mine])).toEqual([[1, "을", 60, false], [2, "낚시인", 52.5, false], [2, "갑", 52.5, true]]);
    });
    it("쉰 줄까지 · 값의 칸은 어종의 단위로만", () => {
        const many = Array.from({ length: 80 }, (_, i) => ({ member_id: String(i), name: `n${i}`, value: i + 1, day: "2026-10-01", thumb_url: null }));
        expect(rankRows(many, null)).toHaveLength(RANK_LIMIT);
        expect([rankColumn("cm"), rankColumn("kg"), rankColumn("ji"), rankColumn("count")]).toEqual(["length_cm", "weight_kg", "ji", "fish_count"]);
    });
});
