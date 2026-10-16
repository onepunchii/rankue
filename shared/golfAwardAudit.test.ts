import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canTakeBackGolf, golfAwardLabel } from "./golfAwardAudit";
import { GOLF_PINS } from "./golfPins";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("골프 보상 맞춰 보기", () => {
    it("거둘 수 있는 줄 — 기록으로 받았고 지금 기록이 받쳐 주지 않는 것만", () => {
        expect(canTakeBackGolf({ granted: false, supported: false })).toBe(true);
        expect(canTakeBackGolf({ granted: true, supported: false })).toBe(false);
        expect(canTakeBackGolf({ granted: false, supported: true })).toBe(false);
    });

    it("이름 — 증정 목록에 있으면 그 이름 · 그림, 없으면 종류 + 열쇠", () => {
        const pin = GOLF_PINS[0];
        const l = golfAwardLabel(`pin:${pin.id}`);
        expect(l.name).toBe(`${pin.name} 핀`);
        expect(l.image).toMatch(/^\/golf\/stamp-art\//);
        expect(golfAwardLabel("tag:2019:navy")).toEqual({ name: "시즌 태그 · 2019:navy", image: null });
    });

    it("받을 때와 맞춰 볼 때가 같은 판정 — 맞춰 볼 때는 읽기 실패를 던진다", () => {
        const repo = read("server/storage/golf.repo.ts");
        expect(repo).toContain("const { stamps, pins, extra } = await this.stampAwardInputs(memberId, false);");
        expect(repo).toContain("const { stamps, pins, extra } = await this.stampAwardInputs(memberId, true);");
        expect(repo).toContain("return allStampAwardsDue(stamps, pins, extra);");
        expect(read("server/storage/golfStampAwards.ts")).toContain("const due = allStampAwardsDue(stamps, pins, extra);");
    });

    it("거두기는 다시 판정해서 받쳐 주지 않는 줄만 · 증정은 빼고", () => {
        const st = read("server/storage/adminGolfAwards.ts");
        const take = st.slice(st.indexOf("export async function takeBackGolfAwards"));
        expect(take).toContain("const a = await auditGolfAwards(memberId, due);");
        expect(take).toContain("a.rows.filter(canTakeBackGolf)");
        expect(st).toMatch(/sport = 'golf' and revoked_at is null/);
        expect(read("server/routes/modules/adminGolf/index.ts")).toContain('router.use("/awards", awards);');
    });
});
