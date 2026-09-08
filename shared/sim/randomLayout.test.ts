import { describe, it, expect } from "vitest";
import { randomLayout } from "./randomLayout";
import { TABLES } from "./params";
import { isValidLayout } from "./layouts";

const T = TABLES.DAEDAE;

describe("길 찾기 무작위 배치", () => {
    it("3쿠션·4구 모두 규칙에 맞는 배치를 준다(쿠션 안·안 겹침)", () => {
        for (const g of ["3c", "4c"] as const) {
            for (let seed = 1; seed <= 30; seed++) {
                const balls = randomLayout(g, T, seed);
                expect(balls.length, `${g} seed ${seed}`).toBe(g === "3c" ? 3 : 4);
                expect(isValidLayout(balls, T), `${g} seed ${seed}`).toBe(true);
                for (const b of balls) {
                    expect(b.r[0]).toBeGreaterThan(T.ball.R);
                    expect(b.r[0]).toBeLessThan(T.width - T.ball.R);
                    expect(b.r[1]).toBeGreaterThan(T.ball.R);
                    expect(b.r[1]).toBeLessThan(T.length - T.ball.R);
                    expect(b.r[2]).toBeCloseTo(T.ball.R, 12);
                    expect(b.v).toEqual([0, 0, 0]);
                    expect(b.state).toBe("stationary");
                }
            }
        }
    });
    it("공끼리 붙지 않는다(지름의 1.5배 이상 떨어진다)", () => {
        const balls = randomLayout("3c", T, 7);
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const dx = balls[i].r[0] - balls[j].r[0], dy = balls[i].r[1] - balls[j].r[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                expect(d).toBeGreaterThan(2 * T.ball.R * 1.5);
            }
        }
    });
    it("같은 씨앗이면 같은 배치, 다른 씨앗이면 다른 배치", () => {
        expect(randomLayout("3c", T, 42)).toEqual(randomLayout("3c", T, 42));
        expect(randomLayout("3c", T, 42)).not.toEqual(randomLayout("3c", T, 43));
    });
});
