import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireFor, fireGradeOf, fireHighShare, fireTimeIso, parseFire } from "./hikingFireRisk";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const row = (o: Record<string, unknown> = {}) => ({ analdate: "2026-10-17 15", area: "2,191", d1: 60, d2: 40, d3: 0, d4: 0, doname: "경기도", maxi: 61, meanavg: 51, sigun: "가평군", ...o });

describe("산불 위험", () => {
    it("분석 시각 · 줄 읽기 — 등급별 면적이 없으면 버린다", () => {
        expect(fireTimeIso("2026-10-17 15")).toBe("2026-10-17T06:00:00.000Z");
        expect(parseFire(row())).toMatchObject({ sido: "경기도", sigun: "가평군", mean: 51, max: 61, grade: "low" });
        expect(parseFire(row({ d1: 0, d2: 0, d3: 0, d4: 0 }))).toBeNull();
        expect(parseFire(row({ sigun: "" }))).toBeNull();
    });

    it("등급은 면적이 가장 넓은 것(같으면 센 쪽) · 높음 이상 비율", () => {
        expect(fireGradeOf({ low: 20, mid: 50, high: 30, very: 0 })).toBe("mid");
        expect(fireGradeOf({ low: 0, mid: 40, high: 40, very: 20 })).toBe("high");
        expect(fireGradeOf({ low: 10, mid: 10, high: 10, very: 70 })).toBe("very");
        expect(fireHighShare({ shares: { low: 70, mid: 20, high: 8, very: 2 } })).toBe(10);
    });

    it("산의 시군구로 — 시도가 같아야 · 띄어쓰기 무시 · '청주시 상당구'는 앞의 시로", () => {
        const list = [{ sido: "경기도", sigun: "가평군" }, { sido: "강원특별자치도", sigun: "고성군" }, { sido: "경상남도", sigun: "고성군" }, { sido: "충청북도", sigun: "청주시" }];
        expect(fireFor(list, { sido: "경기도", sigungu: "가평군" })).toEqual({ sido: "경기도", sigun: "가평군" });
        expect(fireFor(list, { sido: "경상남도", sigungu: "고성군" })).toEqual({ sido: "경상남도", sigun: "고성군" });
        expect(fireFor(list, { sido: "충청북도", sigungu: "청주시 상당구" })).toEqual({ sido: "충청북도", sigun: "청주시" });
        expect(fireFor(list, { sido: "경기도", sigungu: null })).toBeNull();
    });

    it("산 날씨 길이 산불 위험을 같이 싣는다 — 12시간 넘은 분석은 빼고", () => {
        const src = read("server/routes/modules/hiking.ts");
        expect(src).toContain("const fireHit = fires ? fireFor(fires, m) : null;");
        expect(src).toContain("Date.now() - Date.parse(fireHit.at) < 12 * 3600_000");
        expect(read("server/services/hikingFireRisk.ts")).toContain("forestPointV2/forestPointListSigunguSearchV2");
    });
});
