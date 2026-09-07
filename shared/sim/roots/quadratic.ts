/**
 * 2차 방정식 a t² + b t + c = 0 의 실근. 순수 산술만 쓴다.
 *
 * 안정한 공식: q = −½(b + sign(b)·√D) 로 두고 근을 q/a 와 c/q 로 구한다(Numerical Recipes 5.6).
 * −b ± √D 를 그대로 쓰면 |b| ≫ |ac| 일 때 한쪽 근이 자릿수를 잃는다(예: t² − (1e8+1e-8)t + 1).
 * pooltool ptmath/roots/quadratic.py 도 같은 부호 트릭 + 곱 항등식을 쓴다.
 */
import { isRealRoot, sortedAscending } from "./common.js";

/**
 * 실근만, 오름차순. 중근은 두 번 들어간다.
 * - a = 0 이면 1차로 강등: b ≠ 0 이면 [−c/b], b = 0 이면 [] (해가 없거나 무한).
 * - 판별식이 음수여도 반올림 수준이면(허부가 isRealRoot 기준 안) 중근 −b/2a 로 본다.
 */
export function solveQuadratic(a: number, b: number, c: number): number[] {
    if (a === 0) {
        if (b === 0) return [];
        return [-c / b];
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
        // 켤레 복소근 −b/2a ± i√(−D)/2|a|. 스치는 접촉(중근)이 반올림으로 살짝 음수가 된 경우만 살린다.
        const re = -b / (2 * a);
        const im = Math.sqrt(-disc) / (2 * Math.abs(a));
        return isRealRoot(re, im) ? [re, re] : [];
    }
    const sqrtD = Math.sqrt(disc);
    const q = b < 0 ? -0.5 * (b - sqrtD) : -0.5 * (b + sqrtD);
    if (q === 0) {
        // b = 0 이고 D = 0 → c = 0. 근은 0 (중근).
        return [0, 0];
    }
    return sortedAscending([q / a, c / q]);
}
