import { describe, it, expect } from "vitest";
import { golfAllowed, GOLF_TESTER_IDS } from "./golfAccess.js";
import { GOLF_PUBLIC } from "../../shared/golfAccess.js";

describe("골프 접근 허용", () => {
    it("시험 단계에는 전면 공개가 꺼져 있다 — 켜면 모두에게 열린다", () => {
        expect(GOLF_PUBLIC).toBe(false);
        expect(GOLF_TESTER_IDS.length).toBeGreaterThan(0);
    });
    it("허용된 회원 id 나 프로필 id 만 통과한다", () => {
        expect(golfAllowed({ id: GOLF_TESTER_IDS[0] })).toBe(true);
        expect(golfAllowed({ id: "someone-else", profileId: GOLF_TESTER_IDS[1] })).toBe(true);
        expect(golfAllowed({ id: "00000000-0000-0000-0000-000000000000", profileId: null })).toBe(false);
    });
    it("전화번호로는 열리지 않는다 — 가입 때 번호를 확인하지 않는다", () => {
        expect(golfAllowed({ id: "new-member", phone: "01000000000" } as any)).toBe(false);
    });
    it("회원을 모르면 못 쓴다", () => {
        for (const v of [null, undefined, {}, { id: "" }]) expect(golfAllowed(v as any), JSON.stringify(v)).toBe(false);
    });
    it("화면 쪽 공용 파일에는 전화번호가 없다 — 번들에 실리지 않게", async () => {
        const fs = await import("node:fs");
        const src = fs.readFileSync(new URL("../../shared/golfAccess.ts", import.meta.url), "utf8");
        expect(src).not.toMatch(/01[0-9][- ]?\d{3,4}[- ]?\d{4}/);
    });
});
