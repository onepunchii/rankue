import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../types.js";
import { hanRegime, noseAngle, resolveCushionHan } from "./han2005.js";
import {
    H, LEFT, P, R, SEGS,
    angleFromNormal, ball, deepFreeze, deg, expectVecClose, incidentVelocity, ke,
    mirrorY, mulberry32, normalComponent, rad, randomIncident, rollingSpin, tangentComponent,
} from "./testHelpers.js";

describe("noseAngle", () => {
    it("sinθ = (h − R)/R, 대대 ≈ 0.203", () => {
        const { sinT, cosT } = noseAngle(R, H);
        expect(sinT).toBeCloseTo(0.2033, 3);
        expect(sinT * sinT + cosT * cosT).toBeCloseTo(1, 12);
    });
    it("코가 공 지름을 넘으면 RangeError", () => {
        expect(() => noseAngle(R, 2.5 * R)).toThrow(RangeError);
    });
});

describe("resolveCushionHan — 불변량", () => {
    it("5000 개 시드 무작위 입사 상태에서 운동에너지가 늘지 않는다", () => {
        const rng = mulberry32(20250907);
        let grips = 0;
        for (let i = 0; i < 5000; i++) {
            const { b, seg } = randomIncident(rng, i);
            const out = resolveCushionHan(b, seg, P, H);
            const e0 = ke(b), e1 = ke(out);
            expect(e1).toBeLessThanOrEqual(e0 * (1 + 1e-9));
            expect(out.v[2]).toBe(0);
            expect(out.state).toBe("sliding");
            // 결과는 항상 쿠션에서 멀어진다.
            expect(normalComponent(out.v, seg)).toBeGreaterThan(0);
            if (hanRegime(b, seg, P, H) === "grip") grips++;
        }
        // 두 분기 모두 실제로 밟혔는지.
        expect(grips).toBeGreaterThan(100);
        expect(grips).toBeLessThan(4900);
    });

    it("거울 대칭: v_y, ω_x, ω_z 를 뒤집으면 결과도 뒤집힌다", () => {
        const rng = mulberry32(7);
        for (let i = 0; i < 500; i++) {
            const speed = 0.2 + 7.8 * rng();
            const alpha = rad(-89 + 178 * rng());
            const w: Vec3 = [600 * rng() - 300, 600 * rng() - 300, 600 * rng() - 300];
            const b = ball(incidentVelocity(LEFT, speed, alpha), w);
            const a = resolveCushionHan(b, LEFT, P, H);
            const m = resolveCushionHan(mirrorY(b), LEFT, P, H);
            expectVecClose(mirrorY(a).v, m.v, 1e-9);
            expectVecClose(mirrorY(a).w, m.w, 1e-6);
        }
    });

    it("입력을 변형하지 않고 결정론적이다", () => {
        const b = deepFreeze(ball(incidentVelocity(LEFT, 2.5, rad(30)), [10, -20, 150]));
        const snap = JSON.stringify(b);
        const a = resolveCushionHan(b, LEFT, P, H);
        const c = resolveCushionHan(b, LEFT, P, H);
        expect(JSON.stringify(b)).toBe(snap);
        expect(a).toEqual(c);
        expect(a.v).not.toBe(b.v);
        expect(a.r).toEqual(b.r);
        expect(a.id).toBe(b.id);
    });

    it("쿠션에서 멀어지는 공은 그대로 돌려준다", () => {
        const b = ball([1, 0.5, 0]); // 왼쪽 쿠션 법선 +x 와 같은 방향 → 멀어짐
        expect(resolveCushionHan(b, LEFT, P, H)).toBe(b);
        expect(hanRegime(b, LEFT, P, H)).toBeNull();
    });

    it("4면 모두 같은 상대 기하에서 같은 결과를 준다(프레임 회전 검증)", () => {
        const speed = 2, alpha = rad(35);
        const ref = resolveCushionHan(ball(incidentVelocity(LEFT, speed, alpha), [0, 0, 80]), LEFT, P, H);
        const refN = normalComponent(ref.v, LEFT), refT = tangentComponent(ref.v, LEFT);
        for (const seg of SEGS) {
            const v = incidentVelocity(seg, speed, alpha);
            // 사이드스핀(ω_z)은 회전 불변. 구름 성분은 없음.
            const out = resolveCushionHan(ball(v, [0, 0, 80]), seg, P, H);
            expect(normalComponent(out.v, seg)).toBeCloseTo(refN, 10);
            expect(tangentComponent(out.v, seg)).toBeCloseTo(refT, 10);
            expect(out.w[2]).toBeCloseTo(ref.w[2], 8);
        }
    });
});

describe("resolveCushionHan — 물리", () => {
    it("45° 구름 무사이드스핀: 반사각 45° ± 3° (실제값 보고)", () => {
        const v = incidentVelocity(LEFT, 2, rad(45));
        const out = resolveCushionHan(ball(v, rollingSpin(v)), LEFT, P, H);
        const a = deg(angleFromNormal(out.v, LEFT));
        // 실측: ≈ 43.7° (slip 분기; 접선 (1 − μ(1+e)cosθ/√2·…) 감속이 법선 감속보다 조금 작다)
        expect(a).toBeGreaterThan(42);
        expect(a).toBeLessThan(48);
        expect(hanRegime(ball(v, rollingSpin(v)), LEFT, P, H)).toBe("slip");
        // 같은 쪽 접선 부호 유지, 법선 반전.
        expect(Math.sign(tangentComponent(out.v, LEFT))).toBe(Math.sign(tangentComponent(v, LEFT)));
        expect(normalComponent(out.v, LEFT)).toBeGreaterThan(0);
    });

    it("순방향 잉글리시: 반사각이 법선에서 멀어지고 접선 속도가 커진다", () => {
        // 왼쪽 쿠션(법선 +x), 접선 ŷ = (0, −1). alpha < 0 → 테이블 +y 로 진행.
        // 접점(−R n = (−R,0,0))의 스핀 속도 ω × (−R x̂) = (0, −R ω_z, 0):
        // ω_z > 0 이면 접점이 −y 로 움직여 마찰이 +y(진행 방향)로 민다 = 순방향(러닝).
        const v = incidentVelocity(LEFT, 2, rad(-40));
        expect(v[1]).toBeGreaterThan(0);
        const noSpin = resolveCushionHan(ball(v, rollingSpin(v)), LEFT, P, H);
        const rs = rollingSpin(v);
        const running = resolveCushionHan(ball(v, [rs[0], rs[1], 120]), LEFT, P, H);
        const reverse = resolveCushionHan(ball(v, [rs[0], rs[1], -120]), LEFT, P, H);
        expect(angleFromNormal(running.v, LEFT)).toBeGreaterThan(angleFromNormal(noSpin.v, LEFT));
        expect(running.v[1]).toBeGreaterThan(noSpin.v[1]);
        expect(angleFromNormal(reverse.v, LEFT)).toBeLessThan(angleFromNormal(noSpin.v, LEFT));
        expect(reverse.v[1]).toBeLessThan(noSpin.v[1]);
    });

    it("역방향 잉글리시, 쿠션 선에서 85°(법선에서 5°) 입사: 스핀이 충분하면 접선 속도가 반전된다", () => {
        // Coulomb 상한 때문에 접선 Δv ≤ μ(1+e)|v_n| cosθ. 법선에서 5° 면 |v_t|/|v_n| = 0.087 < 0.276 이라 반전 가능.
        const v = incidentVelocity(LEFT, 1.5, rad(-5)); // +y 진행
        expect(v[1]).toBeGreaterThan(0);
        const low = resolveCushionHan(ball(v, [0, 0, -5]), LEFT, P, H);
        const high = resolveCushionHan(ball(v, [0, 0, -250]), LEFT, P, H);
        expect(low.v[1]).toBeGreaterThan(0);   // 약한 스핀: 그대로 진행
        expect(high.v[1]).toBeLessThan(0);     // 강한 역스핀: 온 쪽으로 되돌아감
        expect(hanRegime(ball(v, [0, 0, -250]), LEFT, P, H)).toBe("slip");
    });

    it("정면 + 구름(탑스핀): |v_x'| 는 0.5–1.0 × v_x, 탑스핀은 줄되 부호 유지, 무스핀보다 빠르게 튄다", () => {
        const v = incidentVelocity(LEFT, 2, 0);
        const top = resolveCushionHan(ball(v, rollingSpin(v)), LEFT, P, H);
        const flat = resolveCushionHan(ball(v), LEFT, P, H);
        const ratio = Math.abs(top.v[0]) / Math.abs(v[0]);
        expect(ratio).toBeGreaterThan(0.5);
        expect(ratio).toBeLessThan(1.0);
        expect(top.v[2]).toBe(0);
        expect(Math.abs(top.v[1])).toBeLessThan(1e-12);
        // 구름 ω_y = −|v|/R (진행 −x). 코가 중심보다 높아 마찰이 스핀을 깎는다: 크기 감소, 부호 유지.
        expect(Math.abs(top.w[1])).toBeLessThan(Math.abs(rollingSpin(v)[1]));
        expect(Math.sign(top.w[1])).toBe(Math.sign(rollingSpin(v)[1]));
        // Mathavan 2010 Fig.9 정성: 탑스핀이 반사 속도를 키운다.
        expect(Math.abs(top.v[0])).toBeGreaterThan(Math.abs(flat.v[0]));
    });

    it("hanRegime: 느린 직진 공은 grip, 빠른 비스듬한 공은 slip", () => {
        expect(hanRegime(ball(incidentVelocity(LEFT, 0.3, rad(10))), LEFT, P, H)).toBe("grip");
        expect(hanRegime(ball(incidentVelocity(LEFT, 6, rad(70))), LEFT, P, H)).toBe("slip");
        // e, μ 상수라 판정은 속력 스케일에 불변: 같은 각도면 속력이 달라도 같은 분기.
        expect(hanRegime(ball(incidentVelocity(LEFT, 6, rad(10))), LEFT, P, H)).toBe("grip");
        expect(hanRegime(ball(incidentVelocity(LEFT, 0.3, rad(70))), LEFT, P, H)).toBe("slip");
    });

    it("grip 분기: 접점 미끄럼 속도(접선)가 정확히 0 이 된다", () => {
        // 직진 무스핀 → grip. 결과 접점 속도를 접점 프레임에서 다시 계산.
        const v = incidentVelocity(LEFT, 1, rad(10));
        const b = ball(v);
        expect(hanRegime(b, LEFT, P, H)).toBe("grip");
        const out = resolveCushionHan(b, LEFT, P, H);
        const { sinT, cosT } = noseAngle(R, H);
        // 쿠션 프레임(x̂ = −n = (−1,0), ŷ = (0,−1)) — 왼쪽 쿠션이라 성분 부호만 뒤집힌다.
        const vx = -out.v[0], vy = -out.v[1];
        const wx = -out.w[0], wy = -out.w[1], wz = out.w[2];
        // v_z 를 버리기 전의 값은 알 수 없으므로 s_y 만 검사(s_x 는 v_z 항을 포함).
        const sy = -vy - R * wz * cosT + R * wx * sinT;
        expect(Math.abs(sy)).toBeLessThan(1e-12);
        expect(wy).toBeDefined();
    });
});
