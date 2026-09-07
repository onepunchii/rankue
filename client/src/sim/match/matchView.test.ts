import { describe, it, expect, vi } from "vitest";
import { DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "@shared/sim/rules";
import { ko } from "../../lib/i18n/ko";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import type { MatchPublic } from "../matchApi";
import {
    matchBadge, listRank, sortForList, opponentLabel, gameLabel, rulesLabel, inningCapLabel, endReasonText, joinErrorKey, shareText,
} from "./matchView";

const t = (k: string) => ko[k] ?? k;

function m(over: Partial<MatchPublic> = {}): MatchPublic {
    return {
        id: "m", code: "123456", status: "playing",
        gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: "호스트", guestName: "게스트", hostTarget: 20, guestTarget: 15,
        myIndex: 0, turn: 0, shots: 0, version: 1, state: null, balls: null,
        winnerIndex: null, endReason: null, engineVersion: "", paramsHash: "",
        createdAt: "", startedAt: null, lastShotAt: null, finishedAt: null, claimableAt: null,
        ...over,
    };
}

describe("matchView", () => {
    it("상태 배지: 내 차례 / 상대 차례 / 대기 / 승·패·무 / 취소", () => {
        expect(matchBadge(m())).toEqual({ key: "sim.match.statusMyTurn", tone: "brand" });
        expect(matchBadge(m({ turn: 1 }))).toEqual({ key: "sim.match.statusTheirTurn", tone: "outline" });
        expect(matchBadge(m({ status: "waiting", guestName: null }))).toEqual({ key: "sim.match.statusWaiting", tone: "outline" });
        expect(matchBadge(m({ status: "finished", winnerIndex: 0 }))).toEqual({ key: "sim.match.statusWon", tone: "win" });
        expect(matchBadge(m({ status: "finished", winnerIndex: 1 }))).toEqual({ key: "sim.match.statusLost", tone: "muted" });
        expect(matchBadge(m({ status: "finished", winnerIndex: null }))).toEqual({ key: "sim.match.statusDraw", tone: "muted" });
        expect(matchBadge(m({ status: "canceled" }))).toEqual({ key: "sim.match.statusCanceled", tone: "muted" });
        // 모든 배지 키가 사전에 있다
        for (const x of [m(), m({ turn: 1 }), m({ status: "waiting" }), m({ status: "finished", winnerIndex: 0 }), m({ status: "finished", winnerIndex: 1 }), m({ status: "finished" }), m({ status: "canceled" })]) {
            expect(ko[matchBadge(x).key]).toBeTruthy();
        }
    });
    it("정렬: 내 차례 → 상대 차례 → 대기 → 끝남, 같은 순위는 원래 순서", () => {
        const list = [m({ id: "fin", status: "finished", winnerIndex: 0 }), m({ id: "their", turn: 1 }), m({ id: "wait", status: "waiting" }), m({ id: "mine1" }), m({ id: "mine2" })];
        expect(sortForList(list).map((x) => x.id)).toEqual(["mine1", "mine2", "their", "wait", "fin"]);
        expect(listRank(m({ status: "canceled" }))).toBe(3);
    });
    it("상대 이름·종목·규칙·이닝 문구", () => {
        expect(opponentLabel(m(), t)).toBe("게스트");
        expect(opponentLabel(m({ myIndex: 1 }), t)).toBe("호스트");
        expect(opponentLabel(m({ guestName: null, status: "waiting" }), t)).toBe(ko["sim.match.opponentPending"]);
        expect(opponentLabel(m({ myIndex: -1 }), t)).toBe("호스트");
        expect(gameLabel(m(), t)).toBe(`${ko["sim.setup.type3c"]} · ${ko["sim.setup.tableDaedae"]}`);
        expect(gameLabel(m({ gameType: "4c", tableId: "JUNGDAE_KR" }), t)).toBe(`${ko["sim.setup.type4c"]} · ${ko["sim.setup.tableJungdae"]}`);
        expect(rulesLabel(m(), t)).toBe(ko["sim.hud.ruleUmb"]);
        expect(rulesLabel(m({ rules: { ...DEFAULT_3C_RULES, ruleSet: "pba" } }), t)).toBe(ko["sim.hud.rulePba"]);
        expect(rulesLabel(m({ rules: { ...DEFAULT_4C_RULES, threeCushionDouble: true } }), t)).toBe(`${ko["sim.hud.rule4c"]} · ${ko["sim.hud.rule4cDouble"]}`);
        expect(inningCapLabel(0, t)).toBe(ko["sim.setup.inningNone"]);
        expect(inningCapLabel(15, t)).toBe(ko["sim.setup.inningN"].replace("{n}", "15"));
    });
    it("종료 사유: 기권은 진 사람, 무응답 승리는 이긴 사람 이름", () => {
        expect(endReasonText(m(), t)).toBeNull();
        expect(endReasonText(m({ status: "finished", winnerIndex: 1, endReason: "resign" }), t)).toBe(ko["sim.match.endResign"].replace("{name}", "호스트"));
        expect(endReasonText(m({ status: "finished", winnerIndex: 1, endReason: "claim" }), t)).toBe(ko["sim.match.endClaim"].replace("{name}", "게스트"));
        expect(endReasonText(m({ status: "finished", winnerIndex: 0, endReason: "target" }), t)).toBe(ko["sim.match.endTarget"]);
        expect(endReasonText(m({ status: "finished", winnerIndex: null, endReason: "inningCap" }), t)).toBe(ko["sim.match.endInningCap"]);
        expect(endReasonText(m({ status: "finished", winnerIndex: 0, endReason: null }), t)).toBeNull();
    });
    it("참가 오류 키·공유 문구", () => {
        expect(joinErrorKey({ status: 404 })).toBe("sim.match.notFound");
        expect(joinErrorKey({ status: 409 })).toBe("sim.match.alreadyStarted");
        expect(joinErrorKey({ status: 400 })).toBe("sim.match.ownMatch");
        expect(joinErrorKey(new TypeError("Failed to fetch"))).toBe("sim.match.error");
        expect(shareText("123456", t)).toBe(ko["sim.match.shareText"].replace("{code}", "123456"));
    });
});
