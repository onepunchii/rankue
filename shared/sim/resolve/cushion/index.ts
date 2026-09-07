/**
 * 쿠션 충돌 모델 디스패치. 모델 id 는 params.ts 의 CushionModelId.
 *  - han2005         : 코 높이를 반영한 순간 임펄스 모델 (기본, DEFAULT_PARAMS.cushionModel).
 *  - sphereHalfSpace : 수직 벽 근사, 가장 단순·빠름. 코 높이가 없어 탑스핀–반발속도 결합이 없다(구름 공과 스턴 공의
 *                      반발 속도비가 같음 — Mathavan 2010 Fig. 9 와 어긋남). 값싼 폴백일 뿐이며 **3쿠션 기본값으로 쓰지 말 것**.
 *  - mathavan2010    : 임펄스 스텝 수치 모델 (정밀, 느림). 에너지 반발 계수는 params.eE.
 *  공중의 공(airborne, v2.2)은 모델과 무관하게 sphereHalfSpace 3D — 무한 높이의 수직 벽, 자유 구 임펄스 전체, v_z 유지 —
 *  로 해석한다(세 함수 모두 첫 줄에서 위임). Han·Mathavan 은 슬레이트 반력(ż_G = 0, 테이블 접점 C)을 전제하므로 공중에서는
 *  정의되지 않는다. 한계: 레일을 넘어가는 점프, 코 위를 스치거나 코 밑으로 파고드는 접촉은 재현하지 않는다.
 */
import type { BallState, CushionSegment } from "../../types.js";
import type { BallParams, CushionModelId } from "../../params.js";
import { resolveCushionHan } from "./han2005.js";
import { resolveCushionSHS } from "./sphereHalfSpace.js";
import { resolveCushionMathavan } from "./mathavan2010.js";

export { resolveCushionHan, hanRegime, noseAngle } from "./han2005.js";
export type { HanRegime } from "./han2005.js";
export { resolveCushionSHS } from "./sphereHalfSpace.js";
export { resolveCushionMathavan } from "./mathavan2010.js";

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
