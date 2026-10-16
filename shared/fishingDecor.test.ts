import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { DECOR, DECOR_LIMITED, DECOR_SLOTS, SLOT_KIND, cleanLayout, decorHow, decorItem, decorProgress, resolveLayout, type DecorCatch } from "./fishingDecor";

const c = (o: Partial<DecorCatch> & { species: string; day: string }): DecorCatch => ({ spot: null, released: false, photo: false, tripId: null, ...o });

describe("수족관 장식 목록", () => {
    it("스물네 점 · id 가 겹치지 않고 그림이 있다", () => {
        expect(DECOR).toHaveLength(24);
        expect(new Set(DECOR.map((d) => d.id)).size).toBe(24);
        for (const d of DECOR) {
            expect(fs.existsSync(`client/public/fishing/decor/${d.id}.webp`), d.id).toBe(true);
            expect(fs.existsSync(`client/public/fishing/decor/s/${d.id}.webp`), d.id).toBe(true);
            expect(decorHow(d).length).toBeGreaterThan(3);
        }
    });
    it("칸마다 놓을 것이 있다 · 한정은 금 닻 하나(99)", () => {
        for (const slot of DECOR_SLOTS) expect(DECOR.some((d) => d.kind === SLOT_KIND[slot]), slot).toBe(true);
        expect(DECOR.filter((d) => d.limit).map((d) => [d.id, d.limit])).toEqual([["goldanchor", DECOR_LIMITED]]);
    });
});

describe("decorProgress — 조과 기록으로만 열린다", () => {
    it("기록이 없으면 고운 모래만", () => {
        const p = decorProgress([]);
        expect(DECOR.filter((d) => p[d.id].done).map((d) => d.id)).toEqual(["floor-sand"]);
    });
    it("첫 조과 → 잘피, 갈치 → 달밤, 무늬오징어 → 집어등", () => {
        const p = decorProgress([c({ species: "갈치", day: "2026-10-01", spot: "boat" }), c({ species: "무늬오징어", day: "2026-10-02" })]);
        expect(p.seagrass.done).toBe(true);
        expect(p["bg-moon"].done).toBe(true);
        expect(p.lamp.done).toBe(true);
        expect(p.boat).toEqual({ cur: 1, need: 3, done: false });
    });
    it("출조 날은 같은 날을 한 번만 센다 · 자리마다 따로", () => {
        const list = [1, 1, 2, 3].map((d) => c({ species: "감성돔", day: `2026-10-0${d}`, spot: "rock" }));
        const p = decorProgress(list);
        expect(p.trap.cur).toBe(3);
        expect(p["floor-ledge"].done).toBe(true);
        expect(p["floor-pebble"].cur).toBe(0);
    });
    it("민물은 어종으로 — 모르는 어종은 자리로", () => {
        const p = decorProgress([c({ species: "붕어", day: "2026-09-01", spot: "pay" }), c({ species: "피라미", day: "2026-09-02", spot: "river" })]);
        expect(p.reed.done).toBe(true);
        expect(p["floor-mud"].cur).toBe(2);
        expect(p.lotus.cur).toBe(1);
    });
    it("한 해의 어종은 해마다 따로 센다", () => {
        const names = ["감성돔", "참돔", "돌돔", "벵에돔", "우럭", "광어", "농어", "볼락", "고등어", "부시리", "삼치", "갈치", "주꾸미", "갑오징어", "문어"];
        const split = names.map((n, i) => c({ species: n, day: `${i < 8 ? 2025 : 2026}-05-01` }));
        expect(decorProgress(split).goldanchor.done).toBe(false);
        expect(decorProgress(split).wreck.done).toBe(true);
        const one = names.map((n) => c({ species: n, day: "2026-05-01" }));
        expect(decorProgress(one).goldanchor.done).toBe(true);
    });
    it("정출 · 사진 · 방류 · 낙관", () => {
        const list = [
            ...[1, 2, 3].map((i) => c({ species: "우럭", day: `2026-08-0${i}`, tripId: `t${i}`, photo: true, released: true })),
            c({ species: "감성돔", day: "2026-08-09", lengthCm: 42 }),
        ];
        const p = decorProgress(list);
        expect(p.crewbuoy.done).toBe(true);
        expect(p.frame.cur).toBe(3);
        expect(p.shell.cur).toBe(3);
        expect(p.float.done).toBe(true);
    });
});

describe("자리", () => {
    const owned = new Set(["floor-sand", "seagrass", "kelp", "rock", "lamp", "bg-moon"]);
    it("받은 것 · 칸에 맞는 것만, 두 칸에 같은 것은 없다", () => {
        expect(cleanLayout({ left: "kelp", right: "kelp", center: "wreck", prop: "seagrass", bg: "", floor: 3 }, owned)).toEqual({ left: "kelp", bg: "" });
        expect(cleanLayout("x", owned)).toEqual({});
    });
    it("알아서 — 가운데부터 어려운 것, 비움은 비운다", () => {
        expect(resolveLayout({}, owned)).toEqual({ bg: "bg-moon", floor: "floor-sand", center: "kelp", left: "rock", right: "seagrass", prop: "lamp" });
        expect(resolveLayout({ center: "seagrass", prop: "" }, owned)).toEqual({ bg: "bg-moon", floor: "floor-sand", center: "seagrass", left: "kelp", right: "rock", prop: null });
    });
    it("decorItem", () => {
        expect(decorItem("lighthouse")?.name).toBe("등대");
        expect(decorItem("nope")).toBeNull();
    });
});
