import { describe, expect, it } from "vitest";
import type { CushionModelId } from "../../params.js";
import { resolveCushion, resolveCushionHan, resolveCushionMathavan, resolveCushionSHS } from "./index.js";
import { H, LEFT, P, ball, deepFreeze, incidentVelocity, rad } from "./testHelpers.js";

const b = deepFreeze(ball(incidentVelocity(LEFT, 2, rad(30)), [10, -20, 60]));

describe("resolveCushion 디스패치", () => {
    it("han2005 → resolveCushionHan", () => {
        expect(resolveCushion("han2005", b, LEFT, P, H)).toEqual(resolveCushionHan(b, LEFT, P, H));
    });
    it("sphereHalfSpace → resolveCushionSHS", () => {
        expect(resolveCushion("sphereHalfSpace", b, LEFT, P, H)).toEqual(resolveCushionSHS(b, LEFT, P, H));
    });
    it("mathavan2010 → resolveCushionMathavan", () => {
        expect(resolveCushion("mathavan2010", b, LEFT, P, H)).toEqual(resolveCushionMathavan(b, LEFT, P, H));
    });
    it("모델별 결과가 서로 다르다(같은 함수로 라우팅되지 않았음)", () => {
        const han = resolveCushion("han2005", b, LEFT, P, H);
        const shs = resolveCushion("sphereHalfSpace", b, LEFT, P, H);
        expect(han.v).not.toEqual(shs.v);
    });
    it("모르는 모델 id 는 RangeError", () => {
        expect(() => resolveCushion("nope" as CushionModelId, b, LEFT, P, H)).toThrow(RangeError);
    });
    it("입력 불변", () => {
        const snap = JSON.stringify(b);
        resolveCushion("han2005", b, LEFT, P, H);
        resolveCushion("sphereHalfSpace", b, LEFT, P, H);
        expect(JSON.stringify(b)).toBe(snap);
    });
});
