import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SLOPE_LABEL, SLOPE_STEEP, SLOPE_VERY, altitudeTicks, compareCourses, courseLevel, courseSlopes, kmTicks, slopeClasses, slopeRuns } from "./hikingCourseLook";
import type { LinePoint } from "./hikingGeo";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** 20m 마다 한 점 — 기울기(오른 높이/간 거리)의 차례대로 이어 붙인 길 */
function lineOf(parts: [km: number, grade: number][]): LinePoint[] {
    const out: LinePoint[] = [[37, 127, 300, 0]];
    for (const [km, grade] of parts) {
        const n = Math.round(km / 0.02);
        for (let i = 0; i < n; i++) { const p = out[out.length - 1]; out.push([37, 127, p[2] + 20 * grade, Math.round((p[3] + 0.02) * 1000) / 1000]); }
    }
    return out;
}

describe("코스를 보여 주는 셈", () => {
    it("힘든 정도 — 걷는 시간(어림)과 오르막으로", () => {
        expect(courseLevel({ km: 3.2, gainM: 250 }).id).toBe("easy");
        expect(courseLevel({ km: 3, gainM: 450 }).id).toBe("moderate");       // 짧아도 오르막이 크면 가벼운 길이 아니다
        expect(courseLevel({ km: 9, gainM: 600 }).id).toBe("moderate");
        expect(courseLevel({ km: 7.1, gainM: 1370 }).id).toBe("hard");
        expect(courseLevel({ km: 18, gainM: 700 }).id).toBe("hard");
        // 겨루는 말 · 재촉이 없다
        for (const c of [{ km: 3, gainM: 200 }, { km: 9, gainM: 600 }, { km: 18, gainM: 1500 }]) expect(`${courseLevel(c).label} ${courseLevel(c).note}`).not.toMatch(/빨리|기록|도전/);
    });
    it("기울기 — 완만 · 가파름 · 매우 가파름(내리막도 같은 잣대), 같은 등급은 한 토막", () => {
        const line = lineOf([[1, 0.05], [1, 0.2], [1, 0.35], [1, -0.35], [1, 0]]);
        const cls = slopeClasses(line);
        expect(cls.length).toBe(line.length - 1);
        // 토막의 한가운데는 그 토막의 등급이다(이음매는 앞뒤를 같이 봐서 흐려진다)
        const at = (km: number) => cls[line.findIndex((p) => p[3] >= km)];
        expect(at(0.5)).toBe(0); expect(at(1.5)).toBe(1); expect(at(2.5)).toBe(2); expect(at(3.5)).toBe(2); expect(at(4.5)).toBe(0);
        const runs = slopeRuns(line);
        expect(runs[0][0]).toBe(0); expect(runs[runs.length - 1][0]).toBe(0);
        // 토막은 끊김 없이 이어진다 — 앞 토막의 끝 점이 다음 토막의 첫 점
        for (let i = 1; i < runs.length; i++) expect(runs[i][1]).toBe(runs[i - 1][2]);
        expect(runs[runs.length - 1][2]).toBe(line.length - 1);
        expect(SLOPE_STEEP).toBeLessThan(SLOPE_VERY); expect(SLOPE_LABEL).toHaveLength(3);
    });
    it("가파른 길의 길이 · 내리막", () => {
        const s = courseSlopes(lineOf([[1, 0.05], [1, 0.2], [1, 0.35], [1, -0.35], [1, 0]]));
        expect(s.steepKm).toBeGreaterThan(0.7); expect(s.steepKm).toBeLessThan(1.4);
        expect(s.veryKm).toBeGreaterThan(1.6); expect(s.veryKm).toBeLessThan(2.3);
        expect(s.lossM).toBe(350);
        expect(courseSlopes([[37, 127, 100, 0]])).toEqual({ steepKm: 0, veryKm: 0, lossM: 0 });
    });
    it("그림의 눈금 — 높이는 네 개 안쪽, 거리는 여섯 개 안쪽, 끝에 바짝 붙은 눈금은 없다", () => {
        expect(altitudeTicks(466, 1714)).toEqual([500, 1000, 1500]);
        expect(altitudeTicks(120, 290)).toEqual([150, 200, 250]);
        expect(altitudeTicks(300, 320).length).toBeLessThanOrEqual(1);
        expect(kmTicks(7.1)).toEqual([2, 4, 6]);
        expect(kmTicks(2.4)).toEqual([0.5, 1, 1.5, 2]);
        expect(kmTicks(21)).toEqual([5, 10, 15]);
        expect(kmTicks(0.4)).toEqual([]);
    });
    it("고정: 코스 카드와 그림이 이 셈을 쓴다", () => {
        const page = read("client/src/hiking/pages/MountainPage.tsx");
        expect(page).toContain('data-testid="course-level"');
        expect(page).toContain('data-testid="course-timeline"');
        const parts = read("client/src/hiking/components/CourseParts.tsx");
        expect(parts).toContain("slopeRuns(line)");
        // 산행 중 화면도 같은 그림을 쓴다(지나온 길은 산호빛)
        expect(parts).toContain('stroke="#F28C6A" strokeWidth="4"');
    });
});

describe("코스 한눈에 견주기(2026-10-19)", () => {
    const line = (km: number, lo: number, hi: number): LinePoint[] => Array.from({ length: 11 }, (_, i) => [0, 0, lo + (hi - lo) * Math.sin((i / 10) * Math.PI), (i / 10) * km] as LinePoint);
    const courses = [
        { km: 4.9, gainM: 539, minM: 101, maxM: 375, line: line(4.9, 101, 375) },
        { km: 2.4, gainM: 210, minM: 150, maxM: 363, line: line(2.4, 150, 363) },
        { km: 1.5, gainM: 260, minM: 120, maxM: 363, line: line(1.5, 120, 363) },
    ];
    it("같은 눈금 — 긴 코스가 넓다", () => {
        const rows = compareCourses(courses, 120, 32);
        expect(rows[0].w).toBeCloseTo(120);
        expect(rows[2].w).toBeCloseTo((1.5 / 4.9) * 120);
        expect(rows[0].path.startsWith("M0.0,")).toBe(true);
    });
    it("꼬리표는 사실만 — 가장 짧은 · 오르막 가장 적은(셋 이상일 때)", () => {
        const rows = compareCourses(courses);
        expect(rows[2].tags).toEqual(["shortest"]);
        expect(rows[1].tags).toEqual(["leastGain"]);
        expect(compareCourses(courses.slice(0, 2)).every((r) => r.tags.length === 0)).toBe(true);
    });
    it("산 페이지가 단다", () => {
        const s = readFileSync(resolve(__dirname, "..", "client/src/hiking/pages/MountainPage.tsx"), "utf8");
        expect(s).toContain("<CourseCompare");
    });
});
