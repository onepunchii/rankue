import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_ITEMS, SOON } from "./cueCase";
import { awardOrigin, canTakeBack, rejudgeable } from "./cueCaseAudit";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const byRule = (f: (r: any) => boolean) => CASE_ITEMS.find((x) => f(x.rule))!;

describe("큐 케이스 맞춰 보기 — 무엇을 다시 판정하나", () => {
    it("그 순간에만 아는 것 · 고른 한정 큐 · 곧 열려요는 다시 판정하지 않는다", () => {
        expect(rejudgeable(byRule((r) => r.k === "realScene" && r.s === "damaUp"))).toBe(false);
        expect(rejudgeable(byRule((r) => r.k === "realScene" && r.s === "overTarget"))).toBe(false);
        expect(rejudgeable(byRule((r) => r.k === "invitePick"))).toBe(false);
        for (const id of SOON) expect(rejudgeable(CASE_ITEMS.find((x) => x.id === id)!)).toBe(false);
        expect(rejudgeable(byRule((r) => r.k === "onWins"))).toBe(true);
        expect(rejudgeable(byRule((r) => r.k === "realGames"))).toBe(true);
        expect(rejudgeable(byRule((r) => r.k === "invite"))).toBe(true);
    });

    it("증정이 먼저 — 기록으로 받을 수 있는 물건이어도 증정했으면 '운영자 증정'", () => {
        const win = byRule((r) => r.k === "onWins").id;
        expect(awardOrigin(win, true)).toBe("granted");
        expect(awardOrigin(win, false)).toBe("earned");
        expect(awardOrigin(byRule((r) => r.k === "invitePick").id, false)).toBe("pick");
        expect(awardOrigin("no-such-item", false)).toBe("moment");
    });

    it("거둘 수 있는 것은 '기록으로 받음 + 받쳐 주지 않음'뿐", () => {
        expect(canTakeBack({ origin: "earned", supported: false })).toBe(true);
        expect(canTakeBack({ origin: "earned", supported: true })).toBe(false);
        for (const origin of ["moment", "pick", "granted"] as const) expect(canTakeBack({ origin, supported: null })).toBe(false);
    });
});

describe("큐 케이스 맞춰 보기 — 서버", () => {
    const repo = read("server/storage/cueCase.repo.ts");
    it("큐 케이스와 맞춰 보기는 같은 판정(judge)을 쓴다", () => {
        expect(repo).toMatch(/async view\([\s\S]*?const \{ online, real, inv, awards, states \} = await this\.judge\(who, nowMs\);/);
        expect(repo).toMatch(/async audit\([\s\S]*?const \{ states \} = await this\.judge\(who, nowMs\);/);
    });
    it("거두기는 다시 맞춰 보고 받쳐 주지 않는 줄만 지운다 — 대표 큐 · 자루 수 간직도 비운다", () => {
        const fn = repo.slice(repo.indexOf("async takeBack("));
        expect(fn).toMatch(/const a = await this\.audit\(memberId, nowMs\);[\s\S]*filter\(canTakeBack\)/);
        expect(fn).toMatch(/update hiq_cue_case_prefs set hero_item = null/);
        expect(fn).toMatch(/holders = null;/);
    });
    it("어드민 길은 까닭 없이는 거두지 않고, 판정 재료(1분 간직)를 새로 읽는다", () => {
        const route = read("server/routes/modules/adminBilliards.ts");
        const take = route.slice(route.indexOf('router.post("/case/:memberId/take-back"'));
        expect(take).toMatch(/if \(!reason\) return sendError\(res, 400/);
        expect(take).toMatch(/ratedDeltas\(true\)[\s\S]*takeBack\(id, itemIds, Date\.now\(\)\)/);
    });
});
