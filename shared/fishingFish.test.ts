import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { FISH, FISH_BOOKS, fishById, fishByName, fishRecords, fishTier, fishValue, fishValueText, nearestPromotion } from "./fishingFish";

const c = (species: string, over: Record<string, unknown> = {}) => ({ species, day: "2026-10-12", lengthCm: null, count: 1, weightKg: null, ji: null, ...over }) as { species: string; day: string; lengthCm: number | null; count: number; weightKg: number | null; ji: number | null };

describe("어종", () => {
    it("이름표가 겹치지 않고, 단계는 낮은 것부터 오른다", () => {
        expect(new Set(FISH.map((f) => f.id)).size).toBe(FISH.length);
        expect(new Set(FISH.map((f) => f.name)).size).toBe(FISH.length);
        for (const f of FISH) {
            expect(f.tiers.length, f.name).toBeGreaterThan(1);
            for (let i = 1; i < f.tiers.length; i++) expect(f.tiers[i].min, f.name).toBeGreaterThan(f.tiers[i - 1].min);
        }
    });
    it("어탁첩 두 권이 모든 어종을 한 번씩 싣는다 · 어종마다 어탁 그림이 있다(한 장 60KB 아래)", () => {
        expect(FISH_BOOKS.flatMap((b) => b.fish.map((f) => f.id)).sort()).toEqual(FISH.map((f) => f.id).sort());
        for (const f of FISH) {
            const file = resolve(__dirname, `../client/public/fishing/art/gyotaku-${f.id}.webp`);
            expect(existsSync(file), f.name).toBe(true);
            expect(statSync(file).size, f.name).toBeLessThan(60_000);
        }
    });
    it("사람이 적은 이름으로 찾는다 — 띄어쓰기는 걷고, 목록에 없는 이름은 null", () => {
        expect(fishByName("감성돔")?.id).toBe("gamseongdom");
        expect(fishByName(" 무늬 오징어 ")?.id).toBe("munui");
        expect(fishByName("망둥어")).toBeNull();
        expect(fishById("bass")?.name).toBe("배스");
    });
});

describe("짜 — 단계와 승급", () => {
    const bungeo = fishById("bungeo")!, bass = fishById("bass")!, nongeo = fishById("nongeo")!;
    it("붕어: 30.3cm 가 월척이다(30cm 는 준척)", () => {
        expect(fishTier(bungeo, 30).tier?.name).toBe("준척");
        expect(fishTier(bungeo, 30.3).tier?.name).toBe("월척");
        expect(fishTier(bungeo, 41).tier?.name).toBe("4짜");
        expect(fishTier(bungeo, 26.9)).toMatchObject({ tier: null, index: -1, next: { name: "준척" }, gap: 0.1 });
    });
    it("배스 런커 50cm · 농어 따오기 80cm · 미터급 100cm", () => {
        expect(fishTier(bass, 49.5)).toMatchObject({ tier: { name: "4짜" }, next: { name: "런커" }, gap: 0.5 });
        expect(fishTier(bass, 50).tier?.name).toBe("런커");
        expect(fishTier(nongeo, 85).tier?.name).toBe("따오기");
        expect(fishTier(nongeo, 103)).toMatchObject({ tier: { name: "미터급" }, next: null, gap: null });
    });
    it("자랑하는 값은 어종마다 다르다 — 길이 · 마릿수 · 무게 · 지", () => {
        expect(fishValue(fishById("jukkumi")!, c("주꾸미", { count: 52, lengthCm: 12 }))).toBe(52);
        expect(fishValue(fishById("munui")!, c("무늬오징어", { weightKg: 1.2 }))).toBe(1.2);
        expect(fishValue(fishById("galchi")!, c("갈치", { ji: 4, lengthCm: 90 }))).toBe(4);
        expect(fishValue(bungeo, c("붕어"))).toBeNull();
        expect([fishValueText("cm", 31.46), fishValueText("count", 52), fishValueText("kg", 1.25), fishValueText("ji", 4)]).toEqual(["31.5cm", "52수", "1.3kg", "4지"]);
        expect(fishTier(fishById("jukkumi")!, 52).tier?.name).toBe("50수");
        expect(fishTier(fishById("munui")!, 1.2).tier?.name).toBe("킬로급");
    });
});

describe("내 기록어", () => {
    const list = [
        c("붕어", { lengthCm: 31, day: "2026-09-01" }),
        c("붕어", { lengthCm: 36.5, day: "2026-10-01" }),
        c("붕어", { day: "2026-08-01" }),
        c("배스", { lengthCm: 49.5 }),
        c("주꾸미", { count: 30 }),
        c("망둥어", { lengthCm: 15 }),
    ];
    it("어종마다 가장 큰 줄이 기록어 — 높은 단계부터, 목록에 없는 이름은 빠진다", () => {
        const r = fishRecords(list);
        expect(r.map((x) => [x.fish.name, x.value, x.tier?.name ?? null, x.catches, x.first])).toEqual([
            ["배스", 49.5, "4짜", 1, "2026-10-12"],
            ["붕어", 36.5, "월척", 3, "2026-08-01"],
            ["주꾸미", 30, "30수", 1, "2026-10-12"],
        ]);
        expect(r[1].best.day).toBe("2026-10-01");
    });
    it("단위가 다른 어종은 값이 아니라 오른 단계로 견준다 — 62수가 41.5cm 앞에 서지 않는다", () => {
        const r = fishRecords([c("주꾸미", { count: 62 }), c("붕어", { lengthCm: 41.5 }), c("감성돔", { lengthCm: 61 })]);
        // 감성돔 6짜(4칸 중 4칸) → 붕어 4짜(4칸 중 3칸) · 주꾸미 50수(4칸 중 3칸)는 같으니 길이 어종이 앞
        expect(r.map((x) => x.fish.name)).toEqual(["감성돔", "붕어", "주꾸미"]);
    });
    it("값을 적지 않은 어종도 만난 것으로 남는다(단계 없이)", () => {
        expect(fishRecords([c("감성돔")])[0]).toMatchObject({ value: null, tier: null, catches: 1 });
    });
    it("가장 가까운 승급 — 문턱에 견줘 가장 조금 남은 것", () => {
        const near = nearestPromotion(fishRecords(list))!;
        expect([near.fish.name, near.next?.name, near.gap]).toEqual(["배스", "런커", 0.5]);
        expect(nearestPromotion([])).toBeNull();
    });
});
