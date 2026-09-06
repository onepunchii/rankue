import { describe, it, expect } from "vitest";
import { DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "@shared/sim/rules";
import {
    buildRules, buildConfig, defaultTarget, defaultTableFor, clampTarget, isValidTarget,
    conditionLabel, clampCondition, TARGET_CHIPS, TARGET_FALLBACK, INNING_CAPS,
    CONDITION_MIN, CONDITION_MAX, CONDITION_DEFAULT,
} from "./setupPresets";

describe("buildRules", () => {
    it("3쿠션 기본은 UMB, 엔진 기본값을 그대로 잇는다", () => {
        expect(buildRules("3c")).toEqual(DEFAULT_3C_RULES);
        expect(buildRules("3c", { ruleSet: "umb" })).toEqual(DEFAULT_3C_RULES);
    });
    it("3쿠션 PBA 는 뱅크샷 2점을 유지한다", () => {
        const r = buildRules("3c", { ruleSet: "pba" });
        expect(r).toEqual({ gameType: "3c", ruleSet: "pba", bankShotPoint: 2 });
    });
    it("3쿠션에 4구 옵션을 넘겨도 무시한다", () => {
        expect(buildRules("3c", { threeCushionDouble: true, passiveOpponentContactIsFoul: true })).toEqual(DEFAULT_3C_RULES);
    });
    it("4구 기본은 두 옵션 모두 꺼짐", () => {
        expect(buildRules("4c")).toEqual(DEFAULT_4C_RULES);
        const r = buildRules("4c");
        expect(r.gameType).toBe("4c");
        if (r.gameType === "4c") {
            expect(r.threeCushionDouble).toBe(false);
            expect(r.passiveOpponentContactIsFoul).toBe(false);
            expect(r.pointUnit).toBe(10);
        }
    });
    it("4구 옵션을 켜면 그 값만 바뀌고 나머지는 기본", () => {
        const r = buildRules("4c", { threeCushionDouble: true });
        expect(r).toEqual({ ...DEFAULT_4C_RULES, threeCushionDouble: true });
        const r2 = buildRules("4c", { passiveOpponentContactIsFoul: true, ruleSet: "pba" });
        expect(r2).toEqual({ ...DEFAULT_4C_RULES, passiveOpponentContactIsFoul: true });
    });
    it("입력 객체를 변형하지 않는다", () => {
        const before = { ...DEFAULT_4C_RULES };
        buildRules("4c", { threeCushionDouble: true });
        expect(DEFAULT_4C_RULES).toEqual(before);
    });
});

describe("다마수", () => {
    it("칩 목록", () => {
        expect(TARGET_CHIPS["3c"]).toEqual([10, 15, 20, 25, 30]);
        expect(TARGET_CHIPS["4c"]).toEqual([30, 50, 80, 100, 150]);
    });
    it("핸디가 유효하면 핸디, 아니면 종목 폴백", () => {
        expect(defaultTarget("3c", 20)).toBe(20);
        expect(defaultTarget("4c", 100)).toBe(100);
        expect(defaultTarget("3c", null)).toBe(TARGET_FALLBACK["3c"]);
        expect(defaultTarget("3c", undefined)).toBe(TARGET_FALLBACK["3c"]);
        expect(defaultTarget("4c", 0)).toBe(TARGET_FALLBACK["4c"]);
        expect(defaultTarget("3c", 1000)).toBe(TARGET_FALLBACK["3c"]);
        expect(defaultTarget("3c", 12.5)).toBe(TARGET_FALLBACK["3c"]);
    });
    it("범위 1~999 검증과 클램프", () => {
        expect(isValidTarget(1)).toBe(true);
        expect(isValidTarget(999)).toBe(true);
        expect(isValidTarget(0)).toBe(false);
        expect(isValidTarget(1000)).toBe(false);
        expect(isValidTarget(NaN)).toBe(false);
        expect(isValidTarget("15")).toBe(false);
        expect(clampTarget(0, "3c")).toBe(1);
        expect(clampTarget(5000, "3c")).toBe(999);
        expect(clampTarget(14.6, "3c")).toBe(15);
        expect(clampTarget(NaN, "4c")).toBe(TARGET_FALLBACK["4c"]);
    });
});

describe("테이블·이닝·컨디션", () => {
    it("종목별 기본 테이블", () => {
        expect(defaultTableFor("3c")).toBe("DAEDAE");
        expect(defaultTableFor("4c")).toBe("JUNGDAE_KR");
    });
    it("이닝 제한 선택지에 '없음'(0)이 첫째", () => {
        expect(INNING_CAPS[0]).toBe(0);
        expect(INNING_CAPS).toEqual([0, 10, 15, 20, 30]);
    });
    it("컨디션 라벨 경계", () => {
        expect(conditionLabel(CONDITION_MIN)).toBe("slow");
        expect(conditionLabel(0.95)).toBe("slow");
        expect(conditionLabel(CONDITION_DEFAULT)).toBe("normal");
        expect(conditionLabel(1.05)).toBe("fast");
        expect(conditionLabel(CONDITION_MAX)).toBe("fast");
    });
    it("컨디션 클램프는 step 격자와 소수 둘째 자리로 고정", () => {
        expect(clampCondition(0.5)).toBe(CONDITION_MIN);
        expect(clampCondition(2)).toBe(CONDITION_MAX);
        expect(clampCondition(0.8500000000000001)).toBe(0.85);
        expect(clampCondition(1.12)).toBe(1.1);
        expect(clampCondition(NaN)).toBe(CONDITION_DEFAULT);
    });
});

describe("buildConfig", () => {
    it("최소 입력으로 서버 스키마와 같은 모양의 설정을 만든다", () => {
        const c = buildConfig({ gameType: "4c", target: 80 });
        expect(c).toEqual({
            gameType: "4c",
            tableId: "JUNGDAE_KR",
            target: 80,
            rules: DEFAULT_4C_RULES,
            finishType: "none",
            inningCap: 0,
            cushionModel: "han2005",
            condition: 1,
        });
    });
    it("범위 밖 값을 정리한다", () => {
        const c = buildConfig({ gameType: "3c", target: 5000, inningCap: 7, condition: 3, rules: { ruleSet: "pba" }, cushionModel: "mathavan2010" });
        expect(c.target).toBe(999);
        expect(c.inningCap).toBe(0);
        expect(c.condition).toBe(CONDITION_MAX);
        expect(c.cushionModel).toBe("mathavan2010");
        expect(c.rules).toEqual({ gameType: "3c", ruleSet: "pba", bankShotPoint: 2 });
    });
});
