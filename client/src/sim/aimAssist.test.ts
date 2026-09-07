import { describe, it, expect } from "vitest";
import { aimPhi, cuePhiForAim, squirtFor } from "./aimAssist";

const DEG = Math.PI / 180;

describe("aimAssist — 스쿼트 보정", () => {
    it("기본 큐(엔드매스 비 12): 링 절반 2.3°, 링 끝 4.2°, 중앙 0, 왼쪽 사이드는 음수", () => {
        expect(squirtFor(0)).toBe(0);
        expect(squirtFor(0.25) / DEG).toBeCloseTo(2.26, 1);
        expect(squirtFor(0.5) / DEG).toBeCloseTo(4.16, 1);
        expect(squirtFor(-0.5)).toBeCloseTo(-squirtFor(0.5), 12);
    });
    it("보정 켜짐: 조준 = 큐 방향 + 스쿼트, 왕복하면 제자리(정규화 0..2π)", () => {
        const phi = 1.2;
        const aim = aimPhi(phi, 0.4, true);
        expect(aim).toBeCloseTo(phi + squirtFor(0.4), 12);
        expect(cuePhiForAim(aim, 0.4, true)).toBeCloseTo(phi, 12);
        expect(aimPhi(6.2, 0.5, true)).toBeLessThan(2 * Math.PI);
        expect(cuePhiForAim(0.01, 0.5, true)).toBeGreaterThan(0);
    });
    it("보정 꺼짐(리얼리티): 그대로", () => {
        expect(aimPhi(1.2, 0.5, false)).toBe(1.2);
        expect(cuePhiForAim(1.2, 0.5, false)).toBe(1.2);
    });
});
