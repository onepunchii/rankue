import { describe, expect, it } from "vitest";
import { easeOppAim, OPP_AIM_EASE, OPP_AIM_SNAP_RAD } from "./oppAim";
import { TWO_PI } from "../aim";

/** 대기 화면의 상대 큐대가 어디에 그려지는가 — 2026-09-16 "멀티가 너무 정적이다" 의 회귀 테스트. */
describe("easeOppAim", () => {
    it("상대 조준이 없으면 큐대를 그리지 않는다 — 상대가 샷을 쳤거나 앱을 닫았다", () => {
        expect(easeOppAim(null, null)).toBeNull();
        expect(easeOppAim(1.2, null)).toBeNull();
    });

    it("처음 보일 땐 제자리에서 시작한다 — 엉뚱한 각도에서 휘둘러 오지 않게", () => {
        expect(easeOppAim(null, 1.2)).toEqual({ phi: 1.2, moving: false });
    });

    it("목표로 조금씩 따라가고, 따라가는 동안 moving 이다", () => {
        const step = easeOppAim(0, 1)!;
        expect(step.moving).toBe(true);
        expect(step.phi).toBeCloseTo(OPP_AIM_EASE, 12);
        // 계속 먹이면 목표에 수렴한다(60프레임 = 1초 안쪽)
        let phi = 0;
        for (let i = 0; i < 60; i++) phi = easeOppAim(phi, 1)!.phi;
        expect(phi).toBeCloseTo(1, 3);
    });

    it("붙었으면 목표로 스냅하고 멈춘다 — 프레임을 더 안 태운다", () => {
        const r = easeOppAim(1 - OPP_AIM_SNAP_RAD / 2, 1)!;
        expect(r).toEqual({ phi: 1, moving: false });
    });

    it("짧은 쪽으로 돈다 — 0 과 2π 는 이웃이다", () => {
        // 0.05 → 6.25(≈ -0.03). 한 바퀴 되돌지 말고 뒤로 가야 한다.
        const back = easeOppAim(0.05, TWO_PI - 0.03)!;
        expect(back.phi).toBeLessThan(0.05);
        // 반대 방향도 마찬가지 — 6.25 에서 0.05 로는 앞으로(2π 를 넘어) 간다
        const fwd = easeOppAim(TWO_PI - 0.03, 0.05)!;
        expect(fwd.phi).toBeGreaterThan(TWO_PI - 0.03);
    });

    it("돌려주는 각도는 늘 0..2π 안이다 — 렌더러가 그대로 쓴다", () => {
        let phi = TWO_PI - 0.001;
        for (let i = 0; i < 30; i++) {
            phi = easeOppAim(phi, 0.4)!.phi;
            expect(phi).toBeGreaterThanOrEqual(0);
            expect(phi).toBeLessThan(TWO_PI);
        }
    });
});
