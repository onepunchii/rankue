import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { FOOTPRINT_SHARE_TTL_SEC, footprintCardPath, signFootprintShare, verifyFootprintShare } from "./footprintShare";

const ME = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const OTHER = "2c98b37e-33cc-4184-960e-c7996f8df31f";
const NOW = 1_790_000_000;

describe("footprintShare", () => {
    const saved = process.env.COOKIE_SECRET;
    beforeEach(() => { process.env.COOKIE_SECRET = "test-secret-for-footprints"; });
    afterEach(() => { process.env.COOKIE_SECRET = saved; });

    it("본인·같은 해·만료 전이면 열린다", () => {
        const s = signFootprintShare(ME, 2026, NOW)!;
        expect(verifyFootprintShare(ME, 2026, s.token, NOW + 60)).toBe(true);
        expect(s.exp).toBe(NOW + FOOTPRINT_SHARE_TTL_SEC);
    });

    it("다른 회원·다른 해·전체 ↔ 연도는 안 열린다", () => {
        const s = signFootprintShare(ME, 2026, NOW)!;
        expect(verifyFootprintShare(OTHER, 2026, s.token, NOW)).toBe(false);
        expect(verifyFootprintShare(ME, 2025, s.token, NOW)).toBe(false);
        expect(verifyFootprintShare(ME, null, s.token, NOW)).toBe(false);
        const all = signFootprintShare(ME, null, NOW)!;
        expect(verifyFootprintShare(ME, null, all.token, NOW)).toBe(true);
        expect(verifyFootprintShare(ME, 2026, all.token, NOW)).toBe(false);
    });

    it("만료되면 닫힌다 · 만료를 늘려 고친 주소도 안 열린다", () => {
        const s = signFootprintShare(ME, 2026, NOW)!;
        expect(verifyFootprintShare(ME, 2026, s.token, s.exp + 1)).toBe(false);
        const [, sig] = s.token.split(".");
        const forged = `${(s.exp + 999).toString(36)}.${sig}`;
        expect(verifyFootprintShare(ME, 2026, forged, NOW)).toBe(false);
    });

    it("서명 한 글자만 바꿔도, 모양이 틀려도, 없어도 닫힌다", () => {
        const s = signFootprintShare(ME, 2026, NOW)!;
        const flip = s.token.slice(0, -1) + (s.token.endsWith("A") ? "B" : "A");
        expect(verifyFootprintShare(ME, 2026, flip, NOW)).toBe(false);
        expect(verifyFootprintShare(ME, 2026, "", NOW)).toBe(false);
        expect(verifyFootprintShare(ME, 2026, undefined, NOW)).toBe(false);
        expect(verifyFootprintShare(ME, 2026, ["x"], NOW)).toBe(false);
        expect(verifyFootprintShare("not-a-uuid", 2026, s.token, NOW)).toBe(false);
    });

    it("비밀이 없으면 만들지도 열지도 않는다", () => {
        const s = signFootprintShare(ME, 2026, NOW)!;
        delete process.env.COOKIE_SECRET;
        expect(signFootprintShare(ME, 2026, NOW)).toBeNull();
        expect(verifyFootprintShare(ME, 2026, s.token, NOW)).toBe(false);
    });

    it("공유 서명이 로그인 쿠키 서명(cookie-parser: 원래 비밀로 회원 번호를 HMAC)과 같아질 수 없다", () => {
        const s = signFootprintShare(ME, null, NOW)!;
        const cookieSig = createHmac("sha256", process.env.COOKIE_SECRET!).update(ME).digest("base64").replace(/=+$/, "");
        const [, sig] = s.token.split(".");
        expect(cookieSig.startsWith(sig)).toBe(false);
        expect(cookieSig.replace(/\+/g, "-").replace(/\//g, "_").startsWith(sig)).toBe(false);
    });

    it("카드 주소 — 연도가 없으면 전체", () => {
        expect(footprintCardPath(ME, 2026, "abc.def")).toBe(`/og/golf-footprints/${ME}.png?year=2026&t=abc.def`);
        expect(footprintCardPath(ME, null, "abc.def")).toBe(`/og/golf-footprints/${ME}.png?t=abc.def`);
    });
});
