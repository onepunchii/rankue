import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eveRunOf, gridFresh, teeClubState } from "./golfFeeds";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("골프 외부 수집", () => {
    it("남은 티 한 곳의 상태 — 안 봄 · 못 받음 · 일부 · 잘 받음", () => {
        expect(teeClubState({ days: 0, ok: 0, miss: 0 })).toBe("none");
        expect(teeClubState({ days: 7, ok: 0, miss: 7 })).toBe("fail");
        expect(teeClubState({ days: 7, ok: 6, miss: 1 })).toBe("partial");
        expect(teeClubState({ days: 7, ok: 7, miss: 0 })).toBe("ok");
    });

    it("격자는 가장 새 발표거나 바로 전 발표면 쓸 만하다", () => {
        expect(gridFresh("202610171400", "202610171400", "202610171100")).toBe(true);
        expect(gridFresh("202610171100", "202610171400", "202610171100")).toBe(true);
        expect(gridFresh("202610170800", "202610171400", "202610171100")).toBe(false);
        expect(gridFresh(null, "202610171400", "202610171100")).toBe(false);
    });

    it("크론 실행 기록 한 줄 — 숫자가 아니면 비운다", () => {
        expect(eveRunOf({ at: "x", ok: true, result: { rounds: 3, players: 7, sent: 7, failed: 0 } })).toEqual({ at: "x", ok: true, rounds: 3, players: 7, sent: 7, failed: 0, error: null });
        expect(eveRunOf({ at: "x", ok: false, result: { error: "시간 초과" } })).toMatchObject({ ok: false, rounds: null, error: "시간 초과" });
        expect(eveRunOf({ at: "x", ok: true, result: null })).toMatchObject({ rounds: null, sent: null });
    });

    it("미리보기는 보내지 않는다 · 한 곳 받기는 받는 곳만 · 관리자 가드 뒤", () => {
        const src = read("server/routes/modules/adminGolf/feeds.ts");
        expect(src).toContain("await runGolfRoundEve(Date.now(), { dry: true, force: true })");
        expect(src).toMatch(/router\.get\("\/eve-preview"/);
        expect(src).toContain('if (only && !GOLF_TEE_SOURCES.some((s) => s.slug === only)) return sendError(res, 404');
        const idx = read("server/routes/modules/adminGolf/index.ts");
        expect(idx.indexOf("router.use(checkSuperAdmin);")).toBeLessThan(idx.indexOf('router.use("/feeds", feeds);'));
    });
});
