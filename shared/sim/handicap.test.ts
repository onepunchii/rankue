import { describe, it, expect } from "vitest";
import {
    averageOf, caromsOf, CAROM_MAX, CAROM_MIN, DEFAULT_AVG, handicapPair,
    MIN_INNINGS, playerAverage, pointUnitFor, sessionAverage, TARGET_INNINGS, targetFor,
} from "./handicap.js";

describe("averageOf", () => {
    it("4구는 점수를 캐롬으로 되돌려 센다(1캐롬 = 10점)", () => {
        expect(averageOf({ score: 180, innings: 53, matches: 10 }, 10)).toBeCloseTo(18 / 53, 10);
    });
    it("3쿠션은 점수가 곧 캐롬이다", () => {
        expect(averageOf({ score: 7, innings: 17, matches: 7 }, 1)).toBeCloseTo(7 / 17, 10);
    });
    it("이닝이 없으면 잴 수 없다", () => {
        expect(averageOf({ score: 5, innings: 0, matches: 2 }, 1)).toBeNull();
    });
});

describe("playerAverage", () => {
    it("이닝이 충분히 쌓이면 그 기록으로 센다", () => {
        expect(playerAverage({ gameType: "4c", pointUnit: 10, record: { score: 180, innings: 53, matches: 10 } })).toBeCloseTo(18 / 53, 10);
    });
    it("이닝이 모자라면 종목 기본값 — 실전 핸디는 보지 않는다(시뮬은 실전 성적과 격리)", () => {
        expect(playerAverage({ gameType: "4c", pointUnit: 10, record: { score: 60, innings: MIN_INNINGS - 1, matches: 4 } })).toBe(DEFAULT_AVG["4c"]);
        expect(playerAverage({ gameType: "3c", pointUnit: 1, record: null })).toBe(DEFAULT_AVG["3c"]);
    });
    it("파울이 많아 음수인 기록은 0 으로 본다", () => {
        expect(playerAverage({ gameType: "3c", pointUnit: 1, record: { score: -3, innings: 30, matches: 9 } })).toBe(0);
    });
});

describe("targetFor", () => {
    it("목표 = 에버리지 × 기준 이닝 (4구는 10점 단위)", () => {
        expect(targetFor(1.357, "4c", 10)).toBe(240);   // 24.4 캐롬 → 24
        expect(targetFor(0.255, "4c", 10)).toBe(50);    // 4.6 → 5
        expect(targetFor(0.667, "3c", 1)).toBe(12);
    });
    it("너무 짧거나 긴 판은 한계로 자른다", () => {
        expect(targetFor(0, "3c", 1)).toBe(CAROM_MIN["3c"]);
        expect(targetFor(99, "4c", 10)).toBe(CAROM_MAX["4c"] * 10);
    });
    it("기준 이닝을 바꾸면 길이가 같이 바뀐다", () => {
        expect(targetFor(0.5, "3c", 1, 12)).toBe(6);
        expect(targetFor(0.5, "3c", 1, 24)).toBe(12);
    });
});

describe("handicapPair", () => {
    it("실력 비율이 목표 비율로 들어간다", () => {
        const [a, b] = handicapPair(1.357, 0.255, "4c", 10);
        expect(a).toBe(240);
        expect(b).toBe(50);
        expect(a / b).toBeGreaterThan(4);              // 실제 에버 비율 5.3 — 반올림으로 조금 준다
    });
    it("같은 실력이면 같은 다마", () => {
        const [a, b] = handicapPair(0.4, 0.4, "3c", 1);
        expect(a).toBe(b);
    });
    it("두 사람 모두 기준 이닝 안쪽에서 끝난다", () => {
        for (const avg of [0.1, 0.3, 0.7, 1.2]) {
            const t = targetFor(avg, "3c", 1) ;
            const inningsNeeded = t / Math.max(0.01, avg);
            expect(inningsNeeded).toBeLessThanOrEqual(TARGET_INNINGS * 1.7);   // 아래 한계에 걸린 초보는 조금 길다
        }
    });
});

/**
 * 4구는 1캐롬 = 10점이라 에버리지를 점수로 세면 10배가 된다(에버 200 같은 숫자).
 * 그리고 완료 이닝이 0인 판(한 이닝에 다 친 판)도 1이닝으로 세어 기록에 남긴다 — 2026-09-12 오너 제보.
 */
describe("caromsOf / sessionAverage", () => {
    it("4구 점수는 10으로 나눠 캐롬으로 읽는다", () => {
        expect(caromsOf(1000, "4c")).toBe(100);
        expect(caromsOf(15, "3c")).toBe(15);
        expect(pointUnitFor("4c")).toBe(10);
        expect(pointUnitFor("3c")).toBe(1);
    });
    it("완료 이닝이 0이면 1이닝으로 센다", () => {
        expect(sessionAverage(1000, 0, "4c")).toBe(100);   // 100캐롬 / 1이닝
        expect(sessionAverage(200, 4, "4c")).toBe(5);      // 20캐롬 / 4이닝
        expect(sessionAverage(15, 30, "3c")).toBe(0.5);
    });
    it("이상한 값이어도 나눗셈이 깨지지 않는다", () => {
        expect(sessionAverage(Number.NaN, 5, "3c")).toBe(0);
        expect(sessionAverage(10, Number.NaN, "3c")).toBe(10);
    });
});
