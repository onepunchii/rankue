import { describe, it, expect } from "vitest";
import { aquariumFish, TANK_MAX } from "./fishingAquarium";

describe("수조", () => {
    it("어종마다 한 마리 · 많이 잡은 어종이 크고 앞에 · 같은 어종은 늘 같은 색", () => {
        const fish = aquariumFish([{ species: "갈치", count: 12 }, { species: "참돔", count: 1 }, { species: "갈치", count: 3 }, { species: " ", count: 1 }]);
        expect(fish.map((f) => [f.species, f.count])).toEqual([["갈치", 15], ["참돔", 1]]);
        expect(fish[0].size).toBeGreaterThan(fish[1].size);
        expect(aquariumFish([{ species: "참돔", count: 1 }])[0].color).toBe(fish[1].color);
    });
    it("열두 종까지, 비었으면 빈 수조", () => {
        expect(aquariumFish(Array.from({ length: 20 }, (_, i) => ({ species: `어종${i}`, count: 1 })))).toHaveLength(TANK_MAX);
        expect(aquariumFish([])).toEqual([]);
    });
});
