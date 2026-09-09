import { describe, it, expect } from "vitest";
import { DRILLS, drillLayout, drillsForWeek, weekIdFor, findDrill, DRILLS_PER_WEEK } from "./drills.js";
import { TABLES } from "./params.js";
import { isValidLayout } from "./layouts.js";

describe("드릴 배치", () => {
    it("모든 드릴이 두 테이블에서 유효한 배치(안쪽·겹침 없음)", () => {
        for (const t of Object.values(TABLES)) {
            for (const d of DRILLS) expect(isValidLayout(drillLayout(d, t), t), `${d.id} @ ${t.id}`).toBe(true);
        }
    });
    it("id 고유", () => {
        expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
        expect(findDrill("back1")?.pattern).toBe("back-around");
    });
});

describe("ISO 주차", () => {
    it("알려진 날짜", () => {
        expect(weekIdFor(Date.UTC(2026, 8, 7))).toBe("2026-W37");   // 2026-09-07 월요일
        expect(weekIdFor(Date.UTC(2026, 8, 6, 23, 59))).toBe("2026-W36"); // 일요일 밤
        expect(weekIdFor(Date.UTC(2021, 0, 3))).toBe("2020-W53");   // 2021-01-03 은 2020년 53주
        expect(weekIdFor(Date.UTC(2024, 11, 30))).toBe("2025-W01");  // 2024-12-30 은 2025년 1주
        expect(weekIdFor(Date.UTC(1970, 0, 1))).toBe("1970-W01");
    });
});

describe("주간 드릴 선택", () => {
    it("같은 주면 같은 5개, 다른 주면 다를 수 있음, 중복 없음", () => {
        const a = drillsForWeek("2026-W37"), b = drillsForWeek("2026-W37"), c = drillsForWeek("2026-W38");
        expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
        expect(a.length).toBe(DRILLS_PER_WEEK);
        expect(new Set(a.map((d) => d.id)).size).toBe(DRILLS_PER_WEEK);
        const differs = a.some((d, i) => d.id !== c[i].id);
        expect(differs).toBe(true);
    });
});

const LEGACY_W37 = ["side1", "back1", "short1", "reverse1", "grand1"];

describe("난이도 섞어 뽑기 (BALANCED_FROM_WEEK 이후)", () => {
    it("이번 주 이전 주차는 옛 방식 그대로 — 이미 친 주의 문제가 바뀌면 안 된다", () => {
        // 옛 방식이 이번 주(2026-W37)에 내놓던 그대로 — 이 배열이 바뀌면 진행 중인 래더가 깨진다
        expect(drillsForWeek("2026-W37").map((d) => d.id)).toEqual(LEGACY_W37);
    });
    it("적용 주차부터는 5문제가 쉬움~어려움에 하나씩 걸린다", () => {
        const easeOrder = [...DRILLS].sort((a, b) => a.easeMargin - b.easeMargin || (a.id < b.id ? -1 : 1));
        const bucketOf = (id: string) => Math.floor((easeOrder.findIndex((d) => d.id === id) * DRILLS_PER_WEEK) / DRILLS.length);
        for (const w of ["2026-W38", "2026-W39", "2026-W40", "2026-W52", "2027-W01", "2027-W26"]) {
            const got = drillsForWeek(w);
            expect(got.length, w).toBe(DRILLS_PER_WEEK);
            expect(new Set(got.map((d) => d.id)).size, w).toBe(DRILLS_PER_WEEK);
            expect(new Set(got.map((d) => bucketOf(d.id))), w).toEqual(new Set([0, 1, 2, 3, 4]));
        }
    });
    it("같은 주면 같은 결과", () => {
        expect(drillsForWeek("2026-W40").map((d) => d.id)).toEqual(drillsForWeek("2026-W40").map((d) => d.id));
    });
});
