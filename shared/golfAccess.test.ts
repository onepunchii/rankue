import { describe, it, expect } from "vitest";
import { golfAllowed, GOLF_PUBLIC, GOLF_TESTER_PHONES } from "./golfAccess.js";

describe("골프 접근 허용", () => {
    it("시험 단계에는 전면 공개가 꺼져 있다 — 켜면 모두에게 열린다", () => {
        expect(GOLF_PUBLIC).toBe(false);
        expect(GOLF_TESTER_PHONES.length).toBeGreaterThan(0);
    });
    it("허용 목록에 있는 번호만 통과한다", () => {
        expect(golfAllowed(GOLF_TESTER_PHONES[0])).toBe(true);
        expect(golfAllowed("01011112222")).toBe(false);
    });
    it("저장 형태가 달라도 같은 번호로 본다 — 하이픈·공백·국가번호", () => {
        const p = GOLF_TESTER_PHONES[0];
        const hyphen = `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
        expect(golfAllowed(hyphen)).toBe(true);
        expect(golfAllowed(` ${hyphen} `)).toBe(true);
        expect(golfAllowed("+82 " + p.slice(1, 3) + " " + p.slice(3, 7) + " " + p.slice(7))).toBe(true);
    });
    it("번호를 모르면 못 쓴다 — 비로그인·번호 없는 계정", () => {
        for (const v of [null, undefined, "", "   ", "abc"]) expect(golfAllowed(v as any), String(v)).toBe(false);
    });
    it("앞자리가 겹치는 다른 번호를 통과시키지 않는다", () => {
        const p = GOLF_TESTER_PHONES[0];
        expect(golfAllowed(p + "1")).toBe(false);
        expect(golfAllowed(p.slice(0, -1))).toBe(false);
    });
});
