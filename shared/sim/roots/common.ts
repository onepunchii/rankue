/**
 * 근 찾기 모듈들의 공용 상수·판정. 순수 산술만 쓴다.
 */

/** double 의 머신 엡실론 2^-52. */
export const MACHEPS = 2.2204460492503131e-16;

/**
 * 복소근 (re, im) 을 실근으로 볼지 판정. pooltool ptmath/roots/core.py `is_real_number` 의 이식.
 *
 * 충돌 감지용 기준이라 다소 느슨하다: 실부가 큰(|re| > cutoff) 근은 허부가 절대값으로 atol 미만이면 실근,
 * 실부가 작은 근은 허부가 실부의 rtol 배 미만이면 실근. 실부가 정확히 0 이면 허부도 0 이어야 한다.
 * 중근(스치는 접촉)이 반올림으로 허부 ~1e-12 짜리 켤레쌍으로 나올 때 이를 실근으로 살리기 위한 규칙이다.
 */
export function isRealRoot(
    re: number,
    im: number,
    absOrRelCutoff = 1e-3,
    rtol = 1e-3,
    atol = 1e-9,
): boolean {
    const imMag = Math.abs(im);
    const reMag = Math.abs(re);
    if (reMag > absOrRelCutoff) return imMag < atol;
    if (reMag > 0) return imMag / reMag < rtol;
    return imMag === 0;
}

/** 오름차순 정렬한 새 배열. 입력은 건드리지 않는다. NaN 은 제거한다. */
export function sortedAscending(roots: readonly number[]): number[] {
    const out = roots.filter((r) => r === r);
    out.sort((x, y) => x - y);
    return out;
}
