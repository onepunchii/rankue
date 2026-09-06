/**
 * rng.ts — 시드 고정 의사난수 (mulberry32).
 *
 * README 절대 규칙 3: 이 폴더에서 Math.random 은 금지이고 난수는 여기 시드 PRNG 만 쓴다.
 * 테스트 픽스처(무작위 샷 1000개, golden 200개)가 같은 시드에서 같은 수열을 얻어야 어느 기기에서든
 * 같은 입력을 만든다. mulberry32 는 32비트 상태 하나와 정수 곱(Math.imul)·시프트·XOR 만 쓰므로
 * IEEE-754 나 libm 과 무관하게 모든 JS 엔진에서 비트 단위로 같다.
 *
 * 출처: Tommy Ettinger 의 mulberry32 (공개 도메인).
 */

/**
 * seed 로 초기화한 생성기. 호출마다 [0, 1) 의 double 을 돌려준다(2^32 개의 균등한 격자값).
 * seed 는 32비트 정수로 잘린다(>>> 0). 같은 seed → 같은 수열.
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** [lo, hi) 균등 실수. */
export function uniform(rnd: () => number, lo: number, hi: number): number {
    return lo + (hi - lo) * rnd();
}

/** [lo, hi] 균등 정수. */
export function uniformInt(rnd: () => number, lo: number, hi: number): number {
    return lo + Math.floor(rnd() * (hi - lo + 1));
}
