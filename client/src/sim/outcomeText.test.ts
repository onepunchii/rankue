import { describe, it, expect } from "vitest";
import { ko } from "../lib/i18n/ko";
import type { ShotOutcome, ShotOutcomeCode } from "@shared/sim/rules";
import { OUTCOME_KEYS, outcomeMessage, outcomePointsLabel, outcomeTone } from "./outcomeText";

const t = (k: string) => ko[k] ?? k;
const base = { scored: false, consumesInning: true, cushionsBeforeSecond: 0, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
const oc = (code: ShotOutcomeCode, points = 0, scored = false, cushions = 0): ShotOutcome =>
    ({ ...base, code, points, scored, cushionsBeforeSecond: cushions });

describe("outcomeText", () => {
    it("모든 결과 코드에 ko 문구가 있고 이모지가 없다", () => {
        for (const code of Object.keys(OUTCOME_KEYS) as ShotOutcomeCode[]) {
            const key = OUTCOME_KEYS[code];
            expect(ko[key], key).toBeTruthy();
            expect(ko[key]).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
        }
    });

    it("쿠션 부족은 쿠션 수를 넣는다", () => {
        expect(outcomeMessage(t, oc("miss-cushions", 0, false, 2))).toBe(ko["sim.outcome.missCushions"].replace("{n}", "2"));
        expect(outcomeMessage(t, oc("miss-cushions", 0, false, 2))).toContain("2");
        expect(outcomeMessage(t, oc("point", 1, true, 3))).toBe(ko["sim.outcome.point"]);
    });

    it("점수 라벨과 톤", () => {
        expect(outcomePointsLabel(oc("point", 1, true))).toBe("+1");
        expect(outcomePointsLabel(oc("point-bank", 2, true))).toBe("+2");
        expect(outcomePointsLabel(oc("foul-opponent", -10))).toBe("-10");
        expect(outcomePointsLabel(oc("miss-one-ball"))).toBeNull();
        expect(outcomeTone(oc("point", 1, true))).toBe("score");
        expect(outcomeTone(oc("foul-opponent", -10))).toBe("foul");
        expect(outcomeTone(oc("foul-truncated"))).toBe("foul");
        expect(outcomeTone(oc("miss-finish"))).toBe("miss");
        expect(outcomeTone(oc("no-shot"))).toBe("miss");
    });
});
