import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../types.js";
import { resolveCushionSHS } from "./sphereHalfSpace.js";
import { resolveCushionHan } from "./han2005.js";
import { resolveCushionMathavan } from "./mathavan2010.js";
import {
    H, LEFT, P, R, SEGS,
    angleFromNormal, ball, deepFreeze, deg, expectVecClose, incidentVelocity, ke,
    mirrorY, mulberry32, normalComponent, rad, randomIncident, rollingSpin, tangentComponent,
} from "./testHelpers.js";

describe("resolveCushionSHS — 불변량", () => {
    it("5000 개 시드 무작위 입사 상태에서 운동에너지가 늘지 않는다", () => {
        const rng = mulberry32(19840512);
        for (let i = 0; i < 5000; i++) {
            const { b, seg } = randomIncident(rng, i);
            const out = resolveCushionSHS(b, seg, P, H);
            expect(ke(out)).toBeLessThanOrEqual(ke(b) * (1 + 1e-9));
            expect(out.v[2]).toBe(0);
            expect(out.state).toBe("sliding");
            expect(normalComponent(out.v, seg)).toBeGreaterThan(0);
        }
    });

    it("거울 대칭: v_y, ω_x, ω_z 를 뒤집으면 결과도 뒤집힌다", () => {
        const rng = mulberry32(3);
        for (let i = 0; i < 500; i++) {
            const speed = 0.2 + 7.8 * rng();
            const alpha = rad(-89 + 178 * rng());
            const w: Vec3 = [600 * rng() - 300, 600 * rng() - 300, 600 * rng() - 300];
            const b = ball(incidentVelocity(LEFT, speed, alpha), w);
            const a = resolveCushionSHS(b, LEFT, P, H);
            const m = resolveCushionSHS(mirrorY(b), LEFT, P, H);
            expectVecClose(mirrorY(a).v, m.v, 1e-9);
            expectVecClose(mirrorY(a).w, m.w, 1e-6);
        }
    });

    it("입력을 변형하지 않고 결정론적이다", () => {
        const b = deepFreeze(ball(incidentVelocity(LEFT, 2.5, rad(30)), [10, -20, 150]));
        const snap = JSON.stringify(b);
        const a = resolveCushionSHS(b, LEFT, P, H);
        const c = resolveCushionSHS(b, LEFT, P, H);
        expect(JSON.stringify(b)).toBe(snap);
        expect(a).toEqual(c);
        expect(a.v).not.toBe(b.v);
        expect(a.r).toEqual(b.r);
    });

    it("쿠션에서 멀어지는 공은 그대로 돌려준다", () => {
        const b = ball([1, 0.5, 0]);
        expect(resolveCushionSHS(b, LEFT, P, H)).toBe(b);
    });

    it("코 높이를 무시한다(수직 벽)", () => {
        const b = ball(incidentVelocity(LEFT, 2, rad(30)), [5, 7, 90]);
        expect(resolveCushionSHS(b, LEFT, P, H)).toEqual(resolveCushionSHS(b, LEFT, P, R));
    });

    it("4면 모두 같은 상대 기하에서 같은 결과를 준다(프레임 회전 검증)", () => {
        const speed = 2, alpha = rad(35);
        const ref = resolveCushionSHS(ball(incidentVelocity(LEFT, speed, alpha), [0, 0, 80]), LEFT, P, H);
        const refN = normalComponent(ref.v, LEFT), refT = tangentComponent(ref.v, LEFT);
        for (const seg of SEGS) {
            const out = resolveCushionSHS(ball(incidentVelocity(seg, speed, alpha), [0, 0, 80]), seg, P, H);
            expect(normalComponent(out.v, seg)).toBeCloseTo(refN, 10);
            expect(tangentComponent(out.v, seg)).toBeCloseTo(refT, 10);
            expect(out.w[2]).toBeCloseTo(ref.w[2], 8);
        }
    });
});

describe("resolveCushionSHS — 물리", () => {
    it("정면 무스핀: v_out = e·v_in, 접선·스핀 0", () => {
        for (const speed of [0.3, 1.3, 2, 7.7]) {
            const v = incidentVelocity(LEFT, speed, 0);
            const out = resolveCushionSHS(ball(v), LEFT, P, H);
            expect(out.v[0]).toBeCloseTo(P.eC * speed, 12);
            expect(out.v[1]).toBe(0);
            expect(out.v[2]).toBe(0);
            expect(out.w).toEqual([0, 0, 0]);
        }
    });

    it("45° 구름 무사이드스핀: 반사각 보고(≈ 42.3°), 법선 반전·접선 부호 유지", () => {
        const v = incidentVelocity(LEFT, 2, rad(45));
        const out = resolveCushionSHS(ball(v, rollingSpin(v)), LEFT, P, H);
        const a = deg(angleFromNormal(out.v, LEFT));
        expect(a).toBeGreaterThan(38);
        expect(a).toBeLessThan(48);
        expect(Math.sign(tangentComponent(out.v, LEFT))).toBe(Math.sign(tangentComponent(v, LEFT)));
        expect(normalComponent(out.v, LEFT)).toBeGreaterThan(0);
    });

    it("순방향 잉글리시: 반사각이 법선에서 멀어지고 접선 속도가 커진다", () => {
        const v = incidentVelocity(LEFT, 2, rad(-40)); // +y 진행, 왼쪽 쿠션이라 ω_z > 0 이 순방향
        const noSpin = resolveCushionSHS(ball(v, rollingSpin(v)), LEFT, P, H);
        const running = resolveCushionSHS(ball(v, [rollingSpin(v)[0], rollingSpin(v)[1], 120]), LEFT, P, H);
        const reverse = resolveCushionSHS(ball(v, [rollingSpin(v)[0], rollingSpin(v)[1], -120]), LEFT, P, H);
        expect(angleFromNormal(running.v, LEFT)).toBeGreaterThan(angleFromNormal(noSpin.v, LEFT));
        expect(running.v[1]).toBeGreaterThan(noSpin.v[1]);
        expect(reverse.v[1]).toBeLessThan(noSpin.v[1]);
    });

    it("역방향 잉글리시, 쿠션 선에서 85°(법선에서 5°) 입사: 스핀이 충분하면 접선 속도가 반전된다", () => {
        const v = incidentVelocity(LEFT, 1.5, rad(-5));
        const low = resolveCushionSHS(ball(v, [0, 0, -5]), LEFT, P, H);
        const high = resolveCushionSHS(ball(v, [0, 0, -250]), LEFT, P, H);
        expect(low.v[1]).toBeGreaterThan(0);
        expect(high.v[1]).toBeLessThan(0);
    });

    it("stick 분기: 결과 접점 미끄럼 속도(벽 접선 평면, 테이블 z 버리기 전)가 0", () => {
        // 정면, 약한 사이드스핀만 → |u| 작아 stick. ω_z 만 있으면 수직 미끄럼이 없어 v_z 버림이 영향 없다.
        const v = incidentVelocity(LEFT, 2, 0);
        const out = resolveCushionSHS(ball(v, [0, 0, 5]), LEFT, P, H);
        // 접점 (−R, 0, 0): u_y = v_y + (ω × (−R x̂))_y = v_y − R ω_z
        expect(Math.abs(out.v[1] - R * out.w[2])).toBeLessThan(1e-12);
        expect(normalComponent(out.v, LEFT)).toBeCloseTo(P.eC * 2, 12);
    });

    it("slip 분기: 접선 Δv 크기가 정확히 μ(1+e)|v_n|", () => {
        const v = incidentVelocity(LEFT, 2, 0);
        const out = resolveCushionSHS(ball(v, [0, 0, 300]), LEFT, P, H);
        expect(Math.abs(out.v[1])).toBeCloseTo(P.fC * (1 + P.eC) * 2, 12);
    });
});

describe("v2.2 공중 공(airborne) — 무한 높이 수직 벽, 자유 구 임펄스 전체", () => {
    const airborne = (v: Vec3, w: Vec3 = [0, 0, 0], z = R + 0.03) => ({ ...ball(v, w), r: [R, 1.0, z] as Vec3, state: "airborne" as const });

    it("v_z 를 지우지 않는다: 마찰의 수직 성분만큼 바뀌고 상태는 airborne, 법선 속도는 반전(e)", () => {
        const b = airborne(incidentVelocity(LEFT, 2, rad(30)).map((x, i) => (i === 2 ? -0.8 : x)) as unknown as Vec3, [0, 0, 0]);
        const out = resolveCushionSHS(b, LEFT, P, H);
        expect(out.state).toBe("airborne");
        expect(out.r).toEqual(b.r);
        expect(normalComponent(out.v, LEFT)).toBeCloseTo(-P.eC * normalComponent(b.v, LEFT), 12);
        // 접점이 아래로 미끄러지므로(v_z < 0) 마찰은 위로: v_z 가 커진다
        expect(out.v[2]).toBeGreaterThan(b.v[2]);
        expect(ke(out)).toBeLessThanOrEqual(ke(b) * (1 + 1e-9));
    });

    it("5000개 무작위 공중 입사: 에너지 비증가, 법선 속도 반전, airborne 유지", () => {
        const rng = mulberry32(77);
        for (let i = 0; i < 5000; i++) {
            const { b: flat, seg } = randomIncident(rng, i);
            const b = { ...flat, r: [flat.r[0], flat.r[1], R + 0.1 * rng()] as Vec3, v: [flat.v[0], flat.v[1], 6 * rng() - 3] as Vec3, state: "airborne" as const };
            const out = resolveCushionSHS(b, seg, P, H);
            expect(ke(out)).toBeLessThanOrEqual(ke(b) * (1 + 1e-9));
            expect(normalComponent(out.v, seg)).toBeGreaterThan(0);
            expect(out.state === "airborne" || (out.v[2] === 0 && out.r[2] === R)).toBe(true);
        }
    });

    it("han2005·mathavan2010 은 공중 공을 sphereHalfSpace 로 넘긴다(결과 동일)", () => {
        const b = airborne(incidentVelocity(LEFT, 3, rad(40)), [20, -30, 90]);
        const ref = resolveCushionSHS(b, LEFT, P, H);
        expect(resolveCushionHan(b, LEFT, P, H)).toEqual(ref);
        expect(resolveCushionMathavan(b, LEFT, P, H)).toEqual(ref);
        // 천 위의 공은 모델마다 다르다(회귀 방지: 위임은 airborne 에만)
        const flat = ball(incidentVelocity(LEFT, 3, rad(40)), [20, -30, 90]);
        expect(resolveCushionHan(flat, LEFT, P, H)).not.toEqual(resolveCushionSHS(flat, LEFT, P, H));
    });
});
