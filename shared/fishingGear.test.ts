import { describe, it, expect } from "vitest";
import { addLineChange, cleanGear, cleanLineChange, daysSince, LINE_LOG_MAX } from "./fishingGear";

describe("장비", () => {
    it("종류와 이름은 꼭, 나머지는 비워도 된다", () => {
        expect(cleanGear({ kind: "reel", name: "  스텔라  2500 ", brand: "" })).toEqual({ ok: true, value: { kind: "reel", name: "스텔라 2500", brand: null, spec: null, note: null } });
        expect(cleanGear({ kind: "boat", name: "x" }).ok).toBe(false);
        expect(cleanGear({ kind: "rod", name: " " }).ok).toBe(false);
    });
    it("줄 간 날 — 앞날은 안 되고, 비우면 오늘. 최근 것부터 서른 줄까지", () => {
        expect(cleanLineChange({}, "2026-10-15")).toEqual({ ok: true, value: { day: "2026-10-15", note: null } });
        expect(cleanLineChange({ day: "2026-10-16" }, "2026-10-15").ok).toBe(false);
        let log = addLineChange([], { day: "2026-09-01", note: null });
        log = addLineChange(log, { day: "2026-10-01", note: "PE 1호" });
        expect(log.map((l) => l.day)).toEqual(["2026-10-01", "2026-09-01"]);
        for (let i = 0; i < 40; i++) log = addLineChange(log, { day: "2026-08-01", note: null });
        expect(log).toHaveLength(LINE_LOG_MAX);
        expect(daysSince("2026-10-01", "2026-10-15")).toBe(14);
    });
});
