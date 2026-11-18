import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VISIT_STRIP_DAYS, buildVisitStrip, visitCellLabel, visitStripSince } from "./memberVisitDays";

/**
 * 2026-11-18 오너: "어드민에 회원에 이거 있으면 좋겠네 — 언제언제 들어왔는지"(30칸 띠 그림을 보내며)
 * → 회원 상세 창 '활동' 아래 '최근 30일 · N일 접속' 띠. 여기는 칸을 세는 셈과 조회만 한다는 뼈대를 고정한다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("띠의 기간", () => {
    it("오늘을 마지막 칸으로 30칸 — 한국 날짜로 센다", () => {
        // 한국 11/18 00:30 = UTC 11/17 15:30
        const { sinceIso, fromDay } = visitStripSince(new Date("2026-11-17T15:30:00Z"));
        expect(fromDay).toBe("2026-10-20");
        expect(sinceIso).toBe("2026-10-19T15:00:00.000Z");
        const strip = buildVisitStrip([], fromDay);
        expect(strip.cells).toHaveLength(VISIT_STRIP_DAYS);
        expect(strip.cells[0].day).toBe("2026-10-20");
        expect(strip.cells[VISIT_STRIP_DAYS - 1].day).toBe("2026-11-18");
    });
});

describe("칸 채우기", () => {
    const fromDay = "2026-10-20";

    it("들어온 날만 칠하고 날 수 · 마지막 날을 센다", () => {
        const strip = buildVisitStrip([{ day: "2026-11-12", n: 3 }, { day: "2026-11-18", n: 1 }], fromDay);
        expect(strip.activeDays).toBe(2);
        expect(strip.lastDay).toBe("2026-11-18");
        expect(strip.cells.filter((c) => c.n > 0).map((c) => c.day)).toEqual(["2026-11-12", "2026-11-18"]);
        expect(strip.cells.find((c) => c.day === "2026-11-12")?.n).toBe(3);
    });

    it("하루도 안 들어왔으면 전부 빈 칸", () => {
        const strip = buildVisitStrip([], fromDay);
        expect(strip.activeDays).toBe(0);
        expect(strip.lastDay).toBeNull();
    });

    it("기간 밖의 날 · 이상한 글자는 버린다", () => {
        const strip = buildVisitStrip([{ day: "2026-10-01", n: 5 }, { day: "어제", n: 2 }, { day: "2026-11-01", n: 0 }], fromDay);
        expect(strip.activeDays).toBe(0);
    });

    it("가입 전의 날은 따로 표시한다 — 가입한 날부터는 빈 칸", () => {
        const strip = buildVisitStrip([{ day: "2026-11-10", n: 1 }], fromDay, "2026-11-10");
        expect(strip.cells.find((c) => c.day === "2026-11-09")?.before).toBe(true);
        expect(strip.cells.find((c) => c.day === "2026-11-10")?.before).toBe(false);
        expect(strip.cells.find((c) => c.day === "2026-11-11")?.before).toBe(false);
    });
});

describe("칸 설명", () => {
    it("날짜 · 요일 · 횟수", () => {
        expect(visitCellLabel({ day: "2026-11-12", n: 3, before: false })).toBe("11월 12일(목) · 3번");
        expect(visitCellLabel({ day: "2026-11-13", n: 0, before: false })).toBe("11월 13일(금) · 안 들어옴");
        expect(visitCellLabel({ day: "2026-11-01", n: 0, before: true })).toBe("11월 1일(일) · 가입 전");
    });
});

describe("뼈대", () => {
    it("주소는 조회(GET)뿐이고 회원 id 꼴을 먼저 본다", () => {
        const routes = root("server/routes/modules/admin.ts");
        const at = routes.indexOf('router.get("/members/:id/visit-days"');
        expect(at).toBeGreaterThan(-1);
        expect(routes.slice(at, at + 400)).toContain("MEMBER_ID_RE.test(req.params.id)");
        expect(routes).not.toMatch(/router\.(post|put|patch|delete)\("\/members\/:id\/visit-days"/);
    });

    it("회원 상세 창이 띠를 그린다", () => {
        const sheet = root("client/src/pages/admin/MemberDetailSheet.tsx");
        expect(sheet).toContain("<VisitStripCard");
        expect(sheet).toContain("memberVisitDaysKey");
    });
});
