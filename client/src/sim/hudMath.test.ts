import { describe, it, expect } from "vitest";
import { applyShot, createSession, DEFAULT_3C_RULES, type ShotOutcome } from "@shared/sim/rules";
import { ko } from "../lib/i18n/ko";
import { buildConfig } from "./setupPresets";
import { displayAverage, endTitle, formatAverage, inningsForAverage, playerLabel, ruleBadge, tableLabel } from "./hudMath";

const t = (k: string) => ko[k] ?? k;

function outcome(points: number, scored: boolean): ShotOutcome {
    return { code: scored ? "point" : "miss-cushions", points, scored, consumesInning: !scored, cushionsBeforeSecond: 2, cushionsBeforeFirst: 0, contacts: [], kisses: 0 };
}

describe("hudMath 에버리지", () => {
    it("점수판 규약: 경기 중엔 완료 이닝 + 1, setup 에선 완료 이닝(0 → 1)", () => {
        expect(inningsForAverage({ innings: 0, currentRun: 0 }, "setup")).toBe(1);
        expect(inningsForAverage({ innings: 0, currentRun: 0 }, "aim")).toBe(1);
        expect(inningsForAverage({ innings: 3, currentRun: 0 }, "aim")).toBe(4);
        expect(inningsForAverage({ innings: 3, currentRun: 2 }, "aim")).toBe(4);
        expect(inningsForAverage({ innings: 3, currentRun: 2 }, "setup")).toBe(4);
        expect(inningsForAverage({ innings: 3, currentRun: 0 }, "finished")).toBe(4);
    });

    it("세션을 실제로 돌리면 목표 도달 이닝까지 센다(3점 / 3이닝 = 1.00)", () => {
        let s = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "p1", target: 3 }] });
        s = applyShot(s, outcome(1, true)).session;      // 1이닝 진행 중, 1점
        expect(displayAverage(s.players[0], "aim")).toBeCloseTo(1, 9);
        s = applyShot(s, outcome(0, false)).session;     // 1이닝 종료
        s = applyShot(s, outcome(0, false)).session;     // 2이닝 종료
        expect(displayAverage(s.players[0], "aim")).toBeCloseTo(1 / 3, 9); // 3이닝 진행 중
        s = applyShot(s, outcome(1, true)).session;
        s = applyShot(s, outcome(1, true)).session;      // 목표 도달 → finished, innings 는 2
        expect(s.status).toBe("finished");
        expect(s.players[0].innings).toBe(2);
        expect(displayAverage(s.players[0], "finished")).toBeCloseTo(1, 9);
    });

    it("formatAverage 는 둘째 자리, -0.00 없음, 음수 유지", () => {
        expect(formatAverage(1 / 3)).toBe("0.33");
        expect(formatAverage(-0.001)).toBe("0.00");
        expect(formatAverage(-1.5)).toBe("-1.50");
        expect(formatAverage(NaN)).toBe("0.00");
    });
});

describe("hudMath 문구", () => {
    it("선수 이름: 1인은 닉네임 → '나', 2인은 선수 n", () => {
        expect(playerLabel(0, 1, "철수", t)).toBe("철수");
        expect(playerLabel(0, 1, "  ", t)).toBe(ko["sim.hud.you"]);
        expect(playerLabel(0, 1, null, t)).toBe(ko["sim.hud.you"]);
        expect(playerLabel(0, 2, "철수", t)).toBe("선수 1");
        expect(playerLabel(1, 2, "철수", t)).toBe("선수 2");
    });

    it("규칙 배지·테이블 라벨", () => {
        expect(ruleBadge(buildConfig({ gameType: "3c", target: 15 }), t)).toBe(ko["sim.hud.ruleUmb"]);
        expect(ruleBadge(buildConfig({ gameType: "3c", target: 15, rules: { ruleSet: "pba" } }), t)).toBe(ko["sim.hud.rulePba"]);
        expect(ruleBadge(buildConfig({ gameType: "4c", target: 80 }), t)).toBe(ko["sim.hud.rule4c"]);
        expect(ruleBadge(buildConfig({ gameType: "4c", target: 80, rules: { threeCushionDouble: true, passiveOpponentContactIsFoul: true } }), t))
            .toBe(`${ko["sim.hud.rule4c"]} · ${ko["sim.hud.rule4cDouble"]} · ${ko["sim.hud.rule4cPassive"]}`);
        expect(tableLabel({ tableId: "DAEDAE" }, t)).toBe(ko["sim.setup.tableDaedae"]);
        expect(tableLabel({ tableId: "JUNGDAE_KR" }, t)).toBe(ko["sim.setup.tableJungdae"]);
    });

    it("종료 제목: 1인 목표 달성/이닝 제한, 2인 승자/무승부", () => {
        let solo = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "p1", target: 1 }] });
        solo = applyShot(solo, outcome(1, true)).session;
        expect(endTitle(solo, ["나"], t)).toBe(ko["sim.end.win"]);
        let capped = createSession({ rules: DEFAULT_3C_RULES, inningCap: 1, players: [{ id: "p1", target: 5 }] });
        capped = applyShot(capped, outcome(0, false)).session;
        expect(capped.status).toBe("finished");
        expect(endTitle(capped, ["나"], t)).toBe(ko["sim.end.inningCap"]);

        let duo = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: "a", target: 1 }, { id: "b", target: 1 }] });
        duo = applyShot(duo, outcome(1, true)).session;
        expect(endTitle(duo, ["선수 1", "선수 2"], t)).toBe("선수 1 승리");
        let draw = createSession({ rules: DEFAULT_3C_RULES, inningCap: 1, players: [{ id: "a", target: 5 }, { id: "b", target: 5 }] });
        draw = applyShot(draw, outcome(0, false)).session;
        draw = applyShot(draw, outcome(0, false)).session;
        expect(draw.winnerIndex).toBeNull();
        expect(endTitle(draw, ["선수 1", "선수 2"], t)).toBe(ko["sim.end.draw"]);
    });
});
