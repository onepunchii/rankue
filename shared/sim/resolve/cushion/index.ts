/**
 * 쿠션 충돌 모델 디스패치. 모델 id 는 params.ts 의 CushionModelId.
 *  - han2005         : 코 높이를 반영한 순간 임펄스 모델 (기본).
 *  - sphereHalfSpace : 수직 벽 근사, 가장 단순·빠름.
 *  - mathavan2010    : 임펄스 스텝 수치 모델 (정밀, 느림).
 */
import type { BallState, CushionSegment } from "../../types";
import type { BallParams, CushionModelId } from "../../params";
import { resolveCushionHan } from "./han2005";
import { resolveCushionSHS } from "./sphereHalfSpace";
import { resolveCushionMathavan } from "./mathavan2010";

export { resolveCushionHan, hanRegime, noseAngle } from "./han2005";
export type { HanRegime } from "./han2005";
export { resolveCushionSHS } from "./sphereHalfSpace";
export { resolveCushionMathavan } from "./mathavan2010";

export function resolveCushion(
    model: CushionModelId,
    b: BallState,
    seg: CushionSegment,
    p: BallParams,
    cushionHeight: number,
): BallState {
    switch (model) {
        case "han2005":
            return resolveCushionHan(b, seg, p, cushionHeight);
        case "sphereHalfSpace":
            return resolveCushionSHS(b, seg, p, cushionHeight);
        case "mathavan2010":
            return resolveCushionMathavan(b, seg, p, cushionHeight);
        default: {
            const never: never = model;
            throw new RangeError(`unknown cushion model: ${String(never)}`);
        }
    }
}
