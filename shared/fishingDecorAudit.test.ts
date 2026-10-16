import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canTakeBackDecor } from "./fishingDecorAudit";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("수족관 장식 맞춰 보기 — 받쳐 주지 않는 것만 거둔다", () => {
    it("증정한 것 · 기록이 받쳐 주는 것은 거두지 않는다", () => {
        expect(canTakeBackDecor({ granted: false, supported: false })).toBe(true);
        expect(canTakeBackDecor({ granted: false, supported: true })).toBe(false);
        expect(canTakeBackDecor({ granted: true, supported: false })).toBe(false);
    });
    it("판정은 수족관과 같은 재료(가린 조과 빼고) · 같은 셈(decorProgress)", () => {
        const r = read("server/routes/modules/adminFishing.ts");
        expect(r).toMatch(/const list = await decorCatchesOf\(memberId\);\s*const prog = decorProgress\(list\);/);
    });
    it("거두기는 서버가 다시 맞춰 보고, 까닭 없이는 하지 않는다", () => {
        const r = read("server/routes/modules/adminFishing.ts");
        const fn = r.slice(r.indexOf('router.post("/decor/:memberId/take-back"'));
        expect(fn).toMatch(/if \(!reason\) return sendError\(res, 400/);
        expect(fn).toMatch(/const a = await decorAudit\(memberId, ""\);[\s\S]*filter\(canTakeBackDecor\)/);
    });
});
